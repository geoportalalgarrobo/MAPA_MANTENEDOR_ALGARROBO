"""
Ejecución dinámica para el Científico de Datos (VERSIÓN 2 - FlatGeobuf).
Este script lanza el procesamiento de capas en data_raw para generar archivos .fgb y el catálogo layers.json.
"""
import os
import sys

# Asegurar que se puede importar el procesador desde la carpeta actual
SELF_DIR = os.path.dirname(os.path.abspath(__file__))
if SELF_DIR not in sys.path:
    sys.path.append(SELF_DIR)

try:
    from core_processor2 import process_data
except ImportError:
    # Fallback si se corre desde la raíz del proyecto
    sys.path.append(os.path.join(os.getcwd(), 'notebook'))
    from core_processor2 import process_data

def main():
    print("=== Iniciando Ejecución 2: Generación de FlatGeobuf y Catálogo ===", flush=True)
    try:
        process_data()
        print("=== Proceso completado exitosamente ===", flush=True)
    except Exception as e:
        print(f"=== ERROR durante la ejecución: {e} ===", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
