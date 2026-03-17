import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Layers, PenTool, Map as MapIcon, MapPin, Spline, Hexagon, Upload, Download, GripVertical } from 'lucide-react';
import LogoImage from '../assets/Logo.png';

ChartJS.register(ArcElement, Tooltip, Legend);

const Sidebar = ({ isAnalyzing, results, showResultsPanel, setShowResultsPanel, error, onReset, onStartDrawing, activeDrawMode, onFileUpload, activeLayers, onToggleLayer, mapStyle, setMapStyle, onClearHistory, layerOrder, onReorderLayers, availableLayers = [], proximityResults, showProximityPanel, setShowProximityPanel }) => {
    const [expandedFeatureIdx, setExpandedFeatureIdx] = React.useState(-1);
    const [expandedFormations, setExpandedFormations] = React.useState({});
    const [compareIndices, setCompareIndices] = React.useState([]);
    const [viewMode, setViewMode] = React.useState('history'); // history, comparison, proximity
    const [showDownloadMenu, setShowDownloadMenu] = React.useState(false);
    const [draggedLayer, setDraggedLayer] = React.useState(null);
    const [dragOverLayer, setDragOverLayer] = React.useState(null);

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

    const layerNames = {
        areas_protegidas: "Áreas Protegidas",
        sitios_prioritarios: "Sitios Prioritarios",
        ecosistemas: "Ecosistemas",
        terrenos: "Terrenos Analizados",
        regiones_simplified: "Límites Regionales",
        provincias_simplified: "Límites Provinciales",
        comunas_simplified: "Límites Comunales",
        concesiones_mineras_const: "Catastro Minero Constituidas",
        concesiones_mineras_tramite: "Catastro Minero en Trámite",
        ecmpo: "ECMPO",
        concesiones_acuicultura: "Concesiones Acuicultura"
    };

    const getLayerDisplayName = (id) => layerNames[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const LAYER_COLORS = {
        areas_protegidas:          '#60a5fa',
        sitios_prioritarios:       '#c084fc',
        ecosistemas:               '#4ade80',
        ecmpo:                     '#fb7185',
        concesiones_acuicultura:   '#22d3ee',
        concesiones_mineras_const: '#fbbf24',
        concesiones_mineras_tramite: '#f59e0b',
        comunas_simplified:        '#94a3b8',
        provincias_simplified:     '#64748b',
        regiones_simplified:       '#475569',
        terrenos:                  '#34d399',
    };

    const getLayerColor = (id) => LAYER_COLORS[id] || '#94a3b8';

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
        doc.text(`Comuna: ${resItem.dpa?.Comuna?.join(', ') || 'N/A'}`, 15, 86);
        
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
            // Simple CSV
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
            <div className="space-y-3">
                {proximityResults?.map((item, i) => (
                    <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
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

    const renderControls = () => (
        <div className="mb-8 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onStartDrawing('draw_polygon')} className={`p-4 rounded-lg border flex flex-col items-center gap-1 transition-all ${activeDrawMode === 'draw_polygon' ? 'bg-emerald-600 border-emerald-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-emerald-500'}`}>
                    <Hexagon className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase">Dibujar</span>
                </button>
                <button onClick={() => onStartDrawing('proximity_point')} className={`p-4 rounded-lg border flex flex-col items-center gap-1 transition-all ${activeDrawMode === 'proximity_point' ? 'bg-orange-600 border-orange-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-orange-500'}`}>
                    <MapPin className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase">Proximidad</span>
                </button>
                <div className="col-span-2">
                    <input type="file" id="file-up" className="hidden" onChange={onFileUpload} />
                    <label htmlFor="file-up" className="w-full p-4 rounded-lg border bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer flex flex-col items-center gap-1">
                        <Upload className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase">Subir Archivo</span>
                    </label>
                </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="sr-only" checked={activeLayers['terrenos']} onChange={() => onToggleLayer('terrenos')} />
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${activeLayers['terrenos'] ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${activeLayers['terrenos'] ? 'left-6' : 'left-1'}`} />
                    </div>
                    <span className="text-xs font-bold uppercase text-emerald-400">Terrenos Analizados</span>
                </label>
                {activeLayers['terrenos'] && results?.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                         <button onClick={() => setShowResultsPanel(true)} className="w-full bg-blue-600 py-2 rounded text-xs font-bold">Ver Resultados ({results.length})</button>
                         <div className="flex gap-2">
                            <button onClick={() => setShowDownloadMenu(!showDownloadMenu)} className="flex-1 bg-slate-700 py-2 rounded text-[10px] font-bold">Exportar</button>
                            <button onClick={onClearHistory} className="flex-1 bg-red-900/20 text-red-400 py-2 rounded text-[10px] font-bold">Limpiar</button>
                         </div>
                         {showDownloadMenu && (
                             <div className="grid grid-cols-2 gap-2 mt-1">
                                <button onClick={() => handleDownloadData('json')} className="bg-slate-900 py-1.5 rounded text-[9px] font-bold">GeoJSON</button>
                                <button onClick={() => handleDownloadData('csv')} className="bg-slate-900 py-1.5 rounded text-[9px] font-bold">CSV/Excel</button>
                             </div>
                         )}
                    </div>
                )}
            </div>

            <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 border-b border-slate-800 pb-1">Capas de Referencia</h4>
                <div className="space-y-1">
                    {(layerOrder || []).map(layerId => (
                        <div key={layerId} className="flex items-center gap-2 p-2 hover:bg-slate-800/50 rounded transition-colors group">
                            <GripVertical className="w-3 h-3 text-slate-600 cursor-grab" />
                            <input type="checkbox" checked={activeLayers[layerId]} onChange={() => onToggleLayer(layerId)} />
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: getLayerColor(layerId)}}></div>
                            <span className="text-xs text-slate-400 group-hover:text-white transition-colors truncate">{getLayerDisplayName(layerId)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    if (error) return (
        <div className="flex flex-col h-full bg-slate-900 p-6 items-center justify-center text-center">
            <div className="text-red-500 mb-4 text-4xl">⚠️</div>
            <p className="text-red-400 font-bold mb-4">{error}</p>
            <button onClick={onReset} className="bg-slate-800 px-6 py-2 rounded-lg text-sm font-bold">Regresar</button>
        </div>
    );

    if (isAnalyzing) return (
        <div className="flex flex-col h-full bg-slate-900 p-6 items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500 mb-4"></div>
            <p className="text-slate-400 animate-pulse text-sm">Procesando datos territoriales...</p>
        </div>
    );

    if (!showResultsPanel && !showProximityPanel) return (
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 overflow-y-auto">
            <header className="mb-10 flex flex-col items-center">
                <img src={LogoImage} alt="Logo" className="h-20 w-auto mb-4" />
                <h1 className="text-2xl font-black text-white tracking-widest uppercase italic">Geoportal</h1>
                <div className="h-1 w-10 bg-blue-500 mt-1 mb-2"></div>
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-tighter">Plataforma de Análisis Territorial</p>
            </header>
            {renderControls()}
        </div>
    );

    if (viewMode === 'comparison') return <div className="flex flex-col h-full bg-slate-900 p-6 overflow-y-auto">{renderComparison()}</div>;
    if (viewMode === 'proximity') return <div className="flex flex-col h-full bg-slate-900 p-6 overflow-y-auto">{renderProximity()}</div>;

    return (
        <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-full overflow-hidden">
            <div className="p-6 flex-1 overflow-y-auto">
                <header className="mb-6 flex justify-between items-center border-b border-slate-800 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">Resultados</h2>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{results.length} Analizados</span>
                    </div>
                    <div className="flex gap-2">
                        {results.length >= 2 && <button onClick={() => { setViewMode('comparison'); if (compareIndices.length < 2) setCompareIndices([0, 1]); }} className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded text-[10px] font-bold">Comparar</button>}
                        <button onClick={onReset} className="text-slate-500 hover:text-white">✕</button>
                    </div>
                </header>

                <div className="space-y-4">
                    {results.map((resItem, idx) => {
                        const isExpanded = expandedFeatureIdx === idx;
                        const isComparing = compareIndices.includes(idx);
                        
                        const totalArea = resItem.area_total_ha || 0;
                        const restArea = Object.values(resItem.restricciones || {}).reduce((s, items) => s + sumArea(items), 0);
                        const cleanArea = Math.max(0, totalArea - restArea);
                        
                        const chartData = {
                            labels: ["Afectación", "Limpio"],
                            datasets: [{ data: [restArea, cleanArea], backgroundColor: ['#ef4444', '#10b981'], borderWidth: 0 }]
                        };

                        return (
                            <div key={idx} className={`border rounded-lg overflow-hidden transition-all ${isComparing ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-800/30'}`}>
                                <div className="p-3 flex justify-between items-center">
                                    <div onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)} className="flex-1 cursor-pointer">
                                        <span className="block text-sm font-bold text-white truncate">{resItem.featureName}</span>
                                        <div className="flex gap-2 mt-0.5">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">{formatNumber(totalArea)} ha</span>
                                            {restArea > 0 && <span className="text-[10px] text-red-400 font-bold uppercase">! Con Afectación</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button onClick={() => toggleComparison(idx)} className={`p-1.5 rounded transition-colors ${isComparing ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}><Layers className="w-3 h-3" /></button>
                                        <button onClick={() => handleGeneratePDF(resItem)} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"><Download className="w-3 h-3" /></button>
                                        <button onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)} className={`text-slate-500 transition-all ${isExpanded ? 'rotate-180' : ''}`}>▼</button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="p-4 border-t border-slate-700 bg-slate-900/30">
                                        <div className="flex gap-4 mb-4 items-center">
                                            <div className="w-20 h-20"><Doughnut data={chartData} options={{ cutout: '70%', plugins: { legend: { display: false } } }} /></div>
                                            <div className="flex flex-col">
                                                <span className="text-2xl font-light text-white">{formatNumber(totalArea)} <span className="text-xs text-slate-500">ha</span></span>
                                                <span className={`text-[10px] font-bold uppercase ${restArea > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {restArea > 0 ? `${formatNumber((restArea/totalArea)*100, 1)}% Afectado` : '100% Sin Restricciones'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            {Object.entries(resItem.restricciones || {}).map(([lId, items]) => items.length > 0 && (
                                                <div key={lId} className="border border-slate-800 rounded overflow-hidden">
                                                    <div onClick={() => toggleFormation(lId)} className="bg-slate-800/50 p-2 flex justify-between items-center cursor-pointer">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: getLayerColor(lId)}}></div>
                                                            <span className="text-[10px] font-bold text-slate-300 uppercase">{getLayerDisplayName(lId)}</span>
                                                        </div>
                                                        <span className="text-[9px] text-slate-500">{formatNumber(sumArea(items))} ha</span>
                                                    </div>
                                                    {expandedFormations[lId] && (
                                                        <div className="p-2 space-y-1 bg-slate-950/20">
                                                            {items.map((item, i) => (
                                                                <div key={i} className="flex justify-between text-[9px]">
                                                                    <span className="text-slate-400 truncate w-32">{item.nombre || item.Name || 'Item'}</span>
                                                                    <span className="text-slate-200 font-bold">{formatNumber(item.area_interseccion_ha)} ha</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
                <button onClick={onReset} className="flex-1 bg-slate-800 py-3 rounded-lg text-xs font-bold uppercase">Cerrar</button>
                <button onClick={() => { onReset(); setTimeout(() => onStartDrawing('draw_polygon'), 100); }} className="flex-1 bg-blue-600 py-3 rounded-lg text-xs font-bold uppercase shadow-lg shadow-blue-900/30">Analizar Nuevo</button>
            </div>
        </div>
    );
};

export default Sidebar;
