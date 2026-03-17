import os
import glob
import geopandas as gpd
import logging
import json
import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def process_data():
    # PATHS dinámicos para local y Docker
    SELF_DIR = os.path.dirname(os.path.abspath(__file__))
    ROOT_DIR = os.path.dirname(SELF_DIR)
    DATA_RAW = os.path.join(ROOT_DIR, 'data_raw')
    DATA_TILES = os.path.join(ROOT_DIR, 'data_tiles')
    
    os.makedirs(DATA_TILES, exist_ok=True)
    
    # Catálogo de metadatos
    catalog = {
        "last_update": datetime.datetime.now().isoformat(),
        "layers": []
    }
    
    # Soportar varios formatos
    extensions = ['*.shp', '*.zip', '*.kml', '*.geojson', '*.json', '*.gpkg']
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(DATA_RAW, ext)))
    
    logging.info(f"Encontrados {len(files)} archivos en data_raw")
    
    for file_path in files:
        layer_name = os.path.splitext(os.path.basename(file_path))[0].lower().replace(" ", "_").replace(".", "_")
        logging.info(f"Procesando capa: {layer_name}...")
        
        try:
            # 1. Leer con GeoPandas
            read_path = file_path if not file_path.endswith('.zip') else f"zip://{file_path}"
            gdf = gpd.read_file(read_path)
            
            if gdf.empty:
                logging.warning(f"Capa {layer_name} está vacía. Saltando.")
                continue
                
            # Forzar WGS84 para compatibilidad con MapLibre
            if gdf.crs is None or gdf.crs.to_epsg() != 4326:
                gdf = gdf.to_crs(epsg=4326)
            
            # 1.5. OPTIMIZACIÓN AGRESIVA (Rec. 1, 4, 7)
            logging.info(f"  Detectando topología y simplificando...")
            gdf['geometry'] = gdf['geometry'].make_valid()
            
            # Simplificar según escala (preservando topología básica)
            # 0.0001 (aprox 10m) es un buen balance para visualización web
            gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.0001, preserve_topology=True)
            
            # Limpiar nombres de columnas y filtrar solo geometría válida
            gdf = gdf[gdf.geometry.notnull()]
            gdf.columns = [str(c).lower().replace(" ", "_") for c in gdf.columns]
            
            # 2. Guardar FlatGeobuf (FGB)
            # Versión Standard
            fgb_path = os.path.join(DATA_TILES, f"{layer_name}.fgb")
            gdf.to_file(fgb_path, driver='FlatGeobuf')
            
            # Versión LOW_RES para carga rápida (Rec 16)
            lowres_path = os.path.join(DATA_TILES, f"{layer_name}.lowres.fgb")
            gdf_low = gdf.copy()
            gdf_low['geometry'] = gdf_low['geometry'].simplify(tolerance=0.005, preserve_topology=True)
            gdf_low.to_file(lowres_path, driver='FlatGeobuf')
            
            logging.info(f"  [OK] Guardadas versiones Standard y LowRes para: {layer_name}")

            # Añadir al catálogo
            catalog["layers"].append({
                "id": layer_name,
                "file": os.path.basename(file_path),
                "fgb": f"{layer_name}.fgb",
                "fgb_lowres": f"{layer_name}.lowres.fgb",
                "feature_count": len(gdf),
                "attributes": [str(c) for c in gdf.columns if c != 'geometry']
            })

        except Exception as e:
            logging.error(f"Error crítico en capa {layer_name}: {e}")

    # Guardar catálogo final
    layers_json_path = os.path.join(DATA_TILES, 'layers.json')
    with open(layers_json_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=4, ensure_ascii=False)
    logging.info(f"=== Catálogo generado exitosamente en: {layers_json_path} ===")

if __name__ == "__main__":
    process_data()
