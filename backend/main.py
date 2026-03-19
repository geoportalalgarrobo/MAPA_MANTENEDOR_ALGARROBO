from fastapi import FastAPI, HTTPException, UploadFile, File, Response
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List
import json
import asyncio
import os
import glob
import logging
import tempfile
import shutil
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape, Point
from shapely import wkt
from concurrent.futures import ThreadPoolExecutor

# --- CONFIGURATION & LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("Geoportal")

app = FastAPI(title="Geoportal Chile API", version="2.0.2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000) # Compresión Gzip para JSON > 1KB

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_TILES = os.path.join(BASE_DIR, "..", "data_tiles")
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "frontend", "dist")
CONFIG_PATH = os.path.join(BASE_DIR, "layers_config.json")

# Helper to load config
def load_layers_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config: {e}")
    return {}

# Thread Pool for CPU intensive GIS tasks - Limited to 2 for Railway stability (OOM prevention)
executor = ThreadPoolExecutor(max_workers=2)

# --- MODELS ---
class GeoJSONPayload(BaseModel):
    type: str
    geometry: Dict[str, Any]
    properties: Dict[str, Any] = None

# --- UTILS ---
def safe_read_fgb(path: str, bbox=None):
    """Safely read a FlatGeobuf file with optional bbox filtering."""
    try:
        if not os.path.exists(path):
            logger.debug(f"FGB not found: {path}")
            return None
        logger.debug(f"Reading FGB: {os.path.basename(path)} bbox={bbox}")
        return gpd.read_file(path, bbox=bbox)
    except Exception as e:
        logger.error(f"Error reading FGB {path}: {e}")
        return None

# --- API ENDPOINTS ---

@app.get("/api/health")
async def health():
    fgb_files = glob.glob(os.path.join(DATA_TILES, "*.fgb"))
    return {
        "status": "online",
        "version": "2.0.0",
        "data_tiles_ready": os.path.exists(DATA_TILES),
        "layers_found": [os.path.basename(f) for f in fgb_files]
    }

@app.get("/api/layers")
async def list_layers():
    """Manifest of all layers with metadata and grouping."""
    config = load_layers_config()
    
    # Get available files
    fgb_files = glob.glob(os.path.join(DATA_TILES, "*.fgb"))
    available_ids = [os.path.splitext(os.path.basename(f))[0] for f in fgb_files if not f.endswith('.lowres.fgb')]
    
    # If no config, return flat list from files
    if not config:
        return {"layers": [{"id": lid} for lid in available_ids]}
    
    # Re-verify config layers actually exist in data_tiles
    verified_groups = []
    for g in config.get("groups", []):
        verified_layers = [l for l in g.get("layers", []) if l in available_ids]
        if verified_layers:
            verified_groups.append({**g, "layers": verified_layers})
            
    return {
        "groups": verified_groups,
        "layers": [{"id": lid} for lid in available_ids],
        "metadata": config.get("layer_metadata", {}),
        "display_order": config.get("display_order", []),
        "administrative_config": config.get("administrative_config", {})
    }

@app.get("/api/layers/{layer}.json")
async def get_layer_geojson(layer: str, lowres: bool = False):
    """
    Serves GeoJSON. 
    Use ?lowres=true for fast map visualization.
    """
    suffix = ".lowres.fgb" if lowres else ".fgb"
    fgb_path = os.path.join(DATA_TILES, f"{layer}{suffix}")
    
    # Fallback to standard if lowres requested but missing
    if lowres and not os.path.exists(fgb_path):
        fgb_path = os.path.join(DATA_TILES, f"{layer}.fgb")
    
    def fetch():
        try:
            gdf = safe_read_fgb(fgb_path)
            if gdf is None or gdf.empty:
                return None
                
            if gdf.crs != "EPSG:4326":
                gdf = gdf.to_crs(epsg=4326)
                
            return gdf.to_json(drop_id=True, na='null', show_bbox=False)
        except Exception as e:
            logger.error(f"Error processing layer {layer}: {e}")
            return None

    loop = asyncio.get_event_loop()
    try:
        geojson_data = await loop.run_in_executor(executor, fetch)
    except Exception as e:
        logger.error(f"Executor failed for {layer}: {e}")
        geojson_data = None
    
    if geojson_data is None or len(geojson_data) < 10:
        print(f"DEBUG: Layer {layer} returned empty or null data")
        return Response(content='{"type": "FeatureCollection", "features": []}', media_type="application/json")
        
    headers = {
        "Cache-Control": "public, max-age=86400", 
        "X-App-Version": "2.2.0-stable",
        "X-Debug-Layer": layer
    }
    return Response(content=geojson_data, media_type="application/json", headers=headers)

@app.get("/api/feature-info/{layer}/{lat}/{lon}")
async def get_feature_info(layer: str, lat: float, lon: float):
    """Point-in-polygon query to get all attributes of a feature at a location."""
    fgb_path = os.path.join(DATA_TILES, f"{layer}.fgb")
    p = Point(lon, lat)
    
    def query():
        # Optimization: use a very small bbox for the initial read
        margin = 0.0001
        bbox = (lon - margin, lat - margin, lon + margin, lat + margin)
        gdf = safe_read_fgb(fgb_path, bbox=bbox)
        if gdf is None or gdf.empty:
            return None
        
        # Exact intersection
        hit = gdf[gdf.intersects(p)]
        if hit.empty:
            return None
            
        data = hit.iloc[0].to_dict()
        if 'geometry' in data: del data['geometry']
        # Convert all values to strings for display safety
        return {str(k): (str(v) if v is not None else "") for k, v in data.items()}

    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(executor, query)
    if not info:
        raise HTTPException(status_code=404, detail="No feature found at this location")
    return info

@app.get("/api/proximidad/{lat}/{lon}")
async def get_proximity(lat: float, lon: float):
    """Calculates distance from a point to the nearest feature in all available layers."""
    p = Point(lon, lat)
    p_gdf = gpd.GeoDataFrame(geometry=[p], crs="EPSG:4326").to_crs(epsg=32719)
    p_utm = p_gdf.geometry.iloc[0]
    
    fgb_files = glob.glob(os.path.join(DATA_TILES, "*.fgb"))
    config = load_layers_config()
    
    # Extract administrative layer IDs from administrative_config
    admin_cfg = config.get("administrative_config", {}).get("levels", [])
    exclude = [level["id"] for level in admin_cfg]
    if not exclude:
        exclude = config.get("administrative_layers", ["regiones_simplified", "provincias_simplified", "comunas_simplified"])
        
    layers_to_check = [os.path.splitext(os.path.basename(f))[0] for f in fgb_files 
                       if os.path.splitext(os.path.basename(f))[0] not in exclude
                       and not f.endswith('.lowres.fgb')]

    def calculate_proximity():
        results = []
        for layer in layers_to_check:
            try:
                path = os.path.join(DATA_TILES, f"{layer}.fgb")
                # Optimization: Read a 10km bbox first to avoid loading everything
                margin = 0.1 # approx 10km
                bbox = (lon - margin, lat - margin, lon + margin, lat + margin)
                gdf = safe_read_fgb(path, bbox=bbox)
                
                # If nothing in 10km, try 50km
                if gdf is None or gdf.empty:
                    margin = 0.5 
                    bbox = (lon - margin, lat - margin, lon + margin, lat + margin)
                    gdf = safe_read_fgb(path, bbox=bbox)
                
                # Fallback to full read if still empty (maybe it's very sparse)
                if gdf is None or gdf.empty:
                    gdf = safe_read_fgb(path)

                if gdf is not None and not gdf.empty:
                    gdf_utm = gdf.to_crs(epsg=32719)
                    distances = gdf_utm.distance(p_utm)
                    min_dist = distances.min()
                    nearest_idx = distances.idxmin()
                    feature = gdf.iloc[nearest_idx]
                    
                    # Get a name for the nearest feature
                    name = "Sin nombre"
                    for field in ['nombre', 'name', 'Name', 'NOMBRE', 'nombreorig']:
                        if field in feature:
                            name = str(feature[field])
                            break

                    results.append({
                        "layer": layer,
                        "distance_m": round(min_dist, 2),
                        "feature_name": name,
                        "layer_display": layer.replace('_', ' ').title()
                    })
            except Exception as e:
                logger.error(f"Error in proximity for {layer}: {e}")
                continue
        
        return sorted(results, key=lambda x: x['distance_m'])

    loop = asyncio.get_event_loop()
    logger.info(f"Processing proximity request for coords: {lat}, {lon}")
    return await loop.run_in_executor(executor, calculate_proximity)

@app.post("/api/reporte-predio")
async def reporte_predio(payload: GeoJSONPayload):
    """Analyzes a drawn/uploaded polygon against all available FGB layers."""
    try:
        geom = shape(payload.geometry)
        if not geom.is_valid: geom = geom.buffer(0)
        
        config = load_layers_config()
        
        # Extract administrative layer IDs from administrative_config
        admin_cfg = config.get("administrative_config", {}).get("levels", [])
        admin_layers = [level["id"] for level in admin_cfg]
        if not admin_layers:
            admin_layers = config.get("administrative_layers", ["regiones_simplified", "provincias_simplified", "comunas_simplified"])
        
        fgb_files = glob.glob(os.path.join(DATA_TILES, "*.fgb"))
        # Exclude administrative layers from the "restrictions" list
        layers_to_check = [os.path.splitext(os.path.basename(f))[0] for f in fgb_files 
                           if os.path.splitext(os.path.basename(f))[0] not in admin_layers 
                           and not os.path.basename(f).endswith('.lowres.fgb')]

        def analyze():
            results = {}
            for layer in layers_to_check:
                try:
                    gdf = safe_read_fgb(path, bbox=geom.bounds)
                    if gdf is not None and not gdf.empty:
                        # Ensure CRS match for proper intersection (EPSG:4326)
                        if gdf.crs != "EPSG:4326" and gdf.crs is not None:
                            gdf = gdf.to_crs(epsg=4326)
                        
                        # Ensure valid geometries before intersection
                        gdf.geometry = gdf.geometry.buffer(0)
                        inter = gdf[gdf.intersects(geom)].copy()
                        if not inter.empty:
                            # Calculate area of intersection in Ha (UTM 19S)
                            try:
                                inter_geom = inter.intersection(geom)
                                area_inter = inter_geom.to_crs(epsg=32719).area / 10000.0
                                inter['area_interseccion_ha'] = area_inter
                            except Exception as calc_err:
                                logger.warning(f"Area calc failed for {layer}: {calc_err}")
                                inter['area_interseccion_ha'] = 0.0
                            
                            inter = inter.drop(columns=['geometry'], errors='ignore')
                            inter = inter.where(pd.notnull(inter), None)
                            results[layer] = inter.to_dict('records')
                except Exception as le:
                    logger.error(f"Error analyzing layer {layer}: {le}")
                    continue
            
            # Area Total
            total_area_ha = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:4326").to_crs(epsg=32719).area.iloc[0] / 10000.0
            
            # DPA Info based on Config
            dpa = {}
            admin_cfg = config.get("administrative_config", {}).get("levels", [])
            for level in admin_cfg:
                path = os.path.join(DATA_TILES, f"{level['id']}.fgb")
                dgdf = safe_read_fgb(path, bbox=geom.bounds)
                if dgdf is not None:
                    hits = dgdf[dgdf.intersects(geom)]
                    # Common name field variants
                    found = False
                    # Use targeted fields based on target_key to prevent e.g. "region" matching in "comunas" level
                    tgt = level['target_key'].lower()
                    expected = [tgt, tgt.upper(), 'nombre', 'Name', 'NAME']
                    for field in expected:
                        if field in hits.columns:
                            dpa[level['target_key']] = list(set(hits[field].astype(str).tolist()))
                            found = True
                            break
                    if not found:
                        for field in ['region', 'provincia', 'comuna', 'REGION', 'PROVINCIA', 'COMUNA']:
                            if field in hits.columns:
                                dpa[level['target_key']] = list(set(hits[field].astype(str).tolist()))
                                found = True
                                break
                    if not found: dpa[level['target_key']] = []
                else:
                    dpa[level['target_key']] = []

            return {
                "estado": "exito",
                "area_total_ha": round(total_area_ha, 2),
                "dpa": dpa,
                "restricciones": results
            }

        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(executor, analyze)
        return report
    except Exception as e:
        logger.error(f"Error in analyze: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/upload-predio")
async def upload_predio(file: UploadFile = File(...)):
    """Handles spatial file upload and returns it as GeoJSON."""
    suffix = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    def process():
        try:
            # Handle zips automatically with geopandas
            path = tmp_path if not tmp_path.endswith('.zip') else f"zip://{tmp_path}"
            gdf = gpd.read_file(path)
            gdf = gdf.dropna(subset=['geometry']).to_crs(epsg=4326)
            return json.loads(gdf.to_json())
        finally:
            if os.path.exists(tmp_path): os.remove(tmp_path)

    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, process)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- STATIC FILES ---
# Expose FGB files for direct "Reparto en Bicicleta" (Option 2)
if os.path.exists(DATA_TILES):
    app.mount("/api/raw-tiles", StaticFiles(directory=DATA_TILES), name="tiles")

if os.path.exists(FRONTEND_DIST):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIST), name="frontend")
    @app.get("/")
    async def root():
        return RedirectResponse(url="/static/index.html")
else:
    @app.get("/")
    async def root():
        return {"message": "Geoportal API v2.2.0 Online. Frontend not found in /dist."}
