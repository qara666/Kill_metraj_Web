import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className,
    variant = 'rectangular'
}) => {
    return (
        <div
            className={clsx(
                "animate-pulse bg-gray-200 dark:bg-gray-700",
                {
                    'rounded': variant === 'text' || variant === 'rectangular',
                    'rounded-full': variant === 'circular',
                    'rounded-xl': variant === 'rounded',
                },
                className
            )}
        />
    );
};

export const RouteCardSkeleton = () => (
    <div className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
        <div className="flex justify-between items-start mb-4">
            <Skeleton className="h-6 w-32" variant="text" />
            <Skeleton className="h-6 w-16" variant="rounded" />
        </div>
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" variant="circular" />
                <Skeleton className="h-4 w-48" variant="text" />
            </div>
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" variant="circular" />
                <Skeleton className="h-4 w-40" variant="text" />
            </div>
        </div>
        <div className="mt-5 flex gap-2">
            <Skeleton className="h-9 flex-1" variant="rounded" />
            <Skeleton className="h-9 w-24" variant="rounded" />
        </div>
    </div>
);

export const MapSkeleton = () => (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden relative">
        <Skeleton className="w-full h-full" variant="rectangular" />
        <div className="absolute top-4 left-4 space-y-2">
            <Skeleton className="h-10 w-32" variant="rounded" />
            <Skeleton className="h-10 w-10" variant="rounded" />
        </div>
    </div>
);
