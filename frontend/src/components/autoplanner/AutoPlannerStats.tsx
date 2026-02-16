import React, { useMemo } from 'react';
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

    const { ordersCount, geocodedCount } = useMemo(() => {
        const orders = excelData.orders || [];
        return {
            ordersCount: orders.length,
            geocodedCount: orders.filter((o: any) => o.coords).length
        };
    }, [excelData]);

    const { avgTime, avgDistance } = useMemo(() => {
        if (routes.length === 0) return { avgTime: 0, avgDistance: '0' };

        let totalTime = 0;
        let totalDist = 0;

        routes.forEach(r => {
            totalTime += (parseFloat(r.totalDurationMin) || 0);
            totalDist += (parseFloat(r.totalDistanceKm) || 0);
        });

        return {
            avgTime: Math.round(totalTime / routes.length),
            avgDistance: (totalDist / routes.length).toFixed(1)
        };
    }, [routes]);

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
