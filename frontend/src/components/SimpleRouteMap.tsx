import React from 'react';
import type { Route } from '../types';

interface SimpleRouteMapProps {
  routes: Route[];
  selectedCourier?: string;
  onRouteSelect?: (route: Route) => void;
  className?: string;
}

const SimpleRouteMap: React.FC<SimpleRouteMapProps> = ({
  routes,
  selectedCourier,
  onRouteSelect,
  className = ''
}) => {
  const filteredRoutes = selectedCourier 
    ? routes.filter(route => {
        if (typeof route.courier === 'string') {
          return route.courier === selectedCourier;
        }
        return route.courier?.name === selectedCourier;
      })
    : routes;

  const handleRouteClick = (route: Route) => {
    if (onRouteSelect) {
      onRouteSelect(route);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Маршруты {selectedCourier ? `(${selectedCourier})` : ''}
        </h3>
        <p className="text-sm text-gray-600">
          Показано маршрутов: {filteredRoutes.length}
        </p>
      </div>

      <div className="space-y-4">
        {filteredRoutes.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <p className="text-gray-500">Немає маршрутів для відображення</p>
          </div>
        ) : (
          filteredRoutes.map((route) => (
            <div
              key={route._id}
              onClick={() => handleRouteClick(route)}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                route.isActive 
                  ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                  : route.isCompleted
                  ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    route.isActive 
                      ? 'bg-green-500' 
                      : route.isCompleted
                      ? 'bg-blue-500'
                      : 'bg-gray-400'
                  }`} />
                  <span className="font-medium text-gray-900">
                    Маршрут #{route._id.slice(-6)}
                  </span>
                </div>
                <div className="flex space-x-2">
                  {route.isActive && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Активний
                    </span>
                  )}
                  {route.isCompleted && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      Завершено
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="truncate">{route.startPoint.formattedAddress}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600 ml-4">
                    <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                    <span className="truncate">{route.endPoint.formattedAddress}</span>
                  </div>
                </div>

                {route.waypoints.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Проміжні точки: {route.waypoints.length}
                  </div>
                )}

                <div className="flex justify-between items-center text-sm">
                  <div className="flex space-x-4">
                    <span className="text-gray-600">
                      📍 {route.totalDistance}
                    </span>
                    <span className="text-gray-600">
                      ⏱️ {route.totalDuration}
                    </span>
                  </div>
                  {route.courier && (
                    <span className="text-xs text-gray-500">
                      Кур'єр: {typeof route.courier === 'string' ? route.courier : route.courier.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {filteredRoutes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-medium text-gray-900">
                {filteredRoutes.filter(r => r.isActive).length}
              </div>
              <div className="text-gray-500">Активні</div>
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {filteredRoutes.filter(r => r.isCompleted).length}
              </div>
              <div className="text-gray-500">Завершені</div>
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {filteredRoutes.reduce((sum, r) => sum + r.waypoints.length, 0)}
              </div>
              <div className="text-gray-500">Всього точок</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleRouteMap;


























