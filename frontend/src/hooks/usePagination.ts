import { useState, useMemo } from 'react'

interface UsePaginationProps {
    totalItems: number
    initialItemsPerPage?: number
    initialPage?: number
}

interface UsePaginationReturn {
    currentPage: number
    itemsPerPage: number
    totalPages: number
    startIndex: number
    endIndex: number
    setCurrentPage: (page: number) => void
    setItemsPerPage: (items: number) => void
    nextPage: () => void
    previousPage: () => void
    goToPage: (page: number) => void
    resetPagination: () => void
}

export const usePagination = ({
    totalItems,
    initialItemsPerPage = 20,
    initialPage = 1
}: UsePaginationProps): UsePaginationReturn => {
    const [currentPage, setCurrentPage] = useState(initialPage)
    const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage)

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(totalItems / itemsPerPage))
    }, [totalItems, itemsPerPage])

    const startIndex = useMemo(() => {
        return (currentPage - 1) * itemsPerPage
    }, [currentPage, itemsPerPage])

    const endIndex = useMemo(() => {
        return Math.min(startIndex + itemsPerPage, totalItems)
    }, [startIndex, itemsPerPage, totalItems])

    const goToPage = (page: number) => {
        const validPage = Math.max(1, Math.min(page, totalPages))
        setCurrentPage(validPage)
    }

    const nextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1)
        }
    }

    const previousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1)
        }
    }

    const handleSetItemsPerPage = (items: number) => {
        setItemsPerPage(items)
        // Reset to first page when changing items per page
        setCurrentPage(1)
    }

    const resetPagination = () => {
        setCurrentPage(1)
        setItemsPerPage(initialItemsPerPage)
    }

    return {
        currentPage,
        itemsPerPage,
        totalPages,
        startIndex,
        endIndex,
        setCurrentPage: goToPage,
        setItemsPerPage: handleSetItemsPerPage,
        nextPage,
        previousPage,
        goToPage,
        resetPagination
    }
}
