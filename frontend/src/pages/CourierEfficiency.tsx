import React, { useState, useEffect, useCallback } from 'react';
import { efficiencyApi, SmartMonitoringResponse, HourlyEfficiencyResponse, OrderDynamicsResponse } from '../services/efficiencyApi';

const CourierEfficiency: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [monitoringData, setMonitoringData] = useState<SmartMonitoringResponse | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyEfficiencyResponse | null>(null);
  const [dynamicsData, setDynamicsData] = useState<OrderDynamicsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [minEfficiency, setMinEfficiency] = useState(1.5);
  const [earlyReleaseThreshold, setEarlyReleaseThreshold] = useState(0.8);
  const [activeTab, setActiveTab] = useState<'monitoring' | 'hourly' | 'dynamics'>('monitoring');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [monitoring, hourly, dynamics] = await Promise.all([
        efficiencyApi.getSmartMonitoring(selectedDate, { minEfficiency, earlyRelease: earlyReleaseThreshold }),
        efficiencyApi.getHourlyEfficiency(selectedDate),
        efficiencyApi.getOrderDynamics(selectedDate, selectedDate)
      ]);
      setMonitoringData(monitoring);
      setHourlyData(hourly);
      setDynamicsData(dynamics);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, minEfficiency, earlyReleaseThreshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSendHome = (courierName: string) => {
    alert(`Курьер ${courierName} отправлен домой (симуляция)`);
  };

  const handleRefresh = () => {
    fetchData();
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= minEfficiency) return 'text-green-600';
    if (efficiency >= earlyReleaseThreshold) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getEfficiencyBg = (efficiency: number) => {
    if (efficiency >= minEfficiency) return 'bg-green-100';
    if (efficiency >= earlyReleaseThreshold) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Эффективность курьеров</h1>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <label className="block text-sm font-medium mb-1">Дата</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <label className="block text-sm font-medium mb-1">Мин. эффективность</label>
          <input
            type="number"
            step="0.1"
            value={minEfficiency}
            onChange={(e) => setMinEfficiency(parseFloat(e.target.value) || 1.5)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <label className="block text-sm font-medium mb-1">Порог отправки домой</label>
          <input
            type="number"
            step="0.1"
            value={earlyReleaseThreshold}
            onChange={(e) => setEarlyReleaseThreshold(parseFloat(e.target.value) || 0.8)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow flex items-center justify-center">
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Сегодня
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('monitoring')}
          className={`px-4 py-2 rounded ${
            activeTab === 'monitoring' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Мониторинг
        </button>
        <button
          onClick={() => setActiveTab('hourly')}
          className={`px-4 py-2 rounded ${
            activeTab === 'hourly' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Почасовая
        </button>
        <button
          onClick={() => setActiveTab('dynamics')}
          className={`px-4 py-2 rounded ${
            activeTab === 'dynamics' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          Динамика
        </button>
      </div>

      {activeTab === 'monitoring' && monitoringData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Средняя эффективность</div>
              <div className="text-2xl font-bold">{monitoringData.averageEfficiency}</div>
              <div className="text-xs text-gray-500">заказов/час</div>
            </div>
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Курьеров</div>
              <div className="text-2xl font-bold">{monitoringData.couriersCount}</div>
              <div className="text-xs text-gray-500">на смене</div>
            </div>
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Заказов за час</div>
              <div className="text-2xl font-bold">{monitoringData.currentHourOrders}</div>
              <div className="text-xs text-gray-500">текущий час</div>
            </div>
            <div className={`p-4 rounded shadow ${
              monitoringData.forecast.shouldSendHome ? 'bg-red-50' : 'bg-green-50'
            }`}>
              <div className="text-sm text-gray-600">Рекомендация</div>
              <div className="text-lg font-bold">
                {monitoringData.forecast.shouldSendHome ? 'Можно отпустить' : 'Все заняты'}
              </div>
              <div className="text-xs text-gray-500">
                {monitoringData.forecast.action}
              </div>
            </div>
          </div>

          {monitoringData.optimalSendingHome.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded p-4">
              <h3 className="font-bold text-red-700 mb-3">
                Требуют внимания: {monitoringData.optimalSendingHome.length}
              </h3>
              <div className="space-y-2">
                {monitoringData.optimalSendingHome.map((courier, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-white p-3 rounded"
                  >
                    <div>
                      <div className="font-medium">{courier.name}</div>
                      <div className="text-sm text-gray-500">{courier.reason}</div>
                    </div>
                    <button
                      onClick={() => handleSendHome(courier.name)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Отправить домой
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {monitoringData.lowPerformers.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded p-4">
              <h3 className="font-bold text-yellow-700 mb-3">
                Низкая эффективность: {monitoringData.lowPerformers.length}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Курьер</th>
                      <th className="p-2">Заказов</th>
                      <th className="p-2">Часов</th>
                      <th className="p-2">Эффективность</th>
                      <th className="p-2">Рекомендация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoringData.lowPerformers.map((courier, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2 font-medium">{courier.name}</td>
                        <td className="p-2">{courier.totalOrders}</td>
                        <td className="p-2">{courier.hoursWorked}</td>
                        <td className={`p-2 font-bold ${getEfficiencyColor(courier.efficiency)}`}>
                          {courier.efficiency}
                        </td>
                        <td className="p-2">{courier.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {monitoringData.recommendations.length > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded p-4">
              <h3 className="font-bold text-orange-700 mb-3">Рекомендации</h3>
              <div className="space-y-2">
                {monitoringData.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded ${
                      rec.priority === 'HIGH' ? 'bg-red-100' : 'bg-yellow-100'
                    }`}
                  >
                    <div className="font-medium">{rec.courier}</div>
                    <div className="text-sm">{rec.message}</div>
                    <div className="text-sm font-medium mt-1">{rec.action}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'hourly' && hourlyData && (
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded shadow">
            <div className="text-lg font-bold">Итого за день: {hourlyData.totalOrders} заказов</div>
            <div className="text-sm text-gray-600">
              Средняя эффективность: {hourlyData.avgEfficiency} заказов/час
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {hourlyData.couriers.map((courier, idx) => (
              <div key={idx} className="bg-white rounded shadow p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-lg">{courier.name}</div>
                    <div className="text-sm text-gray-500">
                      {courier.totalOrders} заказов / {courier.hoursWorked} часов
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded font-bold ${
                    getEfficiencyBg(courier.efficiency)
                  } ${getEfficiencyColor(courier.efficiency)}`}>
                    {courier.efficiency}
                  </div>
                </div>

                <div className="flex gap-1 overflow-x-auto pb-2">
                  {courier.hourlyBreakdown.map((hour, hIdx) => (
                    <div
                      key={hIdx}
                      className="flex-shrink-0 text-center"
                      title={`${hour.hour}:00 - ${hour.orders} заказов`}
                    >
                      <div className="text-xs text-gray-500 mb-1">{hour.hour}</div>
                      <div
                        className={`w-8 h-8 flex items-center justify-center text-xs rounded ${
                          hour.orders > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200'
                        }`}
                      >
                        {hour.orders}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'dynamics' && dynamicsData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Всего заказов</div>
              <div className="text-2xl font-bold">{dynamicsData.summary.totalOrders}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">В среднем в день</div>
              <div className="text-2xl font-bold">{dynamicsData.summary.avgOrdersPerDay}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Час пик</div>
              <div className="text-2xl font-bold">{dynamicsData.summary.peakHour}:00</div>
            </div>
            <div className="bg-blue-50 p-4 rounded shadow">
              <div className="text-sm text-gray-600">Тренд</div>
              <div className="text-2xl font-bold">{dynamicsData.trend}</div>
            </div>
          </div>

          <div className="bg-white rounded shadow p-4">
            <h3 className="font-bold mb-3">Почавое распределение (среднее)</h3>
            <div className="flex gap-1 overflow-x-auto">
              {dynamicsData.hourlyAverages.map((hour, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 text-center"
                  title={`${hour.hour}:00 - ${hour.avgOrders.toFixed(1)} заказов`}
                >
                  <div className="text-xs text-gray-500 mb-1">{hour.hour}</div>
                  <div
                    className="w-10 h-16 flex items-end justify-center rounded"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${Math.min(hour.avgOrders / 10, 1)})`
                    }}
                  >
                    <span className="text-xs pb-1">
                      {hour.avgOrders > 0 ? hour.avgOrders.toFixed(1) : '-'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {dynamicsData.days.map((day, idx) => (
            <div key={idx} className="bg-white rounded shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="font-bold">{day.date}</div>
                <div className="text-sm text-gray-500">
                  {day.totalOrders} заказов / {day.completedOrders} исполнено / {day.failedOrders} отменено
                </div>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {day.hourlyOrders.map((hour, hIdx) => (
                  <div
                    key={hIdx}
                    className="flex-shrink-0 text-center"
                    title={`${hour.hour}:00 - ${hour.orders} заказов`}
                  >
                    <div className="text-xs text-gray-500 mb-1">{hour.hour}</div>
                    <div
                      className={`w-8 h-8 flex items-center justify-center text-xs rounded ${
                        hour.orders > 0 ? 'bg-green-500 text-white' : 'bg-gray-200'
                      }`}
                    >
                      {hour.orders}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !monitoringData && !hourlyData && (
        <div className="text-center py-12 text-gray-500">
          Нет данных за выбранную дату. Попробуйте выбрать ��ругую дату.
        </div>
      )}
    </div>
  );
};

export default CourierEfficiency;