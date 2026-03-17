# Geoportal Chile Startup
import uvicorn
import os
import logging

logging.basicConfig(level=logging.INFO)

from backend.unidor import unir_db

def main():
    port = int(os.environ.get("PORT", 8080))
    print(f"\n🚀 GEOPORTAL v2.2.0 STARTUP")
    
    # Asegurar base de datos integrada
    try:
        unir_db()
    except Exception as e:
        print(f"⚠️ Error al unir base de datos (puede no ser necesaria): {e}")
        
    print(f"🌍 PORT: {port}")
    
    # Run uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )

if __name__ == "__main__":
    main()
