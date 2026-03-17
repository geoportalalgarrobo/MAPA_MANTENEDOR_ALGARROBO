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
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await fetch(`/api/proximidad/${lat}/${lon}`);
      if (!response.ok) throw new Error("Error obteniendo datos de proximidad");
      const data = await response.json();
      setProximityResults(data);
      setShowProximityPanel(true);
    } catch (err) {
      console.error(err);
      setError("No se pudo calcular la proximidad.");
    } finally {
      setIsAnalyzing(false);
      setActiveDrawMode(null);
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

    const formData = new FormData();
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

      // Trigger analysis on all the uploaded features
      await handleAnalyzePolygon(featureCollection);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al procesar el archivo. Verifica el formato.');
      setIsAnalyzing(false);
    } finally {
      // Clear file input so the same file can be uploaded again if needed
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

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Left Sidebar */}
      <aside className="w-[400px] flex-shrink-0 z-20 shadow-xl relative bg-slate-900 border-r border-slate-800">
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
        />
      </main>
    </div>
  );
}

export default App;
