import React, { useState, useRef, useCallback } from 'react';
import MapComponent from './components/MapComponent';
import Sidebar from './components/Sidebar';
import './index.css';

function App() {
  console.log("%c>>> GEOPORTAL V1.1.0 - FGB ENGINE ACTIVE <<<", "color: #10b981; font-weight: bold; font-size: 14px;");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [activeDrawMode, setActiveDrawMode] = useState(null);
  const historyCounterRef = useRef(1);
  const [error, setError] = useState(null);
  const [proximityResults, setProximityResults] = useState(null);
  const [showProximityPanel, setShowProximityPanel] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);

  // Map Drawing State Reference
  const mapRef = useRef(null); // Will hold functions exposed by MapComponent

  const [availableLayers, setAvailableLayers] = useState([]);
  const [activeLayers, setActiveLayers] = useState({ terrenos: true });
  const [layerGroups, setLayerGroups] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [administrativeConfig, setAdministrativeConfig] = useState({});

  // Load layers dynamically on mount
  React.useEffect(() => {
    fetch('/api/layers')
      .then(async res => {
        if (!res.ok) throw new Error(`Servidor respondió con status ${res.status}`);
        const text = await res.text();
        return text ? JSON.parse(text) : { layers: [] };
      })
      .then(data => {
        if (data.layers) {
          const layerIds = data.layers.map(l => typeof l === 'string' ? l : l.id);
          console.log("[App] Capas cargadas:");
          console.table(data.layers);
          setAvailableLayers(layerIds);
          setLayerGroups(data.groups || []);
          setMetadata(data.metadata || {});
          setAdministrativeConfig(data.administrative_config || {});
          
          const initial = { terrenos: true };
          layerIds.forEach(id => { initial[id] = false; });
          setActiveLayers(initial);
          
          // Respect initial display_order from config
          if (data.display_order) {
              const ordered = data.display_order.filter(id => layerIds.includes(id) || id === 'terrenos');
              const missing = layerIds.filter(id => !ordered.includes(id));
              setLayerOrder([...ordered, ...missing]);
          } else {
              setLayerOrder([...layerIds]); 
          }
        }
      })
      .catch(err => {
        console.error(">>> ERROR CRÍTICO FETCH:", err);
        setError("Error de conexión con el servidor. Por favor, verifica tu conexión o recarga la página.");
      });
  }, []);

  // Base Map Style
  const [mapStyle, setMapStyle] = useState('dark');

  // Layer order for reference layers
  const [layerOrder, setLayerOrder] = useState([]);

  const handleReorderLayers = useCallback((newOrder) => {
    setLayerOrder(newOrder);
  }, []);

  const handleToggleLayer = (layerId) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  const handleProximityPoint = async (lat, lon) => {
    console.log(`[App] Proximity analysis request received for: ${lat}, ${lon}`);
    setIsAnalyzing(true);
    setError(null);
    try {
      const url = `/api/proximidad/${lat}/${lon}`;
      console.log(`[App] Fetching proximity from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[App] Proximity API error: Status ${response.status}`);
        throw new Error("Error obteniendo datos de proximidad");
      }
      
      const data = await response.json();
      console.log("[App] Proximity results received:", data);
      
      setProximityResults(data);
      setShowProximityPanel(true);
    } catch (err) {
      console.error("[App] Catch - Proximity analysis failed:", err);
      setError("No se pudo calcular la proximidad.");
    } finally {
      setIsAnalyzing(false);
      setActiveDrawMode(null);
      console.log("[App] Finished proximity request");
    }
  };

  const handleAnalyzePolygon = async (featureData) => {
    if (!featureData) {
      setShowResultsPanel(false);
      setError(null);
      setIsAnalyzing(false);
      setActiveDrawMode(null);
      return;
    }

    setIsAnalyzing(true);
    setActiveDrawMode(null);
    setError(null);

    // Normalize to an array of features
    let featuresToAnalyze = [];
    if (featureData.type === 'FeatureCollection') {
      featuresToAnalyze = featureData.features;
    } else if (featureData.type === 'Feature') {
      featuresToAnalyze = [featureData];
    }

    if (featuresToAnalyze.length === 0) {
      setIsAnalyzing(false);
      return;
    }

    try {
      const allResults = await Promise.all(featuresToAnalyze.map(async (feature, index) => {
        const response = await fetch('/api/reporte-predio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feature)
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Error en análisis (${response.status}): ${errorBody || 'Sin respuesta del servidor'}`);
        }
        const textBody = await response.text();
        return textBody ? JSON.parse(textBody) : {};
      }));

      // Process results to add display properties
      const processedResults = allResults.map((data, index) => {
        const feature = featuresToAnalyze[index]; 
        const givenName = feature.properties?.name || feature.properties?.Name;
        data.featureName = givenName || `Terreno ${historyCounterRef.current + index}`;
        data.originalFeature = feature; 
        data.id = new Date().getTime() + index; 
        return data;
      });

      // Increment the terrain counter
      historyCounterRef.current = historyCounterRef.current + featuresToAnalyze.length;

      // Accumulate the new results
      setResults(prev => {
        const newArr = prev ? [...prev] : [];
        return [...newArr, ...processedResults];
      });

      // Clear the temporary drawn geometries, MapComponent will rerender them from `results`
      if (mapRef.current) {
        mapRef.current.clearDrawings();
      }

      // Automatically turn on the terrenos layer if it was off
      setActiveLayers(prev => ({ ...prev, terrenos: true }));

      // Show the results panel automatically
      setShowResultsPanel(true);
      setIsPresenting(false); // Added this line

    } catch (err) {
      console.error(err);
      setError('Hubo un error al procesar la solicitud espacial. Intenta nuevamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    const suffix = file.name.split('.').pop().toLowerCase();

    // 1. FRONTEND PARSING FOR KML/KMZ
    if (suffix === 'kml' || suffix === 'kmz') {
      try {
        let kmlText;
        if (suffix === 'kmz') {
          if (!window.JSZip) throw new Error("Biblioteca JSZip no cargada");
          const zip = await window.JSZip.loadAsync(file);
          const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
          if (!kmlFile) throw new Error("No se encontró un archivo .kml válido dentro del KMZ");
          kmlText = await kmlFile.async("string");
        } else {
          kmlText = await file.text();
        }

        if (!window.toGeoJSON) throw new Error("Biblioteca toGeoJSON no cargada");
        const parser = new DOMParser();
        const xml = parser.parseFromString(kmlText, "text/xml");
        const geojson = window.toGeoJSON.kml(xml);
        
        console.log("[App] KML/KMZ parsed to GeoJSON:", geojson);

        if (mapRef.current && geojson.features.length > 0) {
          mapRef.current.clearDrawings();
          mapRef.current.addFeatures(geojson);
        }
        
        await handleAnalyzePolygon(geojson);
        return;
      } catch (err) {
        console.error("[App] KML/KMZ processing failed:", err);
        setError("Error procesando archivo KML/KMZ: " + err.message);
        setIsAnalyzing(false);
        return;
      }
    }

    // 2. BACKEND PARSING FOR OTHER FORMATS (SHP, GEOJSON)
    const formData = new FormData(); // Define formData here
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-predio', {
        method: 'POST',
        body: formData,
      });

      const resText = await response.text();
      if (!response.ok) {
        let errData = {};
        try { errData = resText ? JSON.parse(resText) : {}; } catch(e) {}
        throw new Error(errData.detail || 'Error subiendo el archivo espacial');
      }

      const featureCollection = resText ? JSON.parse(resText) : { type: 'FeatureCollection', features: [] };

      if (mapRef.current && featureCollection.features) {
        mapRef.current.clearDrawings();
        mapRef.current.addFeatures(featureCollection);
      }

      await handleAnalyzePolygon(featureCollection);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al procesar el archivo. Verifica el formato.');
      setIsAnalyzing(false);
    } finally {
      event.target.value = null;
    }
  };

  const handleReset = () => {
    setShowResultsPanel(false);
    setShowProximityPanel(false);
    setProximityResults(null);
    setError(null);
    setIsAnalyzing(false);
    setActiveDrawMode(null);
  };

  const handleStartDrawing = (mode = 'draw_polygon') => {
    // Automatically turn on the 'terrenos' layer so the drawing is visible
    setActiveLayers(prev => ({ ...prev, terrenos: true }));
    setActiveDrawMode(mode);

    if (mapRef.current) {
      mapRef.current.startDrawing(mode);
    }
  };

  const clearAllHistory = () => {
    setResults([]);
    setShowResultsPanel(false);
    setError(null);
    historyCounterRef.current = 1;
    if (mapRef.current) {
      mapRef.current.clearDrawings();
    }
  };

  const togglePresentation = () => setIsPresenting(!isPresenting);

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden font-sans text-slate-100 relative">
      {/* Left Sidebar - Conditional visibility */}
      <aside className={`transition-all duration-500 ease-in-out flex-shrink-0 z-20 shadow-xl relative bg-slate-900 border-r border-slate-800 ${isPresenting ? 'w-0 opacity-0 -translate-x-full overflow-hidden' : 'w-[400px]'}`}>
        <Sidebar
          isAnalyzing={isAnalyzing}
          results={results}
          showResultsPanel={showResultsPanel}
          setShowResultsPanel={setShowResultsPanel}
          error={error}
          onReset={handleReset}
          onStartDrawing={handleStartDrawing}
          activeDrawMode={activeDrawMode}
          onFileUpload={handleFileUpload}
          activeLayers={activeLayers}
          onToggleLayer={handleToggleLayer}
          mapStyle={mapStyle}
          setMapStyle={setMapStyle}
          onClearHistory={clearAllHistory}
          layerOrder={layerOrder}
          onReorderLayers={handleReorderLayers}
          availableLayers={availableLayers}
          proximityResults={proximityResults}
          showProximityPanel={showProximityPanel}
          setShowProximityPanel={setShowProximityPanel}
          layerGroups={layerGroups}
          metadata={metadata}
          administrativeConfig={administrativeConfig}
          onTogglePresentation={togglePresentation}
          isPresenting={isPresenting}
        />
      </aside>

      {/* Main Map */}
      <main className="flex-1 relative">
        <MapComponent
          ref={mapRef}
          onAnalyzePolygon={handleAnalyzePolygon}
          isAnalyzing={isAnalyzing}
          activeLayers={activeLayers}
          mapStyle={mapStyle}
          results={results}
          layerOrder={layerOrder}
          availableLayers={availableLayers}
          onProximityPoint={handleProximityPoint}
          activeDrawMode={activeDrawMode}
          metadata={metadata}
          administrativeConfig={administrativeConfig}
        />
        
        {/* Presentation Control Floating Button */}
        {isPresenting && (
           <button 
             onClick={togglePresentation}
             className="absolute bottom-10 left-10 z-[30] bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white px-6 py-3 rounded-full font-bold shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4"
           >
             <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
             Salir Modo Presentación
           </button>
        )}
      </main>
    </div>
  );
}

export default App;
