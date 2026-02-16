import React from 'react';
import { StatsCard } from '../shared/StatsCard';
import {
    DocumentArrowUpIcon,
    MapPinIcon,
    TruckIcon,
    ClockIcon
} from '@heroicons/react/24/outline';

interface AutoPlannerStatsProps {
    excelData: any;
    routes: any[];
}

export const AutoPlannerStats: React.FC<AutoPlannerStatsProps> = React.memo(({ excelData, routes }) => {
    if (!excelData) return null;

    const ordersCount = excelData.orders?.length || 0;
    const geocodedCount = excelData.orders?.filter((o: any) => o.coords).length || 0;

    const avgTime = routes.length > 0
        ? Math.round(routes.reduce((sum, r) => sum + (parseFloat(r.totalDurationMin) || 0), 0) / routes.length)
        : 0;

    const avgDistance = routes.length > 0
        ? (routes.reduce((sum, r) => sum + (parseFloat(r.totalDistanceKm) || 0), 0) / routes.length).toFixed(1)
        : '0';

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <StatsCard
                title="Заказов"
                value={ordersCount}
                icon={DocumentArrowUpIcon}
                color="primary"
            />

            <StatsCard
                title="Геокодировано"
                value={geocodedCount}
                icon={MapPinIcon}
                color="success"
            />

            <StatsCard
                title="Маршрутов"
                value={routes.length}
                icon={TruckIcon}
                color="warning"
            />

            <StatsCard
                title="Ср. показатели"
                value={`${avgTime} мин / ${avgDistance} км`}
                icon={ClockIcon}
            />
        </div>
    );
});
