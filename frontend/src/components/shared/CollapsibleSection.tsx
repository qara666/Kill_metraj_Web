import React, { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

interface CollapsibleSectionProps {
    isDark: boolean
    icon: React.ReactNode
    title: string
    children: React.ReactNode
    defaultOpen?: boolean
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ isDark, icon, title, children, defaultOpen = false }) => {
    const [isExpanded, setIsExpanded] = useState(defaultOpen)
    return (
        <div className={clsx(
            'rounded-xl border shadow-lg transition-all duration-200 overflow-hidden',
            isDark
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200',
            isExpanded && 'shadow-xl'
        )}>
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                    'w-full flex items-center justify-between p-5 transition-all duration-200 group',
                    isDark
                        ? 'hover:bg-gray-700/50 hover:border-gray-600'
                        : 'hover:bg-gray-50/80 hover:border-gray-300'
                )}
            >
                <div className="flex items-center space-x-3">
                    <div className={clsx(
                        'p-2 rounded-lg transition-all duration-200',
                        isDark
                            ? 'bg-blue-600/20 text-blue-400 group-hover:bg-blue-600/30 group-hover:scale-110'
                            : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200 group-hover:scale-110'
                    )}>
                        {icon}
                    </div>
                    <span className={clsx(
                        'font-semibold text-lg transition-colors',
                        isDark ? 'text-gray-200 group-hover:text-white' : 'text-gray-900 group-hover:text-gray-800'
                    )}>
                        {title}
                    </span>
                </div>
                <div className={clsx(
                    'transition-all duration-200',
                    isExpanded && 'rotate-180',
                    isDark
                        ? 'text-gray-400 group-hover:text-white'
                        : 'text-gray-600 group-hover:text-gray-800'
                )}>
                    {isExpanded ? (
                        <ChevronUpIcon className="h-6 w-6" />
                    ) : (
                        <ChevronDownIcon className="h-6 w-6" />
                    )}
                </div>
            </button>
            {isExpanded && (
                <div className={clsx(
                    'border-t p-6',
                    isDark
                        ? 'border-gray-700 bg-gray-800'
                        : 'border-gray-200 bg-white'
                )}>
                    {children}
                </div>
            )}
        </div>
    )
}
