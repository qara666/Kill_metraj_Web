import React, { useMemo } from 'react'
import { clsx } from 'clsx'
import { GoogleKmlPreviewMap } from './GoogleKmlPreviewMap'
import { OsmKmlPreviewMap } from './OsmKmlPreviewMap'
import { localStorageUtils } from '../../utils/ui/localStorage'
import { KMLData } from '../../utils/maps/kmlParser'

interface KmlPreviewMapProps {
    isDark: boolean
    kmlData: KMLData | null
    selectedHubs: string[]
    selectedZones?: string[]
}

export const KmlPreviewMap: React.FC<KmlPreviewMapProps> = ({ isDark, kmlData, selectedHubs, selectedZones = [] }) => {
    const mapProvider = useMemo(() => {
        const settings = localStorageUtils.getAllSettings()
        return settings.mapProvider || 'google'
    }, [])

    return (
        <div className="relative">
            {mapProvider === 'osm' ? (
                <OsmKmlPreviewMap 
                    isDark={isDark} 
                    kmlData={kmlData} 
                    selectedHubs={selectedHubs} 
                    selectedZones={selectedZones} 
                />
            ) : (
                <GoogleKmlPreviewMap 
                    isDark={isDark} 
                    kmlData={kmlData} 
                    selectedHubs={selectedHubs} 
                    selectedZones={selectedZones} 
                />
            )}
            {!kmlData && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[2px] rounded-2xl z-[1000]">
                    <p className={clsx("text-sm font-bold", isDark ? "text-gray-500" : "text-gray-400")}>
                        НЕТ ДАННЫХ ДЛЯ ОТОБРАЖЕНИЯ
                    </p>
                </div>
            )}
        </div>
    )
}
