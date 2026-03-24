import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
    GlobeAltIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';

interface ServiceStatus {
    name: string;
    status: 'online' | 'offline' | 'loading';
    latency?: number;
    type: 'free' | 'premium';
}

export function ServiceStatusDashboard() {
    const { isDark } = useTheme();
    const [services, setServices] = useState<ServiceStatus[]>([
        { name: 'Photon (Free)', status: 'loading', type: 'free' },
        { name: 'Nominatim (Free)', status: 'loading', type: 'free' },
        { name: 'Google Maps', status: 'loading', type: 'premium' }
    ]);

    useEffect(() => {
        const checkStatus = async () => {
            // Check Photon
            const photonStart = Date.now();
            try {
                const res = await fetch('https://photon.komoot.io/api/?q=kyiv&limit=1', { method: 'HEAD' });
                updateService('Photon (Free)', res.ok ? 'online' : 'offline', Date.now() - photonStart);
            } catch {
                updateService('Photon (Free)', 'offline');
            }

            // Check Nominatim
            const nominatimStart = Date.now();
            try {
                const res = await fetch('https://nominatim.openstreetmap.org/search?q=kyiv&format=json&limit=1', { method: 'HEAD' });
                updateService('Nominatim (Free)', res.ok ? 'online' : 'offline', Date.now() - nominatimStart);
            } catch {
                updateService('Nominatim (Free)', 'offline');
            }

            // Check Google Maps
            if ((window as any).google && (window as any).google.maps) {
                updateService('Google Maps', 'online', 0);
            } else {
                const interval = setInterval(() => {
                    if ((window as any).google && (window as any).google.maps) {
                        updateService('Google Maps', 'online', 0);
                        clearInterval(interval);
                    }
                }, 1000);
                setTimeout(() => clearInterval(interval), 10000);
            }
        };

        checkStatus();
    }, []);

    const updateService = (name: string, status: 'online' | 'offline', latency?: number) => {
        setServices(prev => prev.map(s =>
            s.name === name ? { ...s, status, latency } : s
        ));
    };

    return (
        <div className={clsx(
            "flex items-center gap-3 px-4 py-2 rounded-2xl shadow-sm border transition-all duration-300",
            isDark ? "bg-gray-800/80 border-gray-700/50 backdrop-blur-md" : "bg-white/80 border-gray-200/50 backdrop-blur-md"
        )}>
            <div className={clsx(
                "flex items-center gap-2 px-3 py-1 rounded-xl",
                isDark ? "bg-gray-900/50 text-gray-400" : "bg-gray-100 text-gray-500"
            )}>
                <GlobeAltIcon className="w-4 h-4" />
                <span className="text-[11px] font-bold uppercase tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500">

                </span>
            </div>

            <div className="flex items-center gap-5 ml-2">
                {services.map((service) => (
                    <div key={service.name} className="flex items-center gap-2.5 group cursor-help" title={service.status === 'online' && service.latency ? `Задержка: ${service.latency}мс` : ''}>
                        <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                            {service.status === 'online' && (
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40"></span>
                            )}
                            <span className={clsx(
                                "relative inline-flex rounded-full h-2 w-2 shadow-sm",
                                service.status === 'online' ? "bg-emerald-500 shadow-emerald-500/50" :
                                    service.status === 'offline' ? "bg-red-500 shadow-red-500/50" : "bg-gray-400 animate-pulse"
                            )}></span>
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className={clsx(
                                "text-[11px] font-bold tracking-wide transition-colors duration-200",
                                isDark ? "text-gray-300 group-hover:text-white" : "text-gray-700 group-hover:text-gray-900"
                            )}>
                                {service.name.replace(' (Free)', '')}
                            </span>
                            {/* Optional: Add tiny badge for Free/Premium */}
                            {/* <span className={clsx(
                                "text-[8px] font-semibold tracking-wider font-mono uppercase mt-0.5",
                                service.type === 'free' ? "text-emerald-500" : "text-amber-500"
                            )}>{service.type}</span> */}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
