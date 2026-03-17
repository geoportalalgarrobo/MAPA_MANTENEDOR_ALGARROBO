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

const Sidebar = ({ isAnalyzing, results, showResultsPanel, setShowResultsPanel, error, onReset, onStartDrawing, activeDrawMode, onFileUpload, activeLayers, onToggleLayer, mapStyle, setMapStyle, onClearHistory, layerOrder, onReorderLayers, availableLayers = [] }) => {
    const [expandedFeatureIdx, setExpandedFeatureIdx] = React.useState(-1);
    const [expandedFormations, setExpandedFormations] = React.useState({});

    const layerNames = {
        areas_protegidas: "Áreas Protegidas",
        sitios_prioritarios: "Sitios Prioritarios",
        ecosistemas: "Ecosistemas",
        terrenos: "Terrenos Analizados",
        regiones_simplified: "Límites Regionales",
        provincias_simplified: "Límites Provinciales",
        comunas_simplified: "Límites Comunales",
        concesiones_mineras_const: "Catastro Minero Constituidas",
        concesiones_mineras_tramite: "Catastro Minero en Trámite"
    };

    const getLayerDisplayName = (id) => layerNames[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const LAYER_COLORS = {
        areas_protegidas:          '#60a5fa', // Blue 400
        sitios_prioritarios:       '#c084fc', // Purple 400
        ecosistemas:               '#4ade80', // Green 400
        ecosistemas_multipart:     '#22c55e', // Green 500
        ecmpo:                     '#fb7185', // Rose 400
        concesiones_acuicultura:   '#22d3ee', // Cyan 400
        concesiones_mineras_const: '#fbbf24', // Amber 400
        concesiones_mineras_tramite: '#f59e0b', // Amber 500
        comunas_simplified:        '#94a3b8', // Slate 400
        provincias_simplified:     '#64748b', // Slate 500
        regiones_simplified:       '#475569', // Slate 600
        terrenos:                  '#34d399', // Emerald 400
    };

    const getLayerColor = (id) => LAYER_COLORS[id] || '#94a3b8'; // Gris por defecto

    const [showDownloadMenu, setShowDownloadMenu] = React.useState(false);
    const [draggedLayer, setDraggedLayer] = React.useState(null);
    const [dragOverLayer, setDragOverLayer] = React.useState(null);

    const handleDownloadData = (format) => {
        if (!results || results.length === 0) return;

        const enrichedFeatures = results.map(r => {
            // Calcular área total de restricciones de forma dinámica
            const totalArea = r.area_total_ha || 0;
            let restrictionsAreaSum = 0;
            
            if (r.restricciones) {
                Object.values(r.restricciones).forEach(items => {
                    if (Array.isArray(items)) {
                        items.forEach(item => {
                            restrictionsAreaSum += (item.area_interseccion_ha || 0);
                        });
                    }
                });
            }
            
            // Capar al área total para evitar errores de precisión geométrica
            restrictionsAreaSum = Math.min(totalArea, restrictionsAreaSum);
            const hasRestrictionsFlag = restrictionsAreaSum > 0.01;
            const percentRestricted = totalArea > 0 ? (restrictionsAreaSum / totalArea) * 100 : 0;

            const baseProps = {
                Nombre: r.featureName,
                'Región': r.dpa?.Region?.join(', ') || 'N/A',
                'Provincia': r.dpa?.Provincia?.join(', ') || 'N/A',
                'Comuna': r.dpa?.Comuna?.join(', ') || 'N/A',
                'Área Total (ha)': Math.round(totalArea * 100) / 100,
                'Restricciones': hasRestrictionsFlag ? 'Sí' : 'No',
                'Área Restringida (ha)': Math.round(restrictionsAreaSum * 100) / 100,
                'Capa': 'Terrenos Analizados',
                'Con Restricción (%)': `${Math.round(percentRestricted * 10) / 10}%`
            };

            // Añadir áreas individuales de cada capa detectada
            if (r.restricciones) {
                Object.entries(r.restricciones).forEach(([layerId, items]) => {
                    const layerArea = items.reduce((s, item) => s + (item.area_interseccion_ha || 0), 0);
                    if (layerArea > 0) {
                        // Limpiar nombre de capa (quitar .lowres y simplificar)
                        const cleanLayerId = layerId.replace('.lowres', '').replace('_simplified', '');
                        baseProps[`Área ${cleanLayerId} (ha)`] = Math.round(layerArea * 100) / 100;
                    }
                });
            }

            return {
                ...(r.originalFeature || {}),
                properties: {
                    ...(r.originalFeature?.properties || {}),
                    ...baseProps
                }
            };
        });

        if (format === 'json') {
            const geojson = { type: "FeatureCollection", features: enrichedFeatures };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "terrenos_analizados.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else if (format === 'csv') {
            if (enrichedFeatures.length === 0) return;
            const headers = Object.keys(enrichedFeatures[0].properties);
            const csvRows = [];
            csvRows.push(headers.join(','));
            for (const row of enrichedFeatures) {
                const values = headers.map(header => {
                    const val = row.properties[header];
                    const escaped = ('' + val).replace(/"/g, '""');
                    return `"${escaped}"`;
                });
                csvRows.push(values.join(','));
            }
            const dataStr = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join('\n'));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "terrenos_analizados.csv");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }
        setShowDownloadMenu(false);
    };

    const renderControls = () => (
        <div className="mb-8 flex flex-col gap-6">
            {/* HERRAMIENTAS - Moved to Top without Title */}
            <div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed bg-slate-800/30 p-2.5 rounded border border-slate-800/80">
                    💡 Sube el polígono de tu terreno en un archivo espacial (.geojson, .kml, shapefiles en .zip) o dibújalo. Haz <strong>doble clic</strong> para terminar el dibujo.
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <button
                        onClick={() => onStartDrawing('draw_polygon')}
                        className={`${activeDrawMode === 'draw_polygon' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 border-emerald-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-emerald-600/50 hover:text-white hover:border-emerald-500'} font-medium py-3 px-2 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 border group`}
                        title="Dibujar Polígono"
                    >
                        <Hexagon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold">Dibujar</span>
                    </button>

                    <div className="relative">
                        <input type="file" id="file-upload" className="hidden" accept=".geojson,.json,.kml,.zip" onChange={onFileUpload} />
                        <label htmlFor="file-upload" className="w-full h-full bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white cursor-pointer font-medium py-3 px-2 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 border border-slate-700 hover:border-blue-500 group">
                            <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-center leading-tight">Subir Archivo<br />Espacial</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* TERRENOS ANALIZADOS (MOVED TO TOP) */}
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-lg p-3 shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={activeLayers['terrenos']}
                            onChange={() => onToggleLayer('terrenos')}
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${activeLayers['terrenos'] ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${activeLayers['terrenos'] ? 'translate-x-5' : 'translate-x-1'}`} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm shadow-sm" style={{ backgroundColor: getLayerColor('terrenos') }}></div>
                        <span className="text-emerald-400 text-sm font-semibold tracking-wide uppercase transition-colors">Terrenos Analizados</span>
                    </div>
                </label>

                {activeLayers.terrenos && results?.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3">
                        <div className="flex flex-col gap-1 bg-slate-900/60 p-2 rounded border border-slate-700/50 max-h-32 overflow-y-auto">
                            {results.map((r, i) => (
                                <div key={i} className="text-xs text-slate-400 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 flex-shrink-0"></span>
                                    <span className="truncate" title={r.featureName}>{r.featureName}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowResultsPanel(true)}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
                            >
                                <Layers className="w-3.5 h-3.5" />
                                <span>Ver Resultados</span>
                            </button>
                            
                            <div className="relative">
                                <button
                                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                    className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-3 h-full text-xs font-bold rounded-lg transition-colors flex justify-center items-center gap-2 border border-slate-600"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Exportar</span>
                                </button>
                                {showDownloadMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-40 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 mb-1">Formato</div>
                                        <button
                                            onClick={() => handleDownloadData('json')}
                                            className="text-left px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
                                        >
                                            <Spline className="w-3.5 h-3.5" />
                                            GeoJSON (Mapa)
                                        </button>
                                        <button
                                            onClick={() => handleDownloadData('csv')}
                                            className="text-left px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2"
                                        >
                                            <GripVertical className="w-3.5 h-3.5 rotate-90" />
                                            Excel / CSV
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <button
                            onClick={onClearHistory}
                            className="w-full mt-1 bg-red-900/10 hover:bg-red-900/30 text-red-500/70 hover:text-red-400 py-1.5 text-[10px] font-bold rounded-lg transition-all border border-red-900/20 uppercase tracking-tighter"
                        >
                            Limpiar Historial del Mapa
                        </button>
                    </div>
                )}
            </div>

            {/* MAPA BASE */}
            <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <MapIcon className="w-5 h-5 text-slate-400" /> MAPA BASE
                </h3>
                <div className="flex bg-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setMapStyle && setMapStyle('dark')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'dark' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Oscuro
                    </button>
                    <button
                        onClick={() => setMapStyle && setMapStyle('light')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'light' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Claro
                    </button>
                    <button
                        onClick={() => setMapStyle && setMapStyle('satellite')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mapStyle === 'satellite' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Satélite
                    </button>
                </div>
            </div>

            {/* CAPAS */}
            <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-slate-400" /> CAPAS DE REFERENCIA
                </h3>
                <div className="space-y-1">
                    {(layerOrder || ['areas_protegidas', 'sitios_prioritarios', 'ecosistemas', 'concesiones', 'ecmpo', 'concesiones_mineras_const', 'concesiones_mineras_tramite', 'regiones', 'provincias', 'comunas']).map((layerId) => (
                        <div
                            key={layerId}
                            draggable
                            onDragStart={(e) => {
                                setDraggedLayer(layerId);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', layerId);
                                e.currentTarget.style.opacity = '0.4';
                            }}
                            onDragEnd={(e) => {
                                e.currentTarget.style.opacity = '1';
                                setDraggedLayer(null);
                                setDragOverLayer(null);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (layerId !== draggedLayer) {
                                    setDragOverLayer(layerId);
                                }
                            }}
                            onDragLeave={() => {
                                setDragOverLayer(null);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (!draggedLayer || draggedLayer === layerId) return;
                                const currentOrder = [...(layerOrder || [])];
                                const fromIdx = currentOrder.indexOf(draggedLayer);
                                const toIdx = currentOrder.indexOf(layerId);
                                if (fromIdx === -1 || toIdx === -1) return;
                                currentOrder.splice(fromIdx, 1);
                                currentOrder.splice(toIdx, 0, draggedLayer);
                                onReorderLayers(currentOrder);
                                setDraggedLayer(null);
                                setDragOverLayer(null);
                            }}
                            className={`flex flex-col gap-1 rounded-md transition-all duration-150 ${dragOverLayer === layerId
                                    ? 'border-t-2 border-blue-500 pt-1'
                                    : 'border-t-2 border-transparent'
                                } ${draggedLayer === layerId ? 'opacity-40' : ''}`}
                        >
                            <label className="flex items-center gap-2 cursor-pointer group px-2 py-1.5 rounded-md hover:bg-slate-800/60 transition-colors">
                                <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors" />
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={activeLayers[layerId]}
                                        onChange={() => onToggleLayer(layerId)}
                                    />
                                    <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${activeLayers[layerId] ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${activeLayers[layerId] ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm shadow-sm" style={{ backgroundColor: getLayerColor(layerId) }}></div>
                                    <span className="text-slate-300 text-sm group-hover:text-white transition-colors">{getLayerDisplayName(layerId)}</span>
                                </div>
                            </label>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-3 italic px-1">⇅ Arrastra para reordenar. Arriba en la lista = más al fondo en el mapa.</p>
            </div>
        </div>
    );

    // Initial State (Or if showResultsPanel is toggled off)
    if (!isAnalyzing && !showResultsPanel && !error) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 overflow-y-auto">
                <header className="mb-8 flex flex-col items-center justify-center text-center">
                    <img src={LogoImage} alt="Logo" className="h-16 w-auto mb-4 opacity-100" />
                    <h1 className="text-2xl font-bold text-white tracking-tight">Geoportal</h1>
                    <p className="text-slate-400 text-sm mt-1">Sitios Prioritarios - Ley 21.600 y otras restricciones</p>
                </header>

                {renderControls()}
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200">
                <header className="mb-6 flex flex-col items-center justify-center text-center">
                    <img src={LogoImage} alt="Logo" className="h-12 w-auto mb-2 opacity-100" />
                    <h1 className="text-xl font-bold text-white tracking-tight">Geoportal</h1>
                </header>
                <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-5 mb-4">
                    <p className="text-red-400 font-medium">{error}</p>
                </div>
                <button
                    onClick={onReset}
                    className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-colors border border-slate-700"
                >
                    Volver Atrás
                </button>
            </div>
        );
    }

    if (isAnalyzing) {
        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 text-slate-200 items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-slate-300">Consultando bases de datos espaciales...</p>
            </div>
        )
    }

    // Results State
    if (showResultsPanel && results && Array.isArray(results) && results.length > 0) {

        // Utilities
        const formatNumber = (num, decimals = 2) => {
            if (num === undefined || num === null) return "0";
            return new Intl.NumberFormat('es-CL', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(num);
        };

        const toggleFormation = (formacion) => {
            setExpandedFormations(prev => ({
                ...prev,
                [formacion]: !prev[formacion]
            }));
        };

        const sumArea = (features) => {
            if (!features) return 0;
            return features.reduce((sum, f) => sum + (f.area_interseccion_ha || 0), 0);
        };

        return (
            <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200 w-full">
                <div className="p-6 flex-1 overflow-y-auto">
                    <header className="mb-6 flex justify-between items-center border-b border-slate-800 pb-4">
                        <div className="flex flex-col">
                            <h2 className="text-xl font-bold text-white tracking-tight">Geometrías ({results.length})</h2>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Resultados del Análisis</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => handleDownloadData('json')}
                                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg shadow-lg border border-blue-400/50 transition-all flex items-center gap-2"
                                title="Descargar GeoJSON"
                            >
                                <Download className="w-4 h-4" />
                                <span className="text-[10px] font-bold">GEOJSON</span>
                            </button>
                            <button onClick={onReset} className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-2 rounded-lg border border-slate-700 transition-colors">✕</button>
                        </div>
                    </header>

                    <div className="space-y-4 mb-4">
                        {results.map((resItem, idx) => {
                            const isExpanded = expandedFeatureIdx === idx;

                            const spArea = sumArea(resItem.restricciones?.sitios_prioritarios);
                            const apArea = sumArea(resItem.restricciones?.areas_protegidas);
                            const acuArea = sumArea(resItem.restricciones?.concesiones_acuicultura);
                            const ecmpoArea = sumArea(resItem.restricciones?.ecmpo);
                            const miningAreaConst = sumArea(resItem.restricciones?.concesiones_mineras_const);
                            const miningAreaTramite = sumArea(resItem.restricciones?.concesiones_mineras_tramite);
                            const totalArea = resItem.area_total_ha || 0;

                            const restrictionsAreaSum = Math.min(totalArea, spArea + apArea + acuArea + ecmpoArea + miningAreaConst + miningAreaTramite);
                            const freeArea = Math.max(0, totalArea - restrictionsAreaSum);

                            const chartLabels = [];
                            const chartData = [];
                            const bgColors = [];

                            if (spArea > 0) {
                                chartLabels.push("S. Prioritarios");
                                chartData.push(Number(spArea.toFixed(2)));
                                bgColors.push('#a855f7');
                            }
                            if (apArea > 0) {
                                chartLabels.push("A. Protegidas");
                                chartData.push(Number(apArea.toFixed(2)));
                                bgColors.push('#3b82f6');
                            }
                            if (acuArea > 0) {
                                chartLabels.push("C. Acuicultura");
                                chartData.push(Number(acuArea.toFixed(2)));
                                bgColors.push('#06b6d4'); // cyan-500
                            }
                            if (ecmpoArea > 0) {
                                chartLabels.push("ECMPO");
                                chartData.push(Number(ecmpoArea.toFixed(2)));
                                bgColors.push('#f43f5e'); // rose-500
                            }
                            if (miningAreaConst > 0) {
                                chartLabels.push("C.M. Constituidas");
                                chartData.push(Number(miningAreaConst.toFixed(2)));
                                bgColors.push('#d97706'); // amber-600
                            }
                            if (miningAreaTramite > 0) {
                                chartLabels.push("C.M. en Trámite");
                                chartData.push(Number(miningAreaTramite.toFixed(2)));
                                bgColors.push('#8b5cf6'); // violet-500
                            }

                            if (freeArea > 0 || chartData.length === 0) {
                                chartLabels.push("Sin Restricciones");
                                chartData.push(Number(freeArea > 0 ? freeArea.toFixed(2) : totalArea.toFixed(2) || 1));
                                bgColors.push('#10b981');
                            }

                            const data = {
                                labels: chartLabels,
                                datasets: [{ data: chartData, backgroundColor: bgColors, borderWidth: 1, borderColor: '#0f172a' }]
                            };

                            const hasRestrictionsFlag =
                                resItem.restricciones?.sitios_prioritarios?.length > 0 ||
                                resItem.restricciones?.areas_protegidas?.length > 0 ||
                                resItem.restricciones?.concesiones_acuicultura?.length > 0 ||
                                resItem.restricciones?.ecmpo?.length > 0 ||
                                resItem.restricciones?.concesiones_mineras_const?.length > 0 ||
                                resItem.restricciones?.concesiones_mineras_tramite?.length > 0;

                            return (
                                <div key={idx} className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-800/30">
                                    <button
                                        onClick={() => setExpandedFeatureIdx(isExpanded ? -1 : idx)}
                                        className="w-full text-left bg-slate-800 hover:bg-slate-700 p-4 flex justify-between items-center transition-colors"
                                    >
                                        <div className="flex flex-col">
                                            <span className="block text-sm font-semibold text-white">{resItem.featureName}</span>
                                            <span className="block text-xs text-slate-400 mt-1">{formatNumber(totalArea)} ha • {hasRestrictionsFlag ? `Con Restricciones (${formatNumber(totalArea > 0 ? (restrictionsAreaSum / totalArea) * 100 : 0, 1)}%)` : 'Sin Restricciones'}</span>
                                        </div>
                                        <span className={`text-slate-400 text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                    </button>

                                    {isExpanded && (
                                        <div className="p-4 border-t border-slate-700/50">
                                            <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-700/50 flex flex-col items-start gap-1">
                                                <span className="text-sm text-slate-400 block mb-1">Área Calculada</span>
                                                <strong className="text-3xl text-white font-light">{formatNumber(totalArea)} <span className="text-lg text-slate-500 font-normal">ha</span></strong>
                                            </div>

                                            {/* Ubicación DPA */}
                                            {resItem.dpa && (resItem.dpa.Region?.length > 0 || resItem.dpa.Provincia?.length > 0 || resItem.dpa.Comuna?.length > 0) && (
                                                <div className="bg-slate-900/50 rounded-xl p-4 mb-5 border border-slate-700/50 flex flex-col gap-2">
                                                    <span className="text-sm text-slate-400 block mb-1 flex items-center gap-2"><MapPin className="w-4 h-4" /> Ubicación Administrativa</span>
                                                    {resItem.dpa.Region?.length > 0 && <span className="text-xs text-slate-300"><strong>Región:</strong> {resItem.dpa.Region.join(', ')}</span>}
                                                    {resItem.dpa.Provincia?.length > 0 && <span className="text-xs text-slate-300"><strong>Provincia:</strong> {resItem.dpa.Provincia.join(', ')}</span>}
                                                    {resItem.dpa.Comuna?.length > 0 && <span className="text-xs text-slate-300"><strong>Comuna:</strong> {resItem.dpa.Comuna.join(', ')}</span>}
                                                </div>
                                            )}

                                            <div className="mb-6 h-[200px] w-full flex justify-center bg-slate-950/30 rounded-lg p-2 border border-slate-800/50">
                                                <Doughnut
                                                    data={data}
                                                    options={{
                                                        maintainAspectRatio: false,
                                                        cutout: '70%',
                                                        plugins: {
                                                            legend: { position: 'right', labels: { color: '#cbd5e1', padding: 10, font: { size: 10 } } },
                                                            tooltip: {
                                                                callbacks: {
                                                                    label: function (context) {
                                                                        const label = context.label || '';
                                                                        const value = context.raw;
                                                                        const chartTotal = context.chart._metasets[context.datasetIndex].total || chartData.reduce((a, b) => a + b, 0);
                                                                        const percentage = chartTotal > 0 ? ((value / chartTotal) * 100) : 0;
                                                                        return `${label}: ${formatNumber(value)} ha (${formatNumber(percentage, 1)}%)`;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-4 mb-2">
                                                {!hasRestrictionsFlag && (
                                                    <div className="bg-emerald-900/20 border border-emerald-800/30 p-3 rounded-lg flex gap-3 items-center">
                                                        <span className="text-lg">✅</span>
                                                        <span className="text-emerald-400 text-xs">Sin restricciones normativas.</span>
                                                    </div>
                                                )}
                                                {/* SECCIÓN DE DATOS DINÁMICA */}
                                                {Object.entries(resItem.restricciones || {}).map(([layerId, items]) => {
                                                    if (!items || items.length === 0) return null;
                                                    const color = getLayerColor(layerId);
                                                    
                                                    return (
                                                        <div key={layerId} className="border border-slate-800 rounded-lg overflow-hidden mb-3">
                                                            <div 
                                                                className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
                                                                style={{ borderLeft: `4px solid ${color}`, backgroundColor: `${color}10` }}
                                                                onClick={() => toggleFormation(layerId)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                                                                        {getLayerDisplayName(layerId)}
                                                                    </span>
                                                                    <span className="bg-slate-900/80 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700">
                                                                        {items.length}
                                                                    </span>
                                                                </div>
                                                                <span className="text-slate-500 text-xs">{expandedFormations[layerId] ? '▲' : '▼'}</span>
                                                            </div>

                                                            {expandedFormations[layerId] && (
                                                                <div className="p-3 bg-slate-950/30 flex flex-col gap-2">
                                                                    {items.map((item, i) => (
                                                                        <div key={i} className="text-[11px] text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800/50">
                                                                            <span className="block font-semibold text-slate-200 mb-1 truncate" title={item.nombre || item.Name || item.NOMBRE}>
                                                                                {item.nombre || item.Name || item.NOMBRE || item.nombreorig || `Elemento ${i+1}`}
                                                                            </span>
                                                                            
                                                                            <div className="flex flex-wrap gap-x-3 gap-y-1 opacity-80">
                                                                                {Object.entries(item).map(([key, val]) => {
                                                                                    if (['geometry', 'GEOMETRY', 'area_interseccion_ha'].includes(key)) return null;
                                                                                    if (val === null || val === undefined) return null;
                                                                                    return (
                                                                                        <span key={key} className="inline-block">
                                                                                            <strong className="text-slate-500">{key}:</strong> {String(val)}
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>

                                                                            <div className="mt-2 pt-2 border-t border-slate-800/50 flex justify-between items-center">
                                                                                <span className="text-[color:var(--color)] font-medium" style={{"--color": color}}>
                                                                                    Afectación: {formatNumber(item.area_interseccion_ha)} ha
                                                                                </span>
                                                                                <span className="text-slate-500 text-[10px]">
                                                                                    {formatNumber(totalArea > 0 ? ((item.area_interseccion_ha || 0) / totalArea) * 100 : 0, 1)}% del terreno
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
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
                {/* Fixed bottom floating action bar */}
                <div className="px-6 py-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex gap-2 shrink-0 z-10 w-full">
                    <button
                        onClick={onReset}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-lg transition-colors border border-slate-700 flex items-center justify-center gap-2"
                    >
                        <span>⬅️</span>
                        <span>Cerrar</span>
                    </button>
                    <button
                        onClick={() => { onReset(); setTimeout(() => onStartDrawing('draw_polygon'), 100); }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 border border-emerald-500"
                    >
                        <span>✏️</span>
                        <span>Dibujar Otro</span>
                    </button>
                </div>
            </div>
        );
    }
};

export default Sidebar;
