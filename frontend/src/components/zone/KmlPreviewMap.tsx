import React from 'react'
import { clsx } from 'clsx'
import { LeafletKmlPreviewMap } from './LeafletKmlPreviewMap'
import { KMLData } from '../../utils/maps/kmlParser'

interface KmlPreviewMapProps {
    isDark: boolean
    kmlData: KMLData | null
    selectedHubs: string[]
    selectedZones?: string[]
    city?: string
}

export const KmlPreviewMap: React.FC<KmlPreviewMapProps> = ({ isDark, kmlData, selectedHubs, selectedZones = [], city }) => {
    return (
        <div className="relative">
            <LeafletKmlPreviewMap 
                isDark={isDark} 
                kmlData={kmlData} 
                selectedHubs={selectedHubs} 
                selectedZones={selectedZones} 
                city={city}
            />
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
