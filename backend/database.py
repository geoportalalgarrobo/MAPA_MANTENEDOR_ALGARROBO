import os
import sqlite3

# Database path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_default_db = os.path.abspath(os.path.join(BASE_DIR, '..', 'db', 'geoportal.sqlite'))
DATABASE_PATH = os.environ.get('DATABASE_PATH', _default_db)
if os.path.exists(DATABASE_PATH):
    print(f"[DB] Initializing. File size: {os.path.getsize(DATABASE_PATH)/1024/1024:.1f} MB")
else:
    print(f"[DB] Database file not found yet at {DATABASE_PATH}. Waiting for startup joiner...")

def get_db_connection():
    """Establece una conexión a SpatiaLite asegurando WAL y extensión cargada."""
    # check_same_thread=False en sqlite3 permite usar la conexión en async context,
    # aunque con FastAPI y operaciones read-only concurrentes es seguro.
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    
    # Habilitamos carga de extensiones
    conn.enable_load_extension(True)
    
    # Intentar carga estándar de mod_spatialite
    try:
        conn.load_extension('mod_spatialite')
    except sqlite3.OperationalError:
        try:
            conn.load_extension('mod_spatialite.dll')
        except sqlite3.OperationalError:
            # En modo GeoPandas, no es fatal si SQL no carga la extensión
            pass
            
    # Configuración WAL
    conn.execute('PRAGMA journal_mode=WAL;')
    conn.row_factory = sqlite3.Row
    return conn
