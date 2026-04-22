import React, { useState, Suspense, lazy } from 'react';
import { clsx } from 'clsx';
import { TruckIcon } from '@heroicons/react/24/outline';
import { RouteMap } from './RouteMap';
import {
    exportToGoogleMaps,
    exportToWaze,
    exportToPDF,
    exportToValhalla,
    exportToVisicom
} from '../../utils/routes/routeExport';

const RouteDetailsTabs = lazy(() => import('../route/RouteDetailsTabs').then(m => ({ default: m.RouteDetailsTabs })));

interface RouteDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    route: any;
    onOrderClick: (order: any) => void;
}

export const RouteDetailModal: React.FC<RouteDetailModalProps> = ({
    isOpen,
    onClose,
    isDark,
    route,
    onOrderClick
}) => {
    const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

    if (!isOpen || !route) return null;

    const exportOptions = {
        route,
        orders: route.routeChainFull || [],
        startAddress: route.startAddress,
        endAddress: route.endAddress,
        startCoords: route.startCoords || route.route_data?.startCoords,
        endCoords: route.endCoords || route.route_data?.endCoords
    };

    return (
        <div 
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
            onClick={onClose}
        >
            <div 
                className={clsx(
                    'relative w-full h-full max-w-[95vw] max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col',
                    isDark ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-gray-700' : 'bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Заголовок */}
                <div className={clsx(
                    'px-8 py-6 border-b flex items-center justify-between',
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50'
                )}>
                    <div className="flex items-center gap-4">
                        <div className={clsx(
                            'p-3 rounded-2xl shadow-lg',
                            isDark ? 'bg-gradient-to-br from-blue-600 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-indigo-500'
                        )}>
                            <TruckIcon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h2 className={clsx('text-2xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                                {route.name}
                            </h2>
                            {route.hasCriticalTraffic && (
                                <div className={clsx(
                                    'inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium mt-2',
                                    isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                                )}>
                                    <span>️</span>
                                    <span>Критические пробки</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className={clsx(
                            'p-3 rounded-xl hover:opacity-70 transition-all',
                            isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        )}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Содержимое - скроллируемое */}
                <div 
                    className="flex-1 overflow-y-auto p-8"
                    onClick={() => { if (showExportMenu) setShowExportMenu(false); }}
                >
                    <div className="space-y-6 max-w-7xl mx-auto">
                        {/* Статистика маршрута */}
                        <div className={clsx(
                            'p-6 rounded-2xl border-2 grid grid-cols-2 md:grid-cols-4 gap-6',
                            isDark ? 'bg-gradient-to-br from-gray-900/80 to-gray-800/80 border-gray-700' : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
                        )}>
                            <div className={clsx(
                                'p-4 rounded-xl border-2',
                                isDark ? 'border-blue-600/30 bg-blue-900/20' : 'border-blue-200 bg-blue-50/50'
                            )}>
                                <div className="text-xs font-medium mb-1 opacity-70">Заказов</div>
                                <div className="text-2xl font-bold">{route.stopsCount || (route.routeChainFull?.length || 0)}</div>
                            </div>
                            <div className={clsx(
                                'p-4 rounded-xl border-2',
                                isDark ? 'border-green-600/30 bg-green-900/20' : 'border-green-200 bg-green-50/50'
                            )}>
                                <div className="text-xs font-medium mb-1 opacity-70">Расстояние</div>
                                <div className="text-2xl font-bold">{route.totalDistanceKm || '?'} <span className="text-sm font-normal">км</span></div>
                            </div>
                            <div className={clsx(
                                'p-4 rounded-xl border-2',
                                isDark ? 'border-orange-600/30 bg-orange-900/20' : 'border-orange-200 bg-orange-50/50'
                            )}>
                                <div className="text-xs font-medium mb-1 opacity-70">Время</div>
                                <div className="text-2xl font-bold">{route.totalDurationMin || '?'} <span className="text-sm font-normal">мин</span></div>
                            </div>
                            <div className={clsx(
                                'p-4 rounded-xl border-2',
                                isDark ? 'border-purple-600/30 bg-purple-900/20' : 'border-purple-200 bg-purple-50/50'
                            )}>
                                <div className="text-xs font-medium mb-1 opacity-70">Эффективность</div>
                                <div className="text-2xl font-bold">{((route.routeEfficiency || 0) * 100).toFixed(0)}%</div>
                            </div>
                        </div>

                        {/* Зоны доставки */}
                        {(() => {
                            const zones = new Set<string>();
                            (route.routeChainFull || []).forEach((o: any) => {
                                const zone = o.deliveryZone || o.raw?.deliveryZone || o.raw?.['Зона доставки'];
                                if (zone) zones.add(zone);
                            });
                            if (zones.size > 0) {
                                return (
                                    <div className={clsx('p-6 rounded-2xl border-2', isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-200')}>
                                        <div className={clsx('text-sm font-bold mb-3 flex items-center gap-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                            <span></span> Зоны доставки
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.from(zones).map((zone, idx) => (
                                                <span 
                                                    key={idx} 
                                                    className={clsx(
                                                        'px-3 py-1 rounded-lg text-sm font-medium',
                                                        isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                                                    )}
                                                >
                                                    {zone}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Порядок доставки */}
                        {(route.routeChainFull || []).length > 0 && (
                            <div className={clsx('p-6 rounded-2xl border-2', isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-200')}>
                                <div className={clsx('text-sm font-bold mb-3 flex items-center gap-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    <span></span> Порядок доставки
                                </div>
                                <div className="flex flex-wrap gap-2 text-sm">
                                    {(route.routeChainFull || []).map((o: any, idx: number) => (
                                        <span key={idx} className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                                            <span className="font-bold">{idx + 1}.</span> {o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`}
                                            {idx < (route.routeChainFull || []).length - 1 && ' → '}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Полезные действия */}
                        <div className={clsx('flex flex-wrap gap-3 p-4 rounded-xl', isDark ? 'bg-gray-800/50' : 'bg-gray-100')}>
                            <button 
                                onClick={() => {
                                    const routeText = `Маршрут: ${route.name}\n` +
                                        `Заказов: ${route.stopsCount || 0}\n` +
                                        `Расстояние: ${route.totalDistanceKm || '?'} км\n` +
                                        `Время: ${route.totalDurationMin || '?'} мин\n` +
                                        `Заказы: ${(route.routeChainFull || []).map((o: any) => o.orderNumber || o.raw?.orderNumber || '?' ).join(', ')}`;
                                    navigator.clipboard.writeText(routeText);
                                    alert('Информация о маршруте скопирована в буфер обмена!');
                                }}
                                className={clsx(
                                    'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105',
                                    isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                                )}
                            >
                                Копировать информацию
                            </button>

                            {/* Меню экспорта */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowExportMenu(!showExportMenu);
                                    }}
                                    className={clsx(
                                        'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                                        isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                                    )}
                                >
                                    Экспорт
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                
                                {showExportMenu && (
                                    <div 
                                        className={clsx(
                                            'absolute bottom-full left-0 mb-2 rounded-lg shadow-xl border-2 z-[100] min-w-[200px]',
                                            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                try {
                                                    const url = exportToGoogleMaps(exportOptions);
                                                    if (url) window.open(url, '_blank');
                                                } catch (error) {
                                                    console.error('Ошибка экспорта в Google Maps:', error);
                                                }
                                                setShowExportMenu(false);
                                            }}
                                            className={clsx(
                                                'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors rounded-t-lg',
                                                isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                            )}
                                        >
                                            🗺️ Google Maps
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                try {
                                                    const url = exportToVisicom(exportOptions);
                                                    if (url) window.open(url, '_blank');
                                                } catch (error) {
                                                    console.error('Ошибка экспорта в Visicom:', error);
                                                }
                                                setShowExportMenu(false);
                                            }}
                                            className={clsx(
                                                'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors',
                                                isDark ? 'hover:bg-gray-700 text-green-400 font-bold' : 'text-green-600 font-bold'
                                            )}
                                        >
                                            🇺🇦 Visicom (Точно)
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                try {
                                                    const url = exportToValhalla(exportOptions);
                                                    if (url) window.open(url, '_blank');
                                                } catch (error) {
                                                    console.error('Ошибка экспорта в Valhalla:', error);
                                                }
                                                setShowExportMenu(false);
                                            }}
                                            className={clsx(
                                                'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors',
                                                isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                            )}
                                        >
                                            🤖 OSM / Valhalla
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                try {
                                                    const url = exportToWaze(exportOptions);
                                                    if (url) window.open(url, '_blank');
                                                } catch (error) {
                                                    console.error('Ошибка экспорта в Waze:', error);
                                                }
                                                setShowExportMenu(false);
                                            }}
                                            className={clsx(
                                                'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors',
                                                isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                            )}
                                        >
                                            🚙 Waze
                                        </button>
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    await exportToPDF(exportOptions);
                                                } catch (error) {
                                                    console.error('Ошибка экспорта в PDF:', error);
                                                }
                                                setShowExportMenu(false);
                                            }}
                                            className={clsx(
                                                'w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors rounded-b-lg',
                                                isDark ? 'hover:bg-gray-700 text-gray-200' : 'text-gray-700'
                                            )}
                                        >
                                            📄 PDF
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Визуализация маршрута на карте */}
                        <div className="mt-6">
                            <div className={clsx('text-lg font-semibold mb-4 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                                <span>🗺️</span>
                                <span>Визуализация маршрута</span>
                            </div>
                            <RouteMap route={route} onMarkerClick={onOrderClick} />
                        </div>

                        {/* Детальная логика формирования */}
                        {route.reasons && route.reasons.length > 0 && (
                            <div className="mt-6">
                                <Suspense fallback={<div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>Загрузка деталей маршрута...</div>}>
                                    <RouteDetailsTabs reasons={route.reasons} />
                                </Suspense>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
