import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../../utils/ui/logger';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error('Uncaught UI Error:', { error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
                    <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 border border-red-100 dark:border-red-900/30">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6 mx-auto">
                            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>

                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
                            Упс! Что-то пошло не так
                        </h1>

                        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
                            Произошла непредвиденная ошибка при загрузке интерфейса. Мы уже зафиксировали её.
                        </p>

                        <div className="bg-gray-50 dark:bg-gray-900 rounded p-4 mb-6 overflow-auto max-h-32">
                            <code className="text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap">
                                {this.state.error?.toString()}
                            </code>
                            {this.state.error?.toString().toLowerCase().includes('importing a module script failed') && (
                                <p className="text-[10px] mt-2 text-gray-500 font-medium">
                                    💡 Подсказка: Скорее всего, приложение было обновлено. Нажмите "Обновить страницу".
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Обновить страницу
                            </button>
                            <button
                                onClick={() => this.setState({ hasError: false, error: null })}
                                className="w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
                            >
                                Попробовать снова
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
