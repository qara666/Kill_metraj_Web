import React, { useMemo } from 'react';
import { GoogleRouteMap } from './GoogleRouteMap';
import { OsmMap } from '../maps/OsmMap';
import { localStorageUtils } from '../../utils/ui/localStorage';

interface RouteMapProps {
    route: any;
    onMarkerClick?: (order: any) => void;
}

export const RouteMap: React.FC<RouteMapProps> = React.memo(({ route, onMarkerClick }) => {
    const mapProvider = useMemo(() => {
        const settings = localStorageUtils.getAllSettings();
        return settings.mapProvider || 'google';
    }, []);

    if (mapProvider === 'osm') {
        return <OsmMap route={route} onMarkerClick={onMarkerClick} />;
    }

    return <GoogleRouteMap route={route} onMarkerClick={onMarkerClick} />;
});
