import React from 'react';
import { LeafletRouteMap } from './LeafletRouteMap';

interface RouteMapProps {
    route: any;
    onMarkerClick?: (order: any) => void;
}

export const RouteMap: React.FC<RouteMapProps> = React.memo(({ route, onMarkerClick }) => {
    return <LeafletRouteMap route={route} onMarkerClick={onMarkerClick} />;
});
