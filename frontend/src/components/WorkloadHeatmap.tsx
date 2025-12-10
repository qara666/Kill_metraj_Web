/**
 * Компонент тепловой карты загруженности районов
 */

import React, { useEffect, useRef } from 'react'
import { googleMapsLoader } from '../utils/googleMapsLoader'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import type { WorkloadHeatmapData } from '../utils/coverageAnalysis'

export interface WorkloadHeatmapProps {
  orders: Array<{ coords?: { lat: number; lng: number } }>
  sectorPath?: Array<{ lat: number; lng: number }>
  onHeatmapDataLoad?: (data: WorkloadHeatmapData[]) => void
}

export const WorkloadHeatmap: React.FC<WorkloadHeatmapProps> = ({
  orders,
  sectorPath,
  onHeatmapDataLoad
}) => {
  const { isDark } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const heatmapLayerRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!mapRef.current) return

    const initMap = async () => {
      try {
        await googleMapsLoader.load()
        const gmaps = (window as any).google?.maps
        if (!gmaps) return

        // Создаем карту
        const map = new gmaps.Map(mapRef.current!, {
          zoom: 12,
          center: sectorPath && sectorPath.length > 0
            ? {
                lat: sectorPath.reduce((sum, p) => sum + p.lat, 0) / sectorPath.length,
                lng: sectorPath.reduce((sum, p) => sum + p.lng, 0) / sectorPath.length
              }
            : { lat: 50.4501, lng: 30.5234 },
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true
        })

        mapInstanceRef.current = map

        // Импортируем функцию создания тепловой карты
        const { createWorkloadHeatmap } = await import('../utils/coverageAnalysis')
        const heatmapData = createWorkloadHeatmap(
          orders as any[],
          25 // размер сетки
        )

        if (onHeatmapDataLoad) {
          onHeatmapDataLoad(heatmapData)
        }

        // Создаем данные для тепловой карты Google Maps
        if (gmaps.visualization && gmaps.visualization.HeatmapLayer) {
          const heatmapPoints = heatmapData.map(point => ({
            location: new gmaps.LatLng(point.location.lat, point.location.lng),
            weight: point.orderCount
          }))

          const heatmap = new gmaps.visualization.HeatmapLayer({
            data: heatmapPoints,
            map: map,
            radius: 50,
            opacity: 0.6,
            gradient: [
                'rgba(0, 255, 0, 0)',      // Зеленый (низкая загрузка)
                'rgba(255, 255, 0, 0.4)',  // Желтый (средняя загрузка)
                'rgba(255, 165, 0, 0.7)',  // Оранжевый (высокая загрузка)
                'rgba(255, 0, 0, 1)'       // Красный (критическая загрузка)
            ],
            maxIntensity: Math.max(...heatmapData.map(d => d.orderCount), 1)
          })

          heatmapLayerRef.current = heatmap

          console.log(`✅ Тепловая карта загруженности создана с ${heatmapData.length} точками`)
        }

        // Добавляем маркеры для критических зон
        const criticalZones = heatmapData.filter(d => d.workload === 'critical' || d.workload === 'high')
        
        markersRef.current.forEach(m => m.setMap(null))
        markersRef.current = []

        criticalZones.forEach(zone => {
          const marker = new gmaps.Marker({
            position: new gmaps.LatLng(zone.location.lat, zone.location.lng),
            map: map,
            icon: {
              path: gmaps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: zone.workload === 'critical' ? '#FF0000' : '#FF8800',
              fillOpacity: 0.8,
              strokeWeight: 2,
              strokeColor: '#FFFFFF'
            },
            title: `${zone.orderCount} заказ${zone.orderCount > 1 ? 'ов' : ''} (${zone.workload})`,
            zIndex: 1000
          })

          markersRef.current.push(marker)
        })

        // Рисуем границы сектора, если есть
        if (sectorPath && sectorPath.length > 0) {
          new gmaps.Polygon({
            paths: sectorPath.map(p => new gmaps.LatLng(p.lat, p.lng)),
            strokeColor: '#0000FF',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#0000FF',
            fillOpacity: 0.1,
            map: map
          })
        }

        console.log(`✅ Добавлено ${criticalZones.length} маркеров критических зон загруженности`)
      } catch (error) {
        console.error('Ошибка инициализации тепловой карты загруженности:', error)
      }
    }

    initMap()

    return () => {
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
      if (heatmapLayerRef.current) {
        heatmapLayerRef.current.setMap(null)
      }
      mapInstanceRef.current = null
    }
  }, [orders, sectorPath, onHeatmapDataLoad, isDark])

  return (
    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
      <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
        Тепловая карта загруженности районов:
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border overflow-hidden"
        style={{ minHeight: '256px' }}
      />
    </div>
  )
}

