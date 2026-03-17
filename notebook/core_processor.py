import os
import sqlite3
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

class GeospatialDBManager:
    """
    Clase modular para gestionar la base de datos espacial (SpatiaLite) y 
    la ingesta de datos desde diferentes formatos geográficos.
    """
    
    def __init__(self, db_path):
        self.db_path = db_path
        self._ensure_db_directory()
        self.conn = None

    def _ensure_db_directory(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    def connect(self):
        """Establece conexión y habilita SpatiaLite."""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.enable_load_extension(True)
        self._load_spatialite()
        return self.conn

    def _load_spatialite(self):
        """Intenta cargar la extensión SpatiaLite de forma robusta."""
        extensions = ['mod_spatialite', 'mod_spatialite.dll', 'spatialite']
        for ext in extensions:
            try:
                self.conn.load_extension(ext)
                print(f"[DB] Extensión '{ext}' cargada con éxito.")
                # Inicializar metadata si es necesario
                try:
                    self.conn.execute("SELECT InitSpatialMetadata(1);")
                except:
                    pass
                
                # Crear tabla de catálogo de capas reales para el frontend
                self.conn.execute("""
                    CREATE TABLE IF NOT EXISTS layers_metadata (
                        id TEXT PRIMARY KEY,
                        display_name TEXT,
                        type TEXT, -- 'vector', 'pmtiles', 'raster'
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                self.conn.commit()
                return
            except sqlite3.OperationalError:
                continue
        print("[WARNING] No se pudo cargar SpatiaLite. Las funciones espaciales SQL podrían no estar disponibles.")

    def close(self):
        if self.conn:
            self.conn.close()

    def process_file(self, file_path, table_name, layer=None, simplify_tolerance=None):
        """
        Procesa archivos geográficos (Shapefile, GeoJSON, KML, GML, etc.) 
        y los inserta en la base de datos.
        """
        print(f" -> Procesando '{file_path}' hacia tabla '{table_name}'...")
        
        try:
            # Leer datos con GeoPandas (soporta la mayoría de formatos vectoriales)
            gdf = gpd.read_file(file_path, layer=layer) if layer else gpd.read_file(file_path)
            
            if gdf.empty:
                print(f" [!] El archivo {file_path} está vacío.")
                return False

            # Normalizar nombres de columnas a minúsculas
            gdf.columns = [str(c).lower() for c in gdf.columns]
            
            # Limpiar geometrías
            gdf.geometry = gdf.geometry.buffer(0)
            gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty]
            
            # Reproyectar a WGS84 (EPSG:4326) si no lo está
            if gdf.crs and gdf.crs.to_string() != 'EPSG:4326':
                gdf = gdf.to_crs(epsg=4326)
            elif not gdf.crs:
                gdf.set_crs(epsg=4326, inplace=True)

            # Simplificación opcional
            if simplify_tolerance:
                print(f"    Simplificando con tolerancia: {simplify_tolerance}")
                gdf.geometry = gdf.geometry.simplify(simplify_tolerance, preserve_topology=True)

            # Limpiar tipos de datos para SQLite
            for col in gdf.columns:
                if col != 'geometry':
                    gdf[col] = gdf[col].astype(str).replace(['nan', 'None', '<NA>', 'NaN'], '')

            # Guardar en la DB
            # Usamos to_file con driver SQLite y spatialite=True
            gdf.to_file(self.db_path, driver='SQLite', spatialite=True, layer=table_name)
            
            # Registrar en el catálogo de capas
            self.conn.execute("""
                INSERT OR REPLACE INTO layers_metadata (id, display_name, type)
                VALUES (?, ?, ?)
            """, (table_name, table_name.replace('_', ' ').title(), 'vector'))
            self.conn.commit()

            print(f" [OK] {len(gdf)} registros exportados a '{table_name}'.")
            return True

        except Exception as e:
            print(f" [ERROR] Falló el procesamiento de {file_path}: {e}")
            return False

    def process_pmtiles(self, file_path, table_name):
        """
        Para archivos PMTiles (tiles vectoriales empaquetados), no se insertan 
        los datos en tablas de SQLite, sino que se registra su ubicación y 
        metadatos básicos para que el frontend/servidor sepa cómo servirlos.
        """
        print(f" -> Registrando PMTiles: '{file_path}'...")
        try:
            # Crear tabla de catálogo si no existe
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS pmtiles_catalog (
                    name TEXT PRIMARY KEY,
                    path TEXT,
                    size_bytes INTEGER
                )
            """)
            
            size = os.path.getsize(file_path)
            # Guardamos la ruta relativa al proyecto para portabilidad
            relative_path = os.path.relpath(file_path, os.path.dirname(self.db_path))
            
            self.conn.execute("""
                INSERT OR REPLACE INTO pmtiles_catalog (name, path, size_bytes)
                VALUES (?, ?, ?)
            """, (table_name, relative_path, size))
            
            # También al catálogo general de capas
            self.conn.execute("""
                INSERT OR REPLACE INTO layers_metadata (id, display_name, type)
                VALUES (?, ?, ?)
            """, (table_name, table_name.replace('_', ' ').title(), 'pmtiles'))

            self.conn.commit()
            print(f" [OK] PMTiles '{table_name}' registrado en el catálogo.")
            return True
        except Exception as e:
            print(f" [ERROR] No se pudo registrar PMTiles {file_path}: {e}")
            return False

    def load_raster_reference(self, raster_path, table_name):
        """
        Para Raster, usualmente no se guardan en SQLite directamente, 
        sino que se guarda su metadato y ruta para procesamiento externo.
        """
        # Implementación mínima de ejemplo
        print(f" -> Registrando referencia de Raster: {raster_path}")
        # Aquí se podría usar rasterio para extraer el bounding box y guardarlo como polígono
        pass
