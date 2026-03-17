import React, { forwardRef, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson';

const MapComponent = forwardRef(({ onAnalyzePolygon, isAnalyzing, activeLayers, mapStyle, results, onMapReady, availableLayers = [], onProximityPoint, activeDrawMode }, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const proximityMarker = useRef(null);
    const [mapLoaded, setMapLoaded] = React.useState(false);

    const LAYER_COLORS = {
        areas_protegidas:            '#60a5fa',
        sitios_prioritarios:         '#c084fc',
        ecosistemas:                 '#4ade80',
        ecosistemas_multipart:       '#22c55e',
        ecmpo:                       '#fb7185',
        concesiones_acuicultura:     '#22d3ee',
        concesiones_mineras_const:   '#fbbf24',
        concesiones_mineras_tramite: '#f59e0b',
        comunas_simplified:          '#94a3b8',
        provincias_simplified:       '#64748b',
        regiones_simplified:         '#475569',
        terrenos:                    '#34d399',
    };
    const getLayerColor = (id) => LAYER_COLORS[id] || '#94a3b8';

    const activeDrawModeRef = useRef(activeDrawMode);
    useEffect(() => { activeDrawModeRef.current = activeDrawMode; }, [activeDrawMode]);

    const getLayerDisplayName = (id) => {
        const names = {
            areas_protegidas: "Áreas Protegidas",
            sitios_prioritarios: "Sitios Prioritarios",
            ecosistemas: "Ecosistemas",
            terrenos: "Terrenos Analizados",
            regiones_simplified: "Límites Regionales",
            provincias_simplified: "Límites Provinciales",
            comunas_simplified: "Límites Comunales",
            concesiones_mineras_const: "Catastro Minero Constituidas",
            concesiones_mineras_tramite: "Catastro Minero en Trámite",
            ecmpo: "ECMPO"
        };
        return names[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    useImperativeHandle(ref, () => ({
        clearDrawings() { 
            if (draw.current) draw.current.deleteAll(); 
            if (proximityMarker.current) { proximityMarker.current.remove(); proximityMarker.current = null; }
        },
        startDrawing(mode = 'draw_polygon') {
            if (draw.current) {
                if (proximityMarker.current) { proximityMarker.current.remove(); proximityMarker.current = null; }
                if (mode === 'proximity_point' || mode === 'simple_select') {
                    draw.current.changeMode('simple_select');
                } else {
                    draw.current.changeMode(mode);
                }
                map.current.getCanvas().style.cursor = 'crosshair';
            }
        },
        addFeatures(fc) {
            if (draw.current) {
                draw.current.add(fc);
                const bounds = new maplibregl.LngLatBounds();
                fc.features.forEach(f => {
                    if (f.geometry.type === 'Point') bounds.extend(f.geometry.coordinates);
                    else if (f.geometry.type === 'Polygon') f.geometry.coordinates[0].forEach(c => bounds.extend(c));
                    else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(p => p[0].forEach(c => bounds.extend(c)));
                });
                if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
            }
        }
    }));

    const handleDrawEvent = useCallback((e) => {
        const data = draw.current.getAll();
        if (data.features.length > 0) {
            const feature = (e.features && e.features.length > 0) ? e.features[0] : data.features[data.features.length - 1];
            onAnalyzePolygon(feature);
        } else {
            onAnalyzePolygon(null);
        }
    }, [onAnalyzePolygon]);

    // 1. INITIALIZE MAP
    useEffect(() => {
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {
                    'carto-dark': { type: 'raster', tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"], tileSize: 256 },
                    'carto-light': { type: 'raster', tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"], tileSize: 256 },
                    'esri-satellite': { type: 'raster', tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 },
                    'terrenos-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
                },
                layers: [
                    { id: 'base-map', type: 'raster', source: 'carto-dark', layout: { visibility: mapStyle === 'dark' ? 'visible' : 'none' } },
                    { id: 'base-map-light', type: 'raster', source: 'carto-light', layout: { visibility: mapStyle === 'light' ? 'visible' : 'none' } },
                    { id: 'base-map-satellite', type: 'raster', source: 'esri-satellite', layout: { visibility: mapStyle === 'satellite' ? 'visible' : 'none' } },
                    { id: 'terrenos-fill', type: 'fill', source: 'terrenos-source', paint: { 'fill-color': '#10b981', 'fill-opacity': 0.4 } },
                    { id: 'terrenos-line', type: 'line', source: 'terrenos-source', paint: { 'line-color': '#059669', 'line-width': 2 } }
                ]
            },
            center: [-73.0, -42.0],
            zoom: 7
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        draw.current = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                polygon: true,
                trash: true
            },
            defaultMode: 'simple_select',
            styles: [
                // PLOT STYLES - Blue theme for active drawing
                {
                    'id': 'gl-draw-polygon-fill-inactive',
                    'type': 'fill',
                    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                    'paint': { 'fill-color': '#3b82f6', 'fill-outline-color': '#3b82f6', 'fill-opacity': 0.1 }
                },
                {
                    'id': 'gl-draw-polygon-stroke-inactive',
                    'type': 'line',
                    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                    'layout': { 'line-cap': 'round', 'line-join': 'round' },
                    'paint': { 'line-color': '#3b82f6', 'line-width': 2 }
                },
                {
                    'id': 'gl-draw-polygon-fill-active',
                    'type': 'fill',
                    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                    'paint': { 'fill-color': '#f97316', 'fill-outline-color': '#f97316', 'fill-opacity': 0.1 }
                },
                {
                    'id': 'gl-draw-polygon-stroke-active',
                    'type': 'line',
                    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                    'layout': { 'line-cap': 'round', 'line-join': 'round' },
                    'paint': { 'line-color': '#f97316', 'line-dasharray': [0.2, 2], 'line-width': 2 }
                },
                {
                    'id': 'gl-draw-polygon-and-line-vertex-active',
                    'type': 'circle',
                    'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                    'paint': { 'circle-radius': 5, 'circle-color': '#f97316' }
                }
            ]
        });

        map.current.addControl(draw.current, 'top-right');
        map.current.on('draw.create', handleDrawEvent);
        map.current.on('draw.update', handleDrawEvent);
        map.current.on('draw.delete', () => onAnalyzePolygon(null));

        map.current.on('load', () => {
            setMapLoaded(true);
            if (onMapReady) onMapReady();
        });

        // Click handler for dynamic layers
        map.current.on('click', async (e) => {
            if (availableLayers.length === 0) return;

            const layerIds = availableLayers.flatMap(id => [`${id}-fill`]);

            if (activeDrawModeRef.current === 'proximity_point') {
                const { lat, lng } = e.lngLat;
                onProximityPoint(lat, lng);
                
                if (proximityMarker.current) proximityMarker.current.remove();
                
                proximityMarker.current = new maplibregl.Marker({ color: '#f97316' })
                    .setLngLat([lng, lat])
                    .addTo(map.current);
                return;
            }

            const features = map.current.queryRenderedFeatures(e.point, { layers: layerIds });

            if (features.length > 0) {
                const feature = features[0];
                const layerId = feature.layer.id.replace('-fill', '');
                const { lat, lng } = e.lngLat;

                try {
                    const response = await fetch(`/api/feature-info/${layerId}/${lat}/${lng}`);
                    if (response.ok) {
                        const text = await response.text();
                        if (!text) return;
                        const data = JSON.parse(text);
                        new maplibregl.Popup()
                            .setLngLat(e.lngLat)
                            .setHTML(`
                                <div class="p-2 text-slate-900 font-sans">
                                    <h4 class="font-bold border-b border-slate-200 mb-2 uppercase text-xs text-blue-600">${layerId.replace(/_/g, ' ')}</h4>
                                    <div class="max-h-48 overflow-y-auto">
                                        ${Object.entries(data).map(([k, v]) => `
                                            <div class="mb-1">
                                                <span class="text-[10px] font-bold text-slate-500 uppercase">${k}:</span>
                                                <span class="text-[11px] block">${v}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `)
                            .addTo(map.current);
                    }
                } catch (err) {
                    console.error("Error fetching feature info:", err);
                }
            }
        });

        // Change cursor on hover
        map.current.on('mousemove', (e) => {
            if (!mapLoaded) return;
            const features = map.current.queryRenderedFeatures(e.point);
            if (activeDrawModeRef.current === 'proximity_point') {
                map.current.getCanvas().style.cursor = 'crosshair';
            } else {
                map.current.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
            }
        });

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []); // Only once

    // 2. DYNAMICALLY ADD SOURCES AND LAYERS (Direct FGB Streaming - Option 2)
    useEffect(() => {
        const activeKeys = Object.keys(activeLayers).filter(k => activeLayers[k]);
        
        if (!map.current || !mapLoaded || availableLayers.length === 0) return;

        console.log("[FGB Debug] Sincronizando capas.", { 
            disponibles: availableLayers.length, 
            activas: activeKeys,
            deserializeOk: typeof deserialize === 'function'
        });

        if (typeof deserialize !== 'function') {
            console.error("[FGB Debug] CRITICAL: 'deserialize' no es una función. Error de importación de librería.");
            return;
        }

        const handleFGBUpdate = async () => {
            for (const layerId of availableLayers) {
                const isActive = activeLayers[layerId];
                
                if (!isActive) {
                    // console.log(`[FGB Debug] ${layerId} sigue inactiva.`);
                    continue;
                }

                if (map.current.getSource(layerId)) continue;

                const fgbUrl = `/api/raw-tiles/${layerId}.lowres.fgb`;
                console.log(`[FGB Debug] 🚀 INICIANDO CARGA BINARIA: ${layerId}`);
                
                try {
                    map.current.addSource(layerId, {
                        type: 'geojson',
                        data: { type: 'FeatureCollection', features: [] }
                    });

                    const color = getLayerColor(layerId);
                    map.current.addLayer({
                        id: `${layerId}-fill`,
                        type: 'fill',
                        source: layerId,
                        paint: { 'fill-color': color, 'fill-opacity': 0.4 },
                        layout: { visibility: 'visible' }
                    }, 'terrenos-fill');

                    map.current.addLayer({
                        id: `${layerId}-line`,
                        type: 'line',
                        source: layerId,
                        paint: { 'line-color': color, 'line-width': 1 },
                        layout: { visibility: 'visible' }
                    }, 'terrenos-line');

                    // ⚡️ FETCH BINARIO EXPLÍCITO
                    const response = await fetch(fgbUrl);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const iter = deserialize(response.body);
                    const features = [];
                    let count = 0;
                    for await (const feature of iter) {
                        features.push(feature);
                        count++;
                        // Actualización por bloques para suavizar el renderizado
                        if (count % 1000 === 0) {
                            map.current.getSource(layerId).setData({ type: 'FeatureCollection', features: [...features] });
                        }
                    }
                    map.current.getSource(layerId).setData({ type: 'FeatureCollection', features });
                    console.log(`[FGB Debug] ✅ CARGA COMPLETA: ${layerId} (${count} elementos)`);

                } catch (err) {
                    console.error(`[FGB Debug] ❌ ERROR en ${layerId}:`, err);
                }
            }
        };

        handleFGBUpdate();
    }, [availableLayers, mapLoaded, activeLayers]); 
// activeLayers included to trigger lazy load when toggled

    // 3. SYNC VISIBILITY
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        
        [...availableLayers, 'terrenos'].forEach(layer => {
            const visibility = activeLayers[layer] ? 'visible' : 'none';
            if (map.current.getLayer(`${layer}-fill`)) map.current.setLayoutProperty(`${layer}-fill`, 'visibility', visibility);
            if (map.current.getLayer(`${layer}-line`)) map.current.setLayoutProperty(`${layer}-line`, 'visibility', visibility);
        });
    }, [activeLayers, mapLoaded, availableLayers]);

    // 4. SYNC RESULTS DATA
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const source = map.current.getSource('terrenos-source');
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features: (results || []).map((r, index) => ({
                    ...(r.originalFeature || {}),
                    id: r.id || `terreno-${index}`,
                    properties: { 
                        ...(r.originalFeature?.properties || {}), 
                        Nombre: r.featureName, 
                        'Área Total (ha)': Math.round((r.area_total_ha || 0) * 100) / 100 
                    }
                }))
            });
        }
    }, [results, mapLoaded]);

    // 5. BASE MAP STYLE
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        if (map.current.getLayer('base-map')) map.current.setLayoutProperty('base-map', 'visibility', mapStyle === 'dark' ? 'visible' : 'none');
        if (map.current.getLayer('base-map-light')) map.current.setLayoutProperty('base-map-light', 'visibility', mapStyle === 'light' ? 'visible' : 'none');
        if (map.current.getLayer('base-map-satellite')) map.current.setLayoutProperty('base-map-satellite', 'visibility', mapStyle === 'satellite' ? 'visible' : 'none');
    }, [mapStyle, mapLoaded]);

    // 4. CLICK TO IDENTIFY (Info Popup)
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const handleMapClick = (e) => {
            // Capas a consultar (solo las activas)
            const queryableLayers = [...availableLayers]
                .filter(id => activeLayers[id])
                .map(id => `${id}-fill`);

            if (queryableLayers.length === 0) return;

            const features = map.current.queryRenderedFeatures(e.point, {
                layers: queryableLayers
            });

            if (features.length > 0) {
                const feature = features[0];
                const props = feature.properties;
                const layerId = feature.layer.id.replace('-fill', '');
                
                // Formatear HTML para el Popup
                let html = `<div class="p-1 font-sans min-w-[200px]">
                    <div class="flex items-center gap-2 mb-2 border-b border-slate-700 pb-2">
                        <div class="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style="background-color: ${getLayerColor(layerId)}"></div>
                        <span class="font-bold text-slate-100 text-[11px] uppercase tracking-wider">${getLayerDisplayName(layerId)}</span>
                    </div>
                    <div class="max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                    <table class="w-full text-[10px] text-slate-300 border-separate border-spacing-y-1">`;
                
                const skipAttributes = [
                    'id', 'objectid', 'shape_length', 'shape_area', 'st_area_sh', 'st_length_', 
                    'objectid_1', 'shape__are', 'shape__len', 'orig_fid', 'cod_comuna', 'cod_prov', 'codregion'
                ];

                Object.entries(props).forEach(([key, val]) => {
                    const lowKey = key.toLowerCase();
                    if (lowKey.startsWith('_') || skipAttributes.includes(lowKey)) return;
                    
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    html += `<tr>
                        <td class="font-semibold pr-3 text-slate-500 whitespace-nowrap">${label}:</td>
                        <td class="text-slate-200">
                            ${val !== null && val !== 'null' && val !== '' ? 
                                (typeof val === 'string' && val.startsWith('http') ? 
                                    `<a href="${val}" target="_blank" class="text-blue-400 hover:underline">Ver enlace</a>` : val) 
                                : '-'}
                        </td>
                    </tr>`;
                });
                
                html += `</table></div></div>`;

                new maplibregl.Popup({ closeButton: true, className: 'map-popup' })
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map.current);
            }
        };

        const handleMouseEnter = () => map.current.getCanvas().style.cursor = 'pointer';
        const handleMouseLeave = () => map.current.getCanvas().style.cursor = '';

        map.current.on('click', handleMapClick);
        
        // Agregar hover effect a cada capa activa
        availableLayers.forEach(layerId => {
            const lid = `${layerId}-fill`;
            map.current.on('mouseenter', lid, handleMouseEnter);
            map.current.on('mouseleave', lid, handleMouseLeave);
        });

        return () => {
            if (map.current) {
                map.current.off('click', handleMapClick);
                availableLayers.forEach(layerId => {
                    const lid = `${layerId}-fill`;
                    map.current.off('mouseenter', lid, handleMouseEnter);
                    map.current.off('mouseleave', lid, handleMouseLeave);
                });
            }
        };
    }, [mapLoaded, activeLayers, availableLayers]);

    return (
        <div className="relative w-full h-full bg-[#020617]"> {/* Rec 20: HW Acceleration background */}
            <div ref={mapContainer} className="w-full h-full" />
            {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 z-[1000] flex items-center justify-center">
                    <div className="bg-slate-900 text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-4 border border-slate-700">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <span className="font-medium text-sm">Procesando información geográfica...</span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapComponent;
