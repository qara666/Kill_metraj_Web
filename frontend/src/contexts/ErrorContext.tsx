import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { logger } from '../utils/ui/logger';

interface AppError {
    id: string;
    message: string;
    type: 'error' | 'warning' | 'info';
    timestamp: number;
    details?: any;
}

interface ErrorContextType {
    errors: AppError[];
    addError: (message: string, type?: 'error' | 'warning' | 'info', details?: any) => void;
    removeError: (id: string) => void;
    clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export const ErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [errors, setErrors] = useState<AppError[]>([]);

    const addError = useCallback((message: string, type: 'error' | 'warning' | 'info' = 'error', details?: any) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newError: AppError = {
            id,
            message,
            type,
            timestamp: Date.now(),
            details
        };

        setErrors(prev => [newError, ...prev].slice(0, 5)); // Keep only last 5 notifications

        // Log through our centralized logger
        if (type === 'error') {
            logger.error(message, details);
        } else if (type === 'warning') {
            logger.warn(message, details);
        } else {
            logger.info(message, details);
        }

        // Auto-remove after 8 seconds
        setTimeout(() => {
            removeError(id);
        }, 8000);
    }, []);

    const removeError = useCallback((id: string) => {
        setErrors(prev => prev.filter(err => err.id !== id));
    }, []);

    const clearErrors = useCallback(() => {
        setErrors([]);
    }, []);

    return (
        <ErrorContext.Provider value={{ errors, addError, removeError, clearErrors }}>
            {children}
            {/* Global Notification UI */}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full">
                {errors.map(error => (
                    <div
                        key={error.id}
                        className={`p-4 rounded-lg shadow-lg border animate-slide-up flex justify-between items-start ${error.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                error.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                                    'bg-blue-50 border-blue-200 text-blue-800'
                            }`}
                    >
                        <div className="flex-1 mr-4">
                            <p className="font-medium text-sm">{error.message}</p>
                            {error.details && typeof error.details === 'string' && (
                                <p className="text-xs mt-1 opacity-80">{error.details}</p>
                            )}
                        </div>
                        <button
                            onClick={() => removeError(error.id)}
                            className="text-current opacity-60 hover:opacity-100 p-1"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </ErrorContext.Provider>
    );
};

export const useError = () => {
    const context = useContext(ErrorContext);
    if (!context) {
        throw new Error('useError must be used within an ErrorProvider');
    }
    return context;
};
