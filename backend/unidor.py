import os
import glob

def unir_db():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # La DB se encuentra en ../db/geoportal.sqlite (cuando se ejecuta desde backend/)
    target_path = os.path.abspath(os.path.join(base_dir, '..', 'db', 'geoportal.sqlite'))
    db_dir = os.path.dirname(target_path)
    
    parts = sorted(glob.glob(f"{target_path}.part*"), key=lambda x: int(x.split('part')[-1]) if 'part' in x else 0)
    
    if not parts:
        if os.path.exists(target_path):
            return # Silencioso si ya existe
        else:
            print("[UNIDOR] No se encontraron partes para unir.")
            return

    print(f"[UNIDOR] Uniendo {len(parts)} partes para crear {target_path}...")
    
    with open(target_path, 'wb') as output_file:
        for part in parts:
            print(f"  Procesando {os.path.basename(part)}...")
            with open(part, 'rb') as chunk:
                output_file.write(chunk.read())
            # Eliminar la parte después de unir para ahorrar espacio en Docker
            os.remove(part) 

    print("[UNIDOR] Proceso completado exitosamente.")

if __name__ == "__main__":
    unir_db()
