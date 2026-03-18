import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Layers, PenTool, Map as MapIcon, MapPin, Spline, Hexagon, Upload, Download, GripVertical, ChevronDown } from 'lucide-react';
import LogoImage from '../assets/Logo.png';

ChartJS.register(ArcElement, Tooltip, Legend);

const Sidebar = ({ 
    isAnalyzing, results, showResultsPanel, setShowResultsPanel, error, onReset, 
    onStartDrawing, activeDrawMode, onFileUpload, activeLayers, onToggleLayer, 
    mapStyle, setMapStyle, onClearHistory, layerOrder, onReorderLayers, 
    availableLayers = [], proximityResults, showProximityPanel, setShowProximityPanel,
    layerGroups = [], metadata = {}, administrativeConfig = {}
}) => {
    const [expandedFeatureIdx, setExpandedFeatureIdx] = React.useState(-1);
    const [expandedFormations, setExpandedFormations] = React.useState({});
    const [compareIndices, setCompareIndices] = React.useState([]);
    const [viewMode, setViewMode] = React.useState('history'); // history, comparison, proximity
    const [showDownloadMenu, setShowDownloadMenu] = React.useState(false);
    
    // Drag and Drop state
    const [draggedLayer, setDraggedLayer] = React.useState(null);

    // Sync proximity results with view mode
    React.useEffect(() => {
        if (proximityResults) setViewMode('proximity');
    }, [proximityResults]);

    const formatNumber = (num, decimals = 2) => {
        if (num === undefined || num === null) return "0";
        return new Intl.NumberFormat('es-CL', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    };

    const sumArea = (features) => {
        if (!features || !Array.isArray(features)) return 0;
        return features.reduce((sum, f) => sum + (f.area_interseccion_ha || 0), 0);
    };

    const getLayerDisplayName = (id) => {
        if (metadata[id]?.name) return metadata[id].name;
        const cleanId = id.replace('.lowres', '').replace('_simplified', '');
        return cleanId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const getLayerColor = (id) => metadata[id]?.color || '#94a3b8';

    const toggleFormation = (layerId) => {
        setExpandedFormations(prev => ({ ...prev, [layerId]: !prev[layerId] }));
    };

    const toggleComparison = (idx) => {
        setCompareIndices(prev => {
            if (prev.includes(idx)) return prev.filter(i => i !== idx);
            if (prev.length >= 2) return [prev[1], idx];
            return [...prev, idx];
        });
    };

    // Drag and Drop Handlers
    const handleDragStart = (e, layerId) => {
        setDraggedLayer(layerId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, targetLayerId) => {
        e.preventDefault();
        if (!draggedLayer || draggedLayer === targetLayerId) return;

        const newOrder = [...layerOrder];
        const draggedIdx = newOrder.indexOf(draggedLayer);
        const targetIdx = newOrder.indexOf(targetLayerId);

        if (draggedIdx !== -1 && targetIdx !== -1) {
            newOrder.splice(draggedIdx, 1);
            newOrder.splice(targetIdx, 0, draggedLayer);
            onReorderLayers(newOrder);
        }
    };

    const handleDragEnd = () => {
        setDraggedLayer(null);
    };

    const handleGeneratePDF = async (resItem) => {
        if (!window.jspdf) return alert("Biblioteca PDF no cargada");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text("GEOPORTAL", 15, 20);
        doc.setFontSize(10); doc.text("FICHA TERRITORIAL", 15, 30);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 160, 20);
        
        doc.setTextColor(15, 23, 42); doc.setFontSize(18); doc.text(resItem.featureName, 15, 55);
        doc.setFontSize(12); doc.text("DATOS GENERALES", 15, 70);
        doc.line(15, 72, 195, 72);
        
        doc.setFontSize(10);
        doc.text(`Superficie Total: ${formatNumber(resItem.area_total_ha)} ha`, 15, 80);
        // Dynamic admin location lines from config
        let locY = 86;
        (administrativeConfig?.levels || []).forEach(level => {
            const val = resItem.dpa?.[level.target_key]?.join(', ') || 'N/A';
            doc.text(`${level.label}: ${val}`, 15, locY);
            locY += 6;
        });
        
        doc.setFontSize(12); doc.text("AFECTACIONES", 15, 110); doc.line(15, 112, 195, 112);
        let y = 120;
        Object.entries(resItem.restricciones || {}).forEach(([layerId, items]) => {
            if (!items || items.length === 0) return;
            const area = sumArea(items);
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.text(`${getLayerDisplayName(layerId)}: ${formatNumber(area)} ha`, 15, y);
            y += 6;
            doc.setFont("helvetica", "normal"); doc.setFontSize(8);
            items.slice(0, 5).forEach(item => {
                doc.text(`• ${item.nombre || item.Name || 'Item'} (${formatNumber(item.area_interseccion_ha)} ha)`, 20, y);
                y += 5;
            });
            y += 5;
            if (y > 270) { doc.addPage(); y = 20; }
        });
        doc.save(`Ficha_${resItem.featureName}.pdf`);
    };

    const [expandedGroups, setExpandedGroups] = React.useState({});

    const toggleGroup = (layerId, groupName) => {
        const key = `${layerId}-${groupName}`;
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleDownloadData = (format) => {
        if (!results || results.length === 0) return;
        const enrichedFeatures = results.map(r => ({
            ...r.originalFeature,
            properties: {
                ...r.originalFeature?.properties,
                Nombre: r.featureName,
                Area_ha: r.area_total_ha,
                Comuna: r.dpa?.Comuna?.join(', ')
            }
        }));

        if (format === 'json') {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: enrichedFeatures }));
            const link = document.createElement('a');
            link.setAttribute("href", dataStr);
            link.setAttribute("download", "geoportal_export.json");
            link.click();
        } else {
            const headers = ["Nombre", "Area_ha", "Comuna"];
            const csvRows = [headers.join(',')];
            enrichedFeatures.forEach(f => {
                csvRows.push([f.properties.Nombre, f.properties.Area_ha, f.properties.Comuna].join(','));
            });
            const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join('\n'));
            const link = document.createElement('a');
            link.setAttribute("href", dataStr);
            link.setAttribute("download", "geoportal_export.csv");
            link.click();
        }
        setShowDownloadMenu(false);
    };

    const renderItemCard = (item, i, subtitleField, titleField, totalArea) => (
        <div key={i} className="text-[11px] text-slate-400 bg-slate-800/20 p-4 rounded-xl border border-slate-700/30 relative group/item">
            <div className="absolute top-0 right-10 bottom-0 w-px bg-slate-800/30"></div>
            <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="block font-black text-slate-100 uppercase tracking-tight text-[11px] leading-tight group-hover/item:text-blue-400 transition-colors italic font-heading">
                            {titleField ? item[titleField] : (item.nombre || item.Name || item.NOMBRE || item.nombre_sp || `Entidad ${i + 1}`)}
                        </span>
                        {subtitleField && item[subtitleField] && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50 font-bold uppercase font-mono-tech">
                                {String(item[subtitleField])}
                            </span>
                        )}
                    </div>
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter font-mono-tech">ID: {item.FID || item.id || 'N/A'}</span>
                    <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-slate-800/30 pt-3 opacity-80 group-hover/item:opacity-100 transition-opacity">
                        {Object.entries(item).map(([key, value]) => {
                            if (['geometry', 'area_interseccion_ha', 'nombre', 'Name', 'NOMBRE', 'FID', 'id'].some(ex => key.toLowerCase().includes(ex.toLowerCase()))) return null;
                            if (key === subtitleField || key === titleField) return null; 
                            if (value === null || value === "" || value === undefined || value === "null") return null;
                            return (
                                <div key={key} className="flex flex-row gap-2 border-l-2 border-slate-700/30 pl-3">
                                    <span className="text-slate-600 font-black uppercase text-[8px] tracking-widest min-w-[70px]">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-slate-400 break-words leading-tight flex-1">{String(value)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="flex flex-col items-end justify-center font-mono-tech">
                    <span className="text-red-400 font-black text-xs tracking-tighter shadow-sm">{formatNumber(item.area_interseccion_ha)} ha</span>
                    <span className="text-[9px] text-slate-600 font-bold italic">{formatNumber(totalArea > 0 ? (item.area_interseccion_ha / totalArea) * 100 : 0, 1)}%</span>
                </div>
            </div>
        </div>
    );

    const renderComparison = () => {
        if (compareIndices.length < 2) return <div className="text-center p-10 text-slate-500">Selecciona 2 sitios para comparar</div>;
        const itemA = results[compareIndices[0]];
        const itemB = results[compareIndices[1]];
        return (
            <div className="flex flex-col gap-6 h-full">
                <header className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest">Comparativa A/B</h3>
                    <button onClick={() => setViewMode('history')} className="text-xs text-slate-500 hover:text-white">Regresar</button>
                </header>
                <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-700 rounded-lg overflow-hidden text-[11px]">
                    <div className="p-3 bg-slate-900 font-bold text-center border-r border-slate-800 text-blue-400 truncate">{itemA.featureName}</div>
                    <div className="p-3 bg-slate-900 font-bold text-center text-emerald-400 truncate">{itemB.featureName}</div>
                    <div className="col-span-2 p-1 bg-slate-950 text-[10px] text-center text-slate-600 font-bold uppercase">Superficie Total</div>
                    <div className="p-4 bg-slate-800/30 text-center text-xl font-light border-r border-slate-800">{formatNumber(itemA.area_total_ha)} ha</div>
                    <div className="p-4 bg-slate-800/30 text-center text-xl font-light">{formatNumber(itemB.area_total_ha)} ha</div>
                    {availableLayers.map(l => {
                        const areaA = sumArea(itemA.restricciones?.[l]);
                        const areaB = sumArea(itemB.restricciones?.[l]);
                        if (areaA === 0 && areaB === 0) return null;
                        return (
                            <React.Fragment key={l}>
                                <div className="col-span-2 p-1.5 bg-slate-950 text-[10px] uppercase text-slate-400 text-center border-y border-slate-800">{getLayerDisplayName(l)}</div>
                                <div className={`p-3 bg-slate-800/20 text-center border-r border-slate-800 ${areaA > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>{formatNumber(areaA)} ha</div>
                                <div className={`p-3 bg-slate-800/20 text-center ${areaB > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>{formatNumber(areaB)} ha</div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderProximity = () => (
        <div className="flex flex-col gap-4 h-full">
            <header className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest">Proximidad Cercana</h3>
                <button onClick={() => { setViewMode('history'); setShowProximityPanel(false); }} className="text-xs text-slate-500 hover:text-white">✕</button>
            </header>
            <div className="space-y-3 px-1">
                {proximityResults?.map((item, i) => (
                    <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/60 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{item.layer_display}</span>
                            <span className="text-orange-400 font-bold text-xs">{item.distance_m > 1000 ? `${(item.distance_m/1000).toFixed(2)} km` : `${Math.round(item.distance_m)} m`}</span>
                        </div>
                        <div className="text-xs text-slate-200 truncate font-semibold">{item.feature_name}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderLayerSwitch = (layerId) => (
        <label key={layerId} 
               className={`flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-all group cursor-pointer ${draggedLayer === layerId ? 'opacity-30' : ''}`}
               draggable
               onDragStart={(e) => handleDragStart(e, layerId)}
               onDragOver={(e) => handleDragOver(e, layerId)}
               onDragEnd={handleDragEnd}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <GripVertical className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                <div className="relative">
                    <input type="checkbox" className="sr-only" checked={activeLayers[layerId]} onChange={() => onToggleLayer(layerId)} />
                    <div className={`w-9 h-5 rounded-full transition-colors ${activeLayers[layerId] ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${activeLayers[layerId] ? 'left-5' : 'left-1'}`} />
                    </div>
                </div>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: getLayerColor(layerId)}}></div>
                <span className="text-xs text-slate-400 group-hover:text-slate-100 transition-colors truncate font-medium">{getLayerDisplayName(layerId)}</span>
            </div>
        </label>
    );

    const renderControls = () => (
        <div className="mb-8 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => onStartDrawing('draw_polygon')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${activeDrawMode === 'draw_polygon' ? 'bg-emerald-600/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-800/40 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/60'}`}>
                    <Hexagon className={`w-6 h-6 ${activeDrawMode === 'draw_polygon' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Dibujar Polígono</span>
                </button>
                <button onClick={() => onStartDrawing('proximity_point')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${activeDrawMode === 'proximity_point' ? 'bg-orange-600/20 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'bg-slate-800/40 border-slate-700 hover:border-orange-500/50 hover:bg-slate-800/60'}`}>
                    <MapPin className={`w-6 h-6 ${activeDrawMode === 'proximity_point' ? 'text-orange-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Punto Cercanía</span>
                </button>
                <div className="col-span-2">
                    <input type="file" id="file-up" className="hidden" onChange={onFileUpload} />
                    <label htmlFor="file-up" className="w-full p-4 rounded-xl border bg-slate-800/40 border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/60 cursor-pointer flex flex-col items-center gap-2 transition-all">
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Subir Archivo (Shape/GeoJSON)</span>
                    </label>
                </div>
            </div>

            {/* Terrenos Section */}
            <div className={`bg-slate-900/60 border rounded-xl p-4 transition-all ${results?.length > 0 ? 'border-emerald-500/30' : 'border-slate-800'}`}>
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={activeLayers['terrenos']} onChange={() => onToggleLayer('terrenos')} />
                        <div className={`w-10 h-5 rounded-full transition-colors ${activeLayers['terrenos'] ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${activeLayers['terrenos'] ? 'left-6' : 'left-1'}`} />
                        </div>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 group-hover:text-emerald-300 transition-colors">Terrenos Analizados</span>
                </label>
                
                {activeLayers['terrenos'] && results?.length > 0 && (
                    <div className="mt-4 space-y-3">
                         <button onClick={() => setShowResultsPanel(true)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-900/20">
                            Ver Resultados ({results.length})
                         </button>
                         <div className="flex gap-2">
                            <div className="relative flex-1">
                                <button onClick={() => setShowDownloadMenu(!showDownloadMenu)} className="w-full bg-slate-800 border border-slate-700 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-slate-700 transition-all text-slate-300">
                                    <Download className="w-3.5 h-3.5" /> Exportar
                                </button>
                                {showDownloadMenu && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden divide-y divide-slate-700">
                                        <button onClick={() => handleDownloadData('json')} className="w-full py-2 px-3 text-[10px] hover:bg-slate-700 text-left transition-colors">GeoJSON</button>
                                        <button onClick={() => handleDownloadData('csv')} className="w-full py-2 px-3 text-[10px] hover:bg-slate-700 text-left transition-colors">CSV/Excel</button>
                                    </div>
                                )}
                            </div>
                            <button onClick={onClearHistory} className="flex-1 bg-red-950/20 border border-red-900/30 text-red-400 py-2 rounded-lg text-[10px] font-bold hover:bg-red-900/20 transition-all">Limpiar</button>
                         </div>
                    </div>
                )}
            </div>

            {/* Grouped Reference Layers */}
            <div className="space-y-6">
                {layerGroups.map(group => (
                    <div key={group.id} className="bg-slate-900/30 p-1 rounded-xl">
                        <header className="px-3 py-2 flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{group.name}</h4>
                            {group.is_administrative && <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded italic">Solo Referencia</span>}
                        </header>
                        <div className="mt-1 space-y-0.5">
                            {layerOrder
                                .filter(id => group.layers.includes(id))
                                .map(id => renderLayerSwitch(id))}
                        </div>
                    </div>
                ))}
                
                {/* Ungrouped Layers Fallback */}
                {availableLayers.some(id => !layerGroups.some(g => g.layers.includes(id))) && (
                    <div className="bg-slate-900/30 p-1 rounded-xl">
                        <header className="px-3 py-2">
                             <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Otras Capas</h4>
                        </header>
                        <div className="mt-1 space-y-0.5">
                            {layerOrder
                                .filter(id => !layerGroups.some(g => g.layers.includes(id)))
                                .map(id => renderLayerSwitch(id))}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Map Styles */}
            <div className="mt-2 bg-slate-950/50 p-4 rounded-xl border border-slate-900">
                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 text-center">Mapa Base</h4>
                <div className="flex p-1 bg-slate-900 rounded-lg gap-1">
                    {['dark', 'light', 'satellite'].map(style => (
                        <button key={style} onClick={() => setMapStyle(style)} className={`flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${mapStyle === style ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800'}`}>
                            {style === 'dark' ? 'Oscuro' : style === 'light' ? 'Claro' : 'Satélite'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    if (error) return (
        <div className="flex flex-col h-full bg-slate-900 p-8 items-center justify-center text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                <span className="text-red-500 text-2xl">⚠️</span>
            </div>
            <h3 className="text-white font-bold mb-2">Error de Sistema</h3>
            <p className="text-red-400/80 text-sm mb-8 leading-relaxed max-w-[240px]">{error}</p>
            <button onClick={onReset} className="bg-slate-800 border border-slate-700 hover:bg-slate-700 px-8 py-2.5 rounded-xl text-xs font-bold transition-all text-white">Regresar al Inicio</button>
        </div>
    );

    if (isAnalyzing) return (
        <div className="flex flex-col h-full bg-slate-900 p-6 items-center justify-center">
            <div className="relative w-16 h-16 mb-8">
                <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-4 bg-blue-500/10 rounded-full animate-pulse"></div>
            </div>
            <p className="text-white font-bold tracking-wider uppercase text-xs mb-2">Procesando</p>
            <p className="text-slate-500 text-[10px] text-center max-w-[180px] leading-tight">Analizando intersecciones espaciales y normativa territorial...</p>
        </div>
    );

    if (!showResultsPanel && !showProximityPanel) return (
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 overflow-y-auto no-scrollbar">
            <header className="mb-12 flex flex-col items-center">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
                    <img src={LogoImage} alt="Logo" className="h-20 w-auto relative drop-shadow-2xl" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-[0.2em] font-heading uppercase italic">Geoportal</h1>
                <div className="h-1 w-12 bg-blue-500 mt-2 mb-3 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                <p className="text-slate-500 text-[9px] uppercase font-bold tracking-[0.4em] opacity-80 font-heading">Análisis Territorial Inteligente</p>
            </header>
            {renderControls()}
        </div>
    );

    if (viewMode === 'comparison') return <div className="flex flex-col h-full bg-slate-900 p-6 overflow-y-auto custom-scrollbar">{renderComparison()}</div>;
    if (viewMode === 'proximity') return <div className="flex flex-col h-full bg-slate-900 p-6 overflow-y-auto custom-scrollbar">{renderProximity()}</div>;

    return (
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-full overflow-hidden">
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                <header className="mb-8 flex justify-between items-center border-b border-slate-800/50 pb-6">
                    <div>
                        <h2 className="text-2xl font-black text-white italic tracking-tight uppercase font-heading">Resultados</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em] font-mono-tech">{results.length} Sitios Analizados</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {results.length >= 2 && (
                            <button onClick={() => { setViewMode('comparison'); if (compareIndices.length < 2) setCompareIndices([0, 1]); }} className="bg-blue-600/10 border border-blue-500/30 text-blue-400 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-blue-600/20 transition-all">Comparar</button>
                        )}
                        <button onClick={onReset} className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all">✕</button>
                    </div>
                </header>

                <div className="space-y-5">
                    {results.map((resItem, idx) => {
                        const isExpanded = expandedFeatureIdx === idx;
                        const isComparing = compareIndices.includes(idx);
                        const totalArea = resItem.area_total_ha || 0;
                        
                        // Calculated based on group logic or sum (respecting overlaps)
                        const restArea = Object.entries(resItem.restricciones || {}).reduce((s, [lid, items]) => s + sumArea(items), 0);
                        const cleanArea = Math.max(0, totalArea - restArea);

                        return (
                            <div key={idx} className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isComparing ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-slate-800 bg-slate-800/20 hover:border-slate-700 shadow-xl'}`}>
                                <div className="p-4 flex justify-between items-center">
                                    <div onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)} className="flex-1 cursor-pointer">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[8px] font-black text-white uppercase tracking-tighter">#{idx + 1}</span>
                                            <span className="block text-sm font-black text-white truncate max-w-[160px] tracking-tight">{resItem.featureName}</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{formatNumber(totalArea)} ha</span>
                                            {restArea > 0 && <span className="text-[10px] text-red-500 font-black uppercase flex items-center gap-1 shadow-sm">⚠️ Restringido</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => toggleComparison(idx)} className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${isComparing ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}><Layers className="w-4 h-4" /></button>
                                        <button onClick={() => handleGeneratePDF(resItem)} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center"><Download className="w-4 h-4" /></button>
                                        <button onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)} className={`w-8 h-8 rounded-lg bg-slate-800 text-slate-500 transition-all flex items-center justify-center ${isExpanded ? 'rotate-180 bg-slate-700' : ''}`}><ChevronDown className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="p-5 border-t border-slate-800 bg-slate-900/60 animate-in fade-in slide-in-from-top-4 duration-300 space-y-4">
                                        
                                        {/* 1. AREA CARD */}
                                        <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 shadow-inner">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 block font-heading">Área Calculada</span>
                                            <div className="flex items-baseline gap-2 font-mono-tech">
                                                <span className="text-3xl font-black text-white tracking-tighter italic leading-none">{formatNumber(totalArea)}</span>
                                                <span className="text-xs text-slate-500 italic font-medium uppercase">ha</span>
                                            </div>
                                        </div>

                                        {/* 2. ADMINISTRATIVE LOCATION CARD */}
                                        <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 shadow-inner">
                                            <header className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                                                <MapPin className="w-4 h-4 text-slate-400" />
                                                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">Ubicación Administrativa</span>
                                            </header>
                                            <div className="space-y-3">
                                                {(administrativeConfig?.levels || []).map((level, lIdx) => (
                                                    <div key={lIdx} className="flex flex-col gap-0.5">
                                                        <span className="text-[10px] font-black text-slate-600 uppercase">{level.label}:</span>
                                                        <span className="text-[11px] text-slate-300 font-medium">
                                                            {resItem.dpa?.[level.target_key]?.join(', ') || 'N/A'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 3. CHARTS PER GROUP */}
                                        <div className="space-y-4">
                                            {layerGroups.filter(g => !g.is_administrative).map(group => {
                                                const groupLayers = group.layers;
                                                const matches = Object.entries(resItem.restricciones || {})
                                                    .filter(([lid, items]) => groupLayers.includes(lid) && items.length > 0);
                                                
                                                if (matches.length === 0) return null;

                                                const groupData = matches.map(([lid, items]) => ({
                                                    label: getLayerDisplayName(lid),
                                                    value: sumArea(items),
                                                    color: getLayerColor(lid)
                                                }));

                                                const totalGroupRest = groupData.reduce((s, d) => s + d.value, 0);
                                                const sinRest = Math.max(0, totalArea - totalGroupRest);

                                                const chartData = {
                                                    labels: [...groupData.map(d => d.label), "Libre de Normativa"],
                                                    datasets: [{
                                                        data: [...groupData.map(d => d.value), sinRest],
                                                        backgroundColor: [...groupData.map(d => d.color), '#10b981'],
                                                        borderWidth: 0,
                                                        hoverOffset: 10
                                                    }]
                                                };

                                                return (
                                                    <div key={group.id} className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 shadow-inner">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 block border-l-2 border-slate-700 pl-3 font-heading">{group.name}</span>
                                                        <div className="flex gap-6 items-center">
                                                            <div className="relative w-28 h-28 flex-shrink-0">
                                                                <Doughnut data={chartData} options={{ 
                                                                    cutout: '75%', 
                                                                    plugins: { 
                                                                        tooltip: { enabled: true }, 
                                                                        legend: { display: false } 
                                                                    } 
                                                                }} />
                                                            </div>
                                                            <div className="flex flex-col flex-1 gap-1.5">
                                                                {groupData.map((d, i) => (
                                                                    <div key={i} className="flex items-center justify-between group/leg">
                                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor: d.color}}></div>
                                                                            <span className="text-[9px] font-black text-slate-400 truncate uppercase tracking-tighter group-hover/leg:text-slate-100 transition-colors font-heading">{d.label}</span>
                                                                        </div>
                                                                        <span className="text-[9px] font-bold text-slate-500 font-mono-tech">{formatNumber((d.value/totalArea)*100, 1)}%</span>
                                                                    </div>
                                                                ))}
                                                                <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-800">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter font-heading">Sin Restr.</span>
                                                                    </div>
                                                                    <span className="text-[9px] font-bold text-emerald-500 font-mono-tech">{formatNumber((sinRest/totalArea)*100, 1)}%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Result Groups Render (Detailed Items) */}
                                        <div className="mt-6 space-y-4">
                                            {layerGroups.filter(g => !g.is_administrative).map(group => {
                                                const groupMatches = Object.entries(resItem.restricciones || {})
                                                    .filter(([lId, items]) => group.layers.includes(lId) && items.length > 0);
                                                
                                                if (groupMatches.length === 0) return null;

                                                return (
                                                    <div key={group.id} className="space-y-2">
                                                        <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] border-l-2 border-slate-700 pl-2 ml-1">{group.name}</h5>
                                                        {groupMatches.map(([lId, items]) => (
                                                            <div key={lId} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-inner">
                                                                <div onClick={() => toggleFormation(lId)} className="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-800/30 transition-colors">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.1)]" style={{backgroundColor: getLayerColor(lId)}}></div>
                                                                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-tight">{getLayerDisplayName(lId)}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-bold text-red-400">{formatNumber(sumArea(items))} ha</span>
                                                                        <ChevronDown className={`w-3 h-3 text-slate-600 transition-all ${expandedFormations[lId] ? 'rotate-180 text-white' : ''}`} />
                                                                    </div>
                                                                </div>
                                                                {expandedFormations[lId] && (
                                                                    <div className="p-4 space-y-6 bg-slate-950/60 border-t border-slate-800/50">
                                                                        {(() => {
                                                                            const groupField = metadata[lId]?.results_group_by;
                                                                            const subtitleField = metadata[lId]?.results_subtitle;
                                                                            const titleField = metadata[lId]?.results_title_field;

                                                                            if (groupField) {
                                                                                const groups = items.reduce((acc, item) => {
                                                                                    const val = item[groupField] || "Otros / Sin Clasificar";
                                                                                    if (!acc[val]) acc[val] = { items: [], total: 0 };
                                                                                    acc[val].items.push(item);
                                                                                    acc[val].total += (item.area_interseccion_ha || 0);
                                                                                    return acc;
                                                                                }, {});

                                                                                return Object.entries(groups).map(([groupName, groupData], gIdx) => {
                                                                                    const isGroupExpanded = expandedGroups[`${lId}-${groupName}`];
                                                                                    return (
                                                                                        <div key={groupName} className="space-y-3">
                                                                                            <div 
                                                                                                onClick={() => toggleGroup(lId, groupName)}
                                                                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/30 cursor-pointer hover:bg-slate-800/60 transition-all"
                                                                                            >
                                                                                                <div className="flex flex-col">
                                                                                                    <span className="text-[11px] font-black text-white uppercase tracking-tight italic">{groupName}</span>
                                                                                                    <span className="text-[9px] font-bold text-orange-400/80">Afectación total: {formatNumber(groupData.total)} ha ({formatNumber(totalArea > 0 ? (groupData.total/totalArea)*100 : 0, 1)}%)</span>
                                                                                                </div>
                                                                                                <ChevronDown className={`w-4 h-4 text-slate-500 transition-all ${isGroupExpanded ? 'rotate-180 text-white' : ''}`} />
                                                                                            </div>
                                                                                            {isGroupExpanded && (
                                                                                                <div className="pl-2 space-y-3 border-l border-slate-800 ml-1 mt-2 animate-in slide-in-from-top-2 duration-300">
                                                                                                    {groupData.items.map((item, i) => renderItemCard(item, i, subtitleField, titleField, totalArea))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                });
                                                                            }
                                                                            return items.map((item, i) => renderItemCard(item, i, subtitleField, titleField, totalArea));
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-6 bg-slate-900 border-t border-slate-800/50 flex gap-3 shadow-2xl relative z-10">
                <button onClick={onReset} className="flex-1 bg-slate-800 border border-slate-700 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-700 transition-all">Panel de Control</button>
                <button onClick={() => { onReset(); setTimeout(() => onStartDrawing('draw_polygon'), 150); }} className="flex-1 bg-blue-600 border border-blue-500 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/30 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] transition-all">Analizar Nuevo Terreno</button>
            </div>
        </div>
    );
};

export default Sidebar;
