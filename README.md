# Geoportal Chile: Sistema de Soporte de Decisiones Territoriales

Este proyecto es un geoportal ligero basado en FastAPI, DuckDB, y SpatiaLite. Permite evaluar las restricciones territoriales interactuando sobre un mapa web.

## Estructura

- `etl/`: Pipeline en Python y DuckDB para generar y procesar las capas vectoriales, construyendo la base de datos `chile_territorial.sqlite`.
- `backend/`: API en FastAPI que responde a las consultas espaciales simultáneas utilizando SpatiaLite y modo WAL.
- `frontend/`: Aplicación web Vanilla JS con Leaflet.js para que el usuario dibuje un polígono a consultar y reciba el resultado analizado.
- `data/`: Almacenamiento local de la base de datos generada (ej: `chile_territorial.sqlite`).

## Requisitos de Instalación (Windows / General)

Para usar SpatiaLite desde Python, necesitas la extensión binaria `mod_spatialite`.
1. Clona el proyecto.
2. Crea tu entorno virtual: `python -m venv venv`
3. Activa: `venv\Scripts\activate` (Windows) o `source venv/bin/activate` (Linux/Mac).
4. Instala las dependencias: `pip install -r requirements.txt`.

### Instalar explícitamente `mod_spatialite`
- **En Windows:** Puedes descargar los binarios precompilados de SpatiaLite o asegurar que el Python que utilizas tiene la extensión disponible a través del entorno conda, e.g., instalando `conda install -c conda-forge markupsafe fastapi uvicorn geopandas duckdb mod_spatialite` si quieres evitar descargar la DLL manualmente.
- Por defecto con `geopandas`/`fiona` usando wheels o Conda muchas herramientas espaciales ya incluyen las DLL de geoprocesamiento o pueden descargarse desde [https://www.gaia-gis.it/gaia-sins/](https://www.gaia-gis.it/gaia-sins/).

## Ejecutar

**1. Procesar datos (ETL):**
```bash
python etl/pipeline_chile.py
```

**2. Levantar servidor local (Backend):**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**3. Navegador (Frontend):**
Abre `frontend/index.html` en tu navegador o levanta un servidor estático simple (`python -m http.server 8080`) para consumir el dashboard.
