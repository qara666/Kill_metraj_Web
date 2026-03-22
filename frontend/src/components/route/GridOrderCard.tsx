import { memo, useMemo } from 'react';
import clsx from 'clsx';
import { 
  CheckBadgeIcon, 
  ClockIcon, 
  MapPinIcon 
} from '@heroicons/react/24/outline';
import { 
  CheckBadgeIcon as CheckBadgeIconSolid, 
  HomeIcon as HomeIconSolid, 
  MapIcon as MapIconSolid, 
  ExclamationCircleIcon as ExclamationCircleIconSolid
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import type { Order } from '../../types';
import { getPlannedTime } from '../../utils/data/timeUtils';
import { formatTimeLabel } from '../../utils/route/routeCalculationHelpers';
import { getStatusBadgeProps } from '../../utils/data/statusBadgeHelper';

export const GridOrderCard = memo(({ order, isDark, isSelected, onSelect, isUnassigned }: { order: Order, isDark: boolean, isSelected: boolean, onSelect: (id: string) => void, isUnassigned?: boolean }) => {
    // v42: Premium "Cool" Badges Synchronization
    const { timeLabel, statusProps, badges } = useMemo(() => {
        const timeLabel = formatTimeLabel(getPlannedTime(order) || 0);
        const statusProps = order.status ? getStatusBadgeProps(order.status, isDark) : null;
        
        const raw = (order as any).raw || {};
        const coords = (order as any).coords || {};
        const meta = (order as any).locationMeta || {};

        const locType = order.locationType || coords.locationType || raw.locationType;
        const isRooftop = locType === 'ROOFTOP';
        const isInterpolated = locType === 'RANGE_INTERPOLATED';
        const streetMatched = order.streetNumberMatched ?? raw.streetNumberMatched ?? coords.streetNumberMatched;
        
        const badgesArr: React.ReactNode[] = [];

        // 1. Verified Status v42.1
        if (isRooftop) {
            badgesArr.push(
                <div key="verified" className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                    isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                )}>
                    <CheckBadgeIconSolid className="w-3.5 h-3.5" />
                    ТОЧНИЙ АДРЕС
                </div>
            );
        }

        // 1.1 Locked Status v42.1
        if ((order as any).isLocked) {
            badgesArr.push(
                <div key="locked" className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                    isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
                )}>
                    <CheckBadgeIconSolid className="w-3.5 h-3.5" />
                    ПЕРЕВІРЕНО
                </div>
            );
        }

        (() => {
            const opZone = order.deliveryZone || raw.deliveryZone;
            const kmlZone = order.kmlZone || meta.kmlZone || coords.kmlZone;
            const hub = order.kmlHub || meta.hubName || coords.kmlHub;
            
            const kmlFull = kmlZone ? `${hub ? hub + ' - ' : ''}${kmlZone}` : null;
            const same = opZone && kmlFull && opZone.trim().toLowerCase() === kmlFull.trim().toLowerCase();

            badgesArr.push(
                <div key="sector" className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                    ((String(opZone || '').includes('ID:0') || String(kmlZone || '').includes('ID:0')) && !same)
                        ? (isDark ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-red-50 border-red-200 text-red-600 shadow-red-500/10")
                        : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
                )}>
                    <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                    <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                    {(() => {
                        if (same) return `FO/KML:${opZone.trim()}`.toUpperCase();
                        const zones = [
                            opZone ? `FO:${opZone}` : null,
                            kmlFull ? `KML:${kmlFull}` : null
                        ].filter(Boolean).join(' | ').toUpperCase();
                        return zones || '—';
                    })()}
                </div>
            );
        })();

        // 3. Street Match v42.1
        badgesArr.push(
            <div key="street" className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                locType && locType !== 'APPROXIMATE' && !isInterpolated
                    ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                    : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
            )}>
                <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                {locType && locType !== 'APPROXIMATE' && !isInterpolated ? 'ТАК' : 'НІ'}
            </div>
        );

        // 3.1 House Match v42.1
        const houseMatched = streetMatched || isInterpolated || isRooftop;
        badgesArr.push(
            <div key="house" className={clsx(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                houseMatched 
                    ? (isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")
                    : (isDark ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700")
            )}>
                <HomeIconSolid className="w-3.5 h-3.5 opacity-70" />
                <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                {houseMatched ? 'ТАК' : 'НІ'}
            </div>
        );

        // 6. Unverified Warning - Only if coordinates are missing
        if (!(order.lat || (order as any).coords?.lat) || !(order.lng || (order as any).coords?.lng)) {
            badgesArr.push(
                <div key="warning" className={clsx(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 animate-pulse shadow-sm",
                    isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
                )}>
                    <ExclamationCircleIconSolid className="w-3.5 h-3.5" />
                    УТОЧНИТИ АДРЕСУ
                </div>
            );
        }

        return { 
            timeLabel, 
            statusProps, 
            badges: badgesArr
        };
    }, [order, isDark]);

    return (
        <div
            onClick={() => onSelect(order.id)}
            className={clsx(
                "p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md relative overflow-hidden flex flex-col h-full", 
                "contain-content", 
                isSelected
                    ? (isDark ? "bg-blue-500/10 border-blue-500 shadow-blue-500/20" : "bg-blue-50 border-blue-500 shadow-blue-500/10")
                    : (isDark ? "bg-gray-800/60 border-gray-700/50 hover:bg-gray-800" : "bg-white border-gray-100 hover:border-blue-100")
            )}
        >
            {isSelected && (
                <div className="absolute top-0 right-0 p-3 pt-4 pr-4">
                    <CheckBadgeIcon className="w-6 h-6 text-blue-500" />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mb-3 pr-6">
                <span className={clsx("font-black text-sm", isDark ? "text-gray-300" : "text-gray-700")}>#{order.orderNumber}</span>

                {isUnassigned && (
                    <span className={clsx(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg tracking-widest h-6 flex items-center border transition-all duration-300 shadow-sm",
                        isDark ? "bg-orange-500/20 border-orange-500/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-700 shadow-orange-500/5"
                    )}>НЕ НАЗНАЧЕНО</span>
                )}

                {timeLabel !== '00:00 - 00:00' && (
                    <span className={clsx(
                        "flex items-center gap-1 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-lg h-6 border transition-all duration-300 shadow-sm",
                        isDark ? "bg-slate-700/50 border-slate-600/30 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600 shadow-slate-500/5"
                    )}>
                        <ClockIcon className="w-3 h-3" />
                        {timeLabel}
                    </span>
                )}

                {statusProps && (
                    <span className={clsx(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg tracking-widest h-6 flex items-center border transition-all duration-300 shadow-sm",
                        statusProps.bgColorClass,
                        statusProps.textColorClass,
                        "border-current/10"
                    )}>
                        {statusProps.text}
                    </span>
                )}


                {/* SOTA v42 Sync Badges */}
                {badges}
            </div>

            <p className={clsx("text-sm font-bold mb-4 line-clamp-2 leading-tight flex-1", isDark ? "text-gray-100" : "text-gray-900")} title={order.address}>
                {order.address}
            </p>

            <div className="flex items-end justify-between mt-auto">
                <p className={clsx("text-lg font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                    {order.amount} ₴
                </p>
                
                {order.lat && order.lng && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const coords = `${order.lat},${order.lng}`;
                            navigator.clipboard.writeText(coords);
                            toast.success('Координаты скопированы', { icon: '📍', duration: 1500 });
                        }}
                        className={clsx(
                            "p-2 rounded-lg transition-all active:scale-90",
                            isDark ? "hover:bg-white/5 text-gray-500" : "hover:bg-gray-100 text-gray-400"
                        )}
                        title={`${order.lat}, ${order.lng}`}
                    >
                        <MapPinIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    )
})
