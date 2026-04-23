import { API_URL } from '../config/apiConfig';

const getAuthHeaders = () => {
  const token = localStorage.getItem('km_access_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

async function fetchEfficiency<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/api${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  }
  
  const response = await fetch(url.toString(), {
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const json = await response.json();
  return json.data;
}

export interface CourierEfficiencyData {
  name: string;
  totalOrders: number;
  hoursWorked: number;
  efficiency: number;
  avgOrdersPerHour: number;
  hourlyBreakdown: Array<{ hour: string; orders: number }>;
}

export interface HourlyEfficiencyResponse {
  date: string;
  couriers: CourierEfficiencyData[];
  totalOrders: number;
  avgEfficiency: string;
}

export interface OrderDynamicsDay {
  date: string;
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  hourlyOrders: Array<{ hour: string; orders: number }>;
}

export interface OrderDynamicsResponse {
  period: { startDate: string; endDate: string };
  days: OrderDynamicsDay[];
  hourlyAverages: Array<{ hour: string; avgOrders: number }>;
  trend: string;
  summary: {
    totalDays: number;
    totalOrders: number;
    avgOrdersPerDay: string;
    peakHour: string;
    lowestHour: string;
  };
}

export interface LowPerformer {
  name: string;
  efficiency: number;
  totalOrders: number;
  hoursWorked: number;
  recommendation: string;
}

export interface OptimalSendingHome {
  name: string;
  currentHour: number;
  suggestedReleaseHour: number;
  reason: string;
  savedHours: number;
}

export interface MonitoringForecast {
  predictedOrdersRemaining: string;
  currentTrend: string;
  shouldSendHome: boolean;
  action: string;
}

export interface SmartMonitoringResponse {
  timestamp: string;
  date: string;
  currentHour: number;
  currentHourOrders: number;
  averageEfficiency: string;
  couriersCount: number;
  lowPerformers: LowPerformer[];
  recommendations: Array<{
    type: string;
    courier: string;
    message: string;
    action: string;
    priority: string;
  }>;
  optimalSendingHome: OptimalSendingHome[];
  forecast: MonitoringForecast;
  thresholds: {
    minEfficiency: number;
    earlyRelease: number;
  };
}

export const efficiencyApi = {
  async getHourlyEfficiency(date: string): Promise<HourlyEfficiencyResponse> {
    return fetchEfficiency<HourlyEfficiencyResponse>('/efficiency/hourly', { date });
  },

  async getCourierEfficiency(date: string, courierId: string): Promise<CourierEfficiencyData[]> {
    return fetchEfficiency<CourierEfficiencyData[]>(`/efficiency/courier/${courierId}`, { date });
  },

  async getOrderDynamics(startDate: string, endDate: string): Promise<OrderDynamicsResponse> {
    return fetchEfficiency<OrderDynamicsResponse>('/efficiency/dynamics', { startDate, endDate });
  },

  async getSmartMonitoring(
    date: string,
    options?: { minEfficiency?: number; earlyRelease?: number }
  ): Promise<SmartMonitoringResponse> {
    const params: Record<string, string> = { date };
    if (options?.minEfficiency !== undefined) {
      params.minEfficiency = String(options.minEfficiency);
    }
    if (options?.earlyRelease !== undefined) {
      params.earlyRelease = String(options.earlyRelease);
    }
    return fetchEfficiency<SmartMonitoringResponse>('/efficiency/monitoring', params);
  },

  async getToday(): Promise<SmartMonitoringResponse> {
    return fetchEfficiency<SmartMonitoringResponse>('/efficiency/today');
  }
};