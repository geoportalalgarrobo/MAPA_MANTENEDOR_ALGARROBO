import React, { forwardRef, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson';

const MapComponent = forwardRef(({ 
    onAnalyzePolygon, isAnalyzing, activeLayers, mapStyle, results, onMapReady, 
    availableLayers = [], onProximityPoint, activeDrawMode, layerOrder, metadata = {} 
}, ref) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const proximityMarker = useRef(null);
    const [mapLoaded, setMapLoaded] = React.useState(false);

    const getLayerColor = (id) => metadata[id]?.color || '#94a3b8';
    const getLayerDisplayName = (id) => metadata[id]?.name || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const activeDrawModeRef = useRef(activeDrawMode);
    useEffect(() => { activeDrawModeRef.current = activeDrawMode; }, [activeDrawMode]);

    // Keep fresh refs for click/mousemove handlers to avoid stale closures
    const availableLayersRef = useRef(availableLayers);
    useEffect(() => { availableLayersRef.current = availableLayers; }, [availableLayers]);
    const activeLayersRef = useRef(activeLayers);
    useEffect(() => { activeLayersRef.current = activeLayers; }, [activeLayers]);

    useImperativeHandle(ref, () => ({
        clearDrawings() { 
            if (draw.current) draw.current.deleteAll(); 
            if (proximityMarker.current) { proximityMarker.current.remove(); proximityMarker.current = null; }
        },
        startDrawing(mode = 'draw_polygon') {
            console.log(`[MapComponent] startDrawing called with mode: ${mode}`);
            if (draw.current) {
                if (proximityMarker.current) { 
                    console.log("[MapComponent] Removing existing proximity marker");
                    proximityMarker.current.remove(); 
                    proximityMarker.current = null; 
                }
                
                if (mode === 'proximity_point') {
                    console.log("[MapComponent] Using draw_point mode for proximity");
                    draw.current.changeMode('draw_point');
                } else if (mode === 'simple_select') {
                    console.log("[MapComponent] Setting draw mode to simple_select");
                    draw.current.changeMode('simple_select');
                } else {
                    console.log(`[MapComponent] Setting draw mode to: ${mode}`);
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
        console.log("[MapComponent] handleDrawEvent triggered. Mode:", activeDrawModeRef.current);
        const data = draw.current.getAll();
        if (data.features.length > 0) {
            const feature = (e.features && e.features.length > 0) ? e.features[0] : data.features[data.features.length - 1];
            
            console.log("[MapComponent] Feature type:", feature.geometry.type);
            
            if (feature.geometry.type === 'Point' && activeDrawModeRef.current === 'proximity_point') {
                const [lng, lat] = feature.geometry.coordinates;
                console.log("[MapComponent] Point detected for proximity. Coords:", lat, lng);
                onProximityPoint(lat, lng);
                
                // Cleanup: remove the point feature since we manage it with a custom marker or just results
                draw.current.delete(feature.id);
                
                // Add a custom marker to highlight the point
                if (proximityMarker.current) proximityMarker.current.remove();
                proximityMarker.current = new maplibregl.Marker({ color: '#f97316' })
                    .setLngLat([lng, lat])
                    .addTo(map.current);
            } else {
                onAnalyzePolygon(feature);
            }
        } else {
            onAnalyzePolygon(null);
        }
    }, [onAnalyzePolygon, onProximityPoint]);

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

        map.current.on('click', async (e) => {
            console.log(`[MapComponent] Map clicked at: ${e.lngLat.lat}, ${e.lngLat.lng}. Active mode: ${activeDrawModeRef.current}`);
            
            if (activeDrawModeRef.current === 'proximity_point') {
                const { lat, lng } = e.lngLat;
                console.log("[MapComponent] Triggering onProximityPoint with:", lat, lng);
                onProximityPoint(lat, lng);
                
                if (proximityMarker.current) {
                    console.log("[MapComponent] Removing old marker");
                    proximityMarker.current.remove();
                }
                
                proximityMarker.current = new maplibregl.Marker({ color: '#f97316' })
                    .setLngLat([lng, lat])
                    .addTo(map.current);
                
                console.log("[MapComponent] New marker added at:", lng, lat);
                return;
            }

            const layers = availableLayersRef.current;
            if (layers.length === 0) return;
            const queryableLayers = layers.filter(id => activeLayersRef.current[id]).map(id => `${id}-fill`);
            if (queryableLayers.length === 0) return;
            const features = map.current.queryRenderedFeatures(e.point, { layers: queryableLayers });

            if (features.length > 0) {
                const feature = features[0];
                const props = feature.properties;
                const layerId = feature.layer.id.replace('-fill', '');
                
                let html = `<div class="p-1 font-sans min-w-[200px] text-slate-100 bg-slate-900 border border-slate-700 rounded-lg">
                    <div class="flex items-center gap-2 mb-2 border-b border-slate-700 pb-2">
                        <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${getLayerColor(layerId)}"></div>
                        <span class="font-bold text-[10px] uppercase">${getLayerDisplayName(layerId)}</span>
                    </div>
                    <div class="max-h-[200px] overflow-y-auto">
                    <table class="w-full text-[9px] border-separate border-spacing-y-0.5">`;
                
                Object.entries(props).forEach(([k, v]) => {
                    if (k.startsWith('_') || ['id','FID','objectid','shape_length','shape_area'].some(ex => k.toLowerCase().includes(ex))) return;
                    html += `<tr><td class="font-bold pr-2 text-slate-500 uppercase">${k}:</td><td class="text-slate-300">${v}</td></tr>`;
                });
                html += `</table></div></div>`;

                new maplibregl.Popup({ className: 'custom-popup' }).setLngLat(e.lngLat).setHTML(html).addTo(map.current);
            }
        });

        map.current.on('mousemove', (e) => {
            if (activeDrawModeRef.current === 'proximity_point') {
                map.current.getCanvas().style.cursor = 'crosshair';
            } else {
                const features = map.current.queryRenderedFeatures(e.point);
                map.current.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
            }
        });

        return () => { if (map.current) { map.current.remove(); map.current = null; } };
    }, []);

    // 2. DYNAMICALLY LOAD FGB LAYERS
    useEffect(() => {
        if (!map.current || !mapLoaded || availableLayers.length === 0) return;

        const handleFGBUpdate = async () => {
            for (const layerId of availableLayers) {
                if (!activeLayers[layerId] || map.current.getSource(layerId)) continue;

                try {
                    map.current.addSource(layerId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                    const color = getLayerColor(layerId);
                    map.current.addLayer({
                        id: `${layerId}-fill`, type: 'fill', source: layerId,
                        paint: { 'fill-color': color, 'fill-opacity': 0.4 },
                        layout: { visibility: 'visible' }
                    }, 'terrenos-fill');
                    map.current.addLayer({
                        id: `${layerId}-line`, type: 'line', source: layerId,
                        paint: { 'line-color': color, 'line-width': 1 },
                        layout: { visibility: 'visible' }
                    }, 'terrenos-line');

                    const response = await fetch(`/api/raw-tiles/${layerId}.lowres.fgb`);
                    const iter = deserialize(response.body);
                    const features = [];
                    for await (const feature of iter) {
                        features.push(feature);
                        if (features.length % 1000 === 0) {
                            map.current.getSource(layerId).setData({ type: 'FeatureCollection', features: [...features] });
                        }
                    }
                    map.current.getSource(layerId).setData({ type: 'FeatureCollection', features });
                } catch (err) { console.error(`Error loading FGB ${layerId}:`, err); }
            }
        };
        handleFGBUpdate();
    }, [availableLayers, mapLoaded, activeLayers]);

    // 3. SYNC VISIBILITY
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        [...availableLayers, 'terrenos'].forEach(layerId => {
            const visibility = activeLayers[layerId] ? 'visible' : 'none';
            if (map.current.getLayer(`${layerId}-fill`)) map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', visibility);
            if (map.current.getLayer(`${layerId}-line`)) map.current.setLayoutProperty(`${layerId}-line`, 'visibility', visibility);
        });
    }, [activeLayers, mapLoaded, availableLayers]);

    // 4. SYNC Z-INDEX
    useEffect(() => {
        if (!map.current || !mapLoaded || !layerOrder || layerOrder.length === 0) return;
        const reversed = [...layerOrder].reverse();
        reversed.forEach(id => {
            if (map.current.getLayer(`${id}-fill`)) {
                map.current.moveLayer(`${id}-fill`, 'terrenos-fill');
                if (map.current.getLayer(`${id}-line`)) map.current.moveLayer(`${id}-line`, 'terrenos-fill');
            }
        });
    }, [layerOrder, mapLoaded]);

    // 5. SYNC RESULTS DATA
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

    // 6. BASE MAP STYLE
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        if (map.current.getLayer('base-map')) map.current.setLayoutProperty('base-map', 'visibility', mapStyle === 'dark' ? 'visible' : 'none');
        if (map.current.getLayer('base-map-light')) map.current.setLayoutProperty('base-map-light', 'visibility', mapStyle === 'light' ? 'visible' : 'none');
        if (map.current.getLayer('base-map-satellite')) map.current.setLayoutProperty('base-map-satellite', 'visibility', mapStyle === 'satellite' ? 'visible' : 'none');
    }, [mapStyle, mapLoaded]);

    return (
        <div className="relative w-full h-full bg-[#020617]">
            <div ref={mapContainer} className="w-full h-full" />
            {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 z-[1000] flex items-center justify-center">
                    <div className="bg-slate-900 border border-slate-700 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                        <span className="text-white font-black text-xs uppercase tracking-widest">Sincronizando Cartografía...</span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapComponent;
