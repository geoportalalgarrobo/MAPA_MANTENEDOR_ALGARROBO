"""
Ejecución dinámica para el Científico de Datos (VERSIÓN SINCRONIZADA).
Este script garantiza que la Base de Datos sea un reflejo EXACTO de la carpeta data_raw.
"""
import os
import glob
import sys
import shutil

# 1. Configuración de la ruta base del proyecto (Auto-detectada)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 2. Cargar core_processor desde la ruta específica
sys.path.append(os.path.join(BASE_DIR, 'notebook'))
from core_processor import GeospatialDBManager

# 3. Configuración de rutas de datos
DATA_RAW = os.path.join(BASE_DIR, 'data_raw')
PMTILES_DIR = os.path.join(BASE_DIR, 'pmtiles')
DB_OUTPUT = os.path.join(BASE_DIR, 'db', 'geoportal.sqlite')

# Extensiones geográficas para la Base de Datos (Tabular/Geom)
EXT_VECTORIALES = ['*.json', '*.geojson', '*.shp', '*.kml', '*.gpkg', '*.gml', '*.tab', '*.filegdb']
# Extensión para el Catálogo de Teselas
EXT_TILES = ['*.pmtiles']

def obtener_nombre_tabla(file_path):
    """Genera un nombre de tabla válido a partir del nombre del archivo."""
    base_name = os.path.basename(file_path)
    clean_name = os.path.splitext(base_name)[0].lower()
    # Reemplazar caracteres no válidos para SQL
    clean_name = clean_name.replace(' ', '_').replace('-', '_').replace('.', '_')
    return clean_name

def main():
    print(f"=== INICIANDO SINCRONIZACIÓN LIMPIA ===")
    
    # 0. LIMPIEZA TOTAL: Borrar DB y partes para empezar de cero
    # Esto garantiza que si borras un archivo en data_raw, desaparezca del portal.
    CHUNKS_DIR = os.path.dirname(DB_OUTPUT)
    if os.path.exists(DB_OUTPUT):
        os.remove(DB_OUTPUT)
    for p in glob.glob(os.path.join(CHUNKS_DIR, "*.part*")):
        os.remove(p)
    print("[OK] Base de datos previa eliminada (Sincronización Total activada).")

    # 1. Inicializar el manejador (creará una base de datos nueva y limpia)
    db = GeospatialDBManager(DB_OUTPUT)
    db.connect()
    
    print(f"\n=== Escaneando {DATA_RAW} para Ingesta SQL ===")
    vectoriales = []
    for ext in EXT_VECTORIALES:
        vectoriales.extend(glob.glob(os.path.join(DATA_RAW, "**", ext), recursive=True))
    
    print(f"=== Escaneando {PMTILES_DIR} para Catálogo de Tiles ===")
    tiles = []
    for ext in EXT_TILES:
        tiles.extend(glob.glob(os.path.join(PMTILES_DIR, "**", ext), recursive=True))

    total_archivos = len(vectoriales) + len(tiles)
    if total_archivos == 0:
        print("No se encontraron archivos para procesar.")
        db.close()
        return

    print(f"Se encontraron {len(vectoriales)} archivos vectoriales y {len(tiles)} archivos de tiles.\n")

    # 3. Procesamiento en lote
    exitos = 0
    errores = 0

    # Procesar Vectoriales (Hacia SQL)
    for path in vectoriales:
        tabla = obtener_nombre_tabla(path)
        # No simplificar por defecto a menos que el nombre lo pida explícitamente
        tolerancia = 0.001 if "simplified" in path.lower() or "regional" in path.lower() else None
        if db.process_file(path, tabla, simplify_tolerance=tolerancia):
            exitos += 1
        else:
            errores += 1

    # Procesar Tiles (Hacia Catálogo)
    for path in tiles:
        tabla = obtener_nombre_tabla(path)
        if db.process_pmtiles(path, tabla):
            exitos += 1
        else:
            errores += 1
    
    db.close()

    print(f"\n[FIN DE TAREA] Procesados: {exitos} | Fallidos: {errores}")
    print(f"Base de datos final: {DB_OUTPUT}")
    
    # --- DIVISIÖN EN PARTES DE 80MB ---
    CHUNK_SIZE = 80 * 1024 * 1024 # 80MB
    
    print(f"\n=== DIVIDIENDO DB EN PARTES PARA DESPLIEGUE ===")
    part_num = 0
    if os.path.exists(DB_OUTPUT):
        with open(DB_OUTPUT, 'rb') as f:
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                part_name = f"{DB_OUTPUT}.part{part_num}"
                with open(part_name, 'wb') as chunk_file:
                    chunk_file.write(chunk)
                print(f"Creado: {os.path.basename(part_name)}")
                part_num += 1
        
        # Opcional: Eliminar el archivo original localmente si prefieres trabajar solo con partes
        # os.remove(DB_OUTPUT)
        # print(f"\n[OK] Archivo original eliminado. Solo quedan las partes lista para GIT.")
        
    print(f"\nSincronización completa. {part_num} partes generadas.")

if __name__ == "__main__":
    main()
