import { useEffect, useState, useMemo } from 'react'

interface DeviceCapabilities {
    isMobile: boolean
    isTablet: boolean
    isDesktop: boolean
    cpuCores: number
    isLowEnd: boolean
    preferReducedMotion: boolean
    connectionSpeed: 'slow' | 'medium' | 'fast'
    screenWidth: number
    screenHeight: number
}

export const useDeviceCapabilities = (): DeviceCapabilities => {
    const [screenWidth, setScreenWidth] = useState(
        typeof window !== 'undefined' ? window.innerWidth : 1920
    )
    const [screenHeight, setScreenHeight] = useState(
        typeof window !== 'undefined' ? window.innerHeight : 1080
    )

    useEffect(() => {
        const handleResize = () => {
            setScreenWidth(window.innerWidth)
            setScreenHeight(window.innerHeight)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const capabilities = useMemo((): DeviceCapabilities => {
        // Device type detection
        const isMobile = screenWidth < 768
        const isTablet = screenWidth >= 768 && screenWidth < 1024
        const isDesktop = screenWidth >= 1024

        // CPU cores detection
        const cpuCores = navigator.hardwareConcurrency || 4

        // Low-end device detection (fewer cores + mobile)
        const isLowEnd = cpuCores <= 2 || (isMobile && cpuCores <= 4)

        // Reduced motion preference
        const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Connection speed estimation
        const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
        let connectionSpeed: 'slow' | 'medium' | 'fast' = 'medium'

        if (connection) {
            const effectiveType = connection.effectiveType
            if (effectiveType === 'slow-2g' || effectiveType === '2g') {
                connectionSpeed = 'slow'
            } else if (effectiveType === '3g') {
                connectionSpeed = 'medium'
            } else {
                connectionSpeed = 'fast'
            }
        }

        return {
            isMobile,
            isTablet,
            isDesktop,
            cpuCores,
            isLowEnd,
            preferReducedMotion,
            connectionSpeed,
            screenWidth,
            screenHeight
        }
    }, [screenWidth, screenHeight])

    return capabilities
}

/**
 * Get recommended items per page based on device capabilities
 */
export const useAdaptiveItemsPerPage = (defaultItems: number = 20): number => {
    const { isLowEnd, isMobile } = useDeviceCapabilities()

    return useMemo(() => {
        if (isLowEnd) {
            return Math.min(10, defaultItems)
        }
        if (isMobile) {
            return Math.min(15, defaultItems)
        }
        return defaultItems
    }, [isLowEnd, isMobile, defaultItems])
}
