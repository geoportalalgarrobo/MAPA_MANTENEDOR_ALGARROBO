# Deuda Técnica del Proyecto: Geoportal Chile

## Resumen Ejecutivo
El proyecto Geoportal Chile se encuentra en una fase funcional y operativa con una arquitectura basada en **FastAPI (Backend)** y **React (Frontend)**. Si bien el sistema es capaz de realizar análisis espaciales complejos y visualizaciones fluidas, presenta una estructura de "Single File" en el backend y un manejo de estado centralizado y saturado en el frontend. La falta total de pruebas automatizadas y un acoplamiento estrecho entre la lógica GIS y los controladores de API representan el riesgo principal para la escalabilidad.

- **Nivel estimado de deuda técnica:** Medio - Alto
- **Principales riesgos:** Regresiones por falta de tests, cuellos de botella en performance bajo alta concurrencia por el uso limitado de hilos, y dificultad de mantenimiento por archivos de código extensos (>300 líneas).

## Tabla de Prioridades
| ID | Problema | Severidad | Impacto | Esfuerzo | Prioridad |
|----|----------|----------|--------|----------|----------|
| DT-01 | Arquitectura Monolítica de Archivo (main.py) | Alta | Alto | Medio | **CRÍTICA** |
| DT-02 | Ausencia Total de Pruebas Automatizadas | Alta | Crítico | Alto | **ALTA** |
| DT-03 | Manejo de Estado en Frontend (App.jsx) | Media | Medio | Medio | **MEDIA** |
| DT-04 | CORS Permitivo (Wildcard) | Crítica | Alto | Bajo | **CRÍTICA** |
| DT-05 | Lógica GIS no abstraída (Service Layer) | Media | Medio | Medio | **MEDIA** |
| DT-06 | Falta de Caché en Intersecciones | Baja | Alto | Medio | **BAJA** |
| DT-07 | Gestión de Dependencias (No Lockfile) | Baja | Bajo | Bajo | **BAJA** |

## Detalle de Problemas

### [DT-01] Arquitectura Monolítica de Archivo (main.py)
- **Descripción:** `main.py` actúa como "God Object". Contiene definiciones de API, configuración de CORS, montaje de archivos estáticos, lógica de análisis espacial y utilidades de archivos.
- **Ubicación:** `backend/main.py`
- **Impacto:** Dificulta la lectura, las pruebas unitarias y favorece la aparición de efectos secundarios al modificar rutas de API.
- **Severidad:** Alta
- **Esfuerzo estimado:** Medio
- **Recomendación:** Implementar `APIRouter` de FastAPI para separar responsabilidades en `/routes`, `/services` y `/core`.

### [DT-02] Ausencia Total de Pruebas Automatizadas
- **Descripción:** El proyecto no cuenta con una suite de pruebas (Pytest / Vitest).
- **Ubicación:** Todo el proyecto.
- **Impacto:** Riesgo extremo de regresiones al realizar refactors o actualizaciones de dependencias críticas como `geopandas` o `shapely`.
- **Severidad:** Alta
- **Esfuerzo estimado:** Alto
- **Recomendación:** Configurar Pytest en backend para validar geometrías y Vitest en frontend para componentes UI.

### [DT-03] Manejo de Estado en Frontend (App.jsx)
- **Descripción:** `App.jsx` gestiona más de 15 estados diferentes (capas, resultados, proximidad, carga, errores, etc.).
- **Ubicación:** `frontend/src/App.jsx`
- **Impacto:** Prop drilling excesivo y dificultad para rastrear cambios de estado en componentes profundos.
- **Severidad:** Media
- **Esfuerzo estimado:** Medio
- **Recomendación:** Migrar el estado global a un store ligero como **Zustand** o usar **React Context API**.

### [DT-04] CORS Permitivo (Wildcard)
- **Descripción:** Se utiliza `allow_origins=["*"]` en la configuración de middleware.
- **Ubicación:** `backend/main.py:29`
- **Impacto:** Vulnerabilidad de seguridad que permite a cualquier dominio realizar peticiones a la API del proyecto.
- **Severidad:** Crítica
- **Esfuerzo estimado:** Bajo
- **Recomendación:** Restringir los orígenes a una lista blanca definida en variables de entorno.

### [DT-05] Lógica GIS no abstraída (Service Layer)
- **Descripción:** La lógica de cálculo de áreas y sincronización de CRS está mezclada con la respuesta HTTP.
- **Ubicación:** `backend/main.py` (Endpoints `/reporte-predio` y `/proximidad`).
- **Impacto:** No se puede reutilizar la lógica de análisis en tareas programadas (celery/cron) o scripts CLI.
- **Severidad:** Media
- **Esfuerzo estimado:** Medio
- **Recomendación:** Mover la lógica de `reporte_predio` a una clase de servicio independiente.

### [DT-06] Falta de Caché en Intersecciones
- **Descripción:** Cada vez que se consulta un polígono, se vuelven a leer los FGB y a computar las áreas.
- **Ubicación:** `backend/main.py`
- **Impacto:** Ineficiencia computacional y latencia alta para el usuario si se consulta el mismo terreno repetidamente.
- **Severidad:** Baja
- **Esfuerzo estimado:** Medio
- **Recomendación:** Implementar **LRU Cache** o **Redis** para almacenar resultados de geometrías (WKT/Hash) recientemente consultadas.

## Quick Wins
1. **DT-04**: Limitar CORS a dominios conocidos. (15 min)
2. **Modularizar main.py**: Extraer funciones de utilidad a `utils.py`. (1 hora)
3. **Pinear Dependencias**: Generar un `requirements.txt` con versiones específicas (Hecho en auditoría previa).

## Riesgos Críticos
1. **Desbordamiento de Memoria (OOM)**: Peticiones con polígonos extremadamente complejos a `/reporte-predio` pueden agotar los 512MB/1GB estándar de Railway debido a que Geopandas carga el GDF en memoria.
2. **Inconsistencia de Datos**: Si el servidor paralelo de mapas actualiza los FGB durante un análisis largo, podría haber estados corruptos por lectura/escritura concurrente sin bloqueos de archivo.

## Recomendaciones Estratégicas
- **Migración a PostGIS**: Si el volumen de usuarios o capas crece, el uso de archivos FGB será ineficiente frente a una base de datos espacial real con indexación GiST optimizada.
- **Adoptar TypeScript**: Dado que el frontend maneja objetos GeoJSON complejos, TypeScript reduciría drásticamente los errores de "undefined" al acceder a propiedades de capas.

## Métricas Estimadas
- **Complejidad Ciclomática (main.py):** Alta (~25-30 en la función de análisis).
- **Cobertura de Tests:** 0%.
- **Nivel de Acoplamiento:** Fuerte (Frontend-Backend mediante rutas hardcodeadas).
