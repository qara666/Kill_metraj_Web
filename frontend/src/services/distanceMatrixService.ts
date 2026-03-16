/**
 * DistanceMatrixService — v1.0
 * 
 * Optimized matrix calculations for N-to-M routing.
 * Primarily used as a fallback/accelerator for route optimization.
 */

import { ValhallaService } from './valhallaService'
import { localStorageUtils } from '../utils/ui/localStorage'

export interface MatrixResult {
  distance: number // meters
  duration: number // seconds
}

export type MatrixProvider = 'valhalla' | 'osrm'

export class DistanceMatrixService {
  /**
   * Calculate a distance/duration matrix for a set of points.
   */
  static async getMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[]
  ): Promise<MatrixResult[][] | null> {
    const settings = localStorageUtils.getAllSettings()
    
    // Check if enabled in settings
    if (!settings.distanceMatrixEnabled) {
        return null
    }

    const provider = (settings.distanceMatrixProvider as MatrixProvider) || 'valhalla'

    try {
      if (provider === 'valhalla') {
        const result = await ValhallaService.getMatrix(sources, targets)
        if (result) return result
      }

      if (provider === 'osrm' || (provider as any) === 'google') {
        // Fallback or explicit OSRM (Google is redirected to OSRM now)
        return await this.getOsrmMatrix(sources, targets)
      }
      
      return null
    } catch (err) {
      console.warn(`[DistanceMatrix] provider failed:`, err)
      return null
    }
  }

  private static async getOsrmMatrix(
    sources: { lat: number; lng: number }[],
    targets: { lat: number; lng: number }[]
  ): Promise<MatrixResult[][] | null> {
    const allPoints = [...sources, ...targets]
    const sourceIndices = sources.map((_, i) => i).join(';')
    const targetIndices = targets.map((_, i) => sources.length + i).join(';')
    const coordsStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

    const url = `https://router.project-osrm.org/table/v1/driving/${coordsStr}?sources=${sourceIndices}&destinations=${targetIndices}&annotations=duration,distance`

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) return null
      
      const data = await response.json()
      if (data.code !== 'Ok' || !data.distances) return null

      return data.distances.map((row: number[], i: number) => 
        row.map((dist: number, j: number) => ({
          distance: dist,
          duration: data.durations ? data.durations[i][j] : 0
        }))
      )
    } catch {
      return null
    }
  }
}
