import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { 
  DocumentArrowUpIcon, 
  UserGroupIcon, 
  MapIcon, 
  TruckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { FileUpload } from '../components/FileUpload'
import { CourierCard } from '../components/CourierCard'
import RouteMap from '../components/RouteMap'
import { StatsCard } from '../components/StatsCard'
import { LoadingSpinner } from '../components/LoadingSpinner'
import * as api from '../services/api'

export const Dashboard: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [processedData, setProcessedData] = useState<any>(null)
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Fetch dashboard data
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.analyticsApi.getDashboardAnalytics(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  // Fetch couriers
  const { data: couriersData, isLoading: couriersLoading } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.courierApi.getCouriers({ limit: 10 }),
  })

  // Fetch routes
  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => api.routeApi.getRoutes({ limit: 10 }),
  })

  // Process Excel file mutation
  const processFileMutation = useMutation({
    mutationFn: api.uploadApi.uploadExcelFile,
    onSuccess: (data) => {
      setProcessedData(data.data)
      toast.success(`Processed ${data.data?.orders.length} orders successfully`)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to process file')
    },
  })

  // Create routes mutation
  const createRoutesMutation = useMutation({
    mutationFn: api.uploadApi.createRoutesFromOrders,
    onSuccess: () => {
      toast.success('Routes created successfully')
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['couriers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setProcessedData(null)
      setSelectedFile(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create routes')
    },
  })

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
  }

  const handleProcessFile = () => {
    if (selectedFile) {
      processFileMutation.mutate(selectedFile)
    }
  }

  const handleCreateRoutes = () => {
    if (processedData) {
      createRoutesMutation.mutate({ orders: processedData.orders })
    }
  }

  const handleDownloadSample = async () => {
    try {
      const blob = await api.uploadApi.getSampleTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sample_orders.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Sample template downloaded')
    } catch (error) {
      toast.error('Failed to download sample template')
    }
  }

  if (dashboardLoading || couriersLoading || routesLoading) {
    return <LoadingSpinner />
  }

  const stats = dashboardData?.data?.overview
  const couriers = couriersData?.data || []
  const routes = routesData?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage courier routes and track delivery performance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownloadSample}
              className="btn-outline"
            >
              <DocumentArrowUpIcon className="h-4 w-4 mr-2" />
              Download Sample
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Routes"
            value={stats.totalRoutes}
            icon={MapIcon}
            color="primary"
            change={`${stats.activeRoutes} active`}
          />
          <StatsCard
            title="Total Couriers"
            value={stats.totalCouriers}
            icon={UserGroupIcon}
            color="success"
            change={`${stats.activeCouriers} active`}
          />
          <StatsCard
            title="Total Orders"
            value={stats.totalOrders}
            icon={TruckIcon}
            color="warning"
            change={`${stats.averageOrdersPerRoute.toFixed(1)} avg/route`}
          />
          <StatsCard
            title="Completion Rate"
            value={`${stats.completionRate.toFixed(1)}%`}
            icon={CheckCircleIcon}
            color="success"
            change={`${stats.completedRoutes} completed`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File Upload Section */}
        <div className="lg:col-span-1">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Upload Excel File
            </h2>
            
            <FileUpload onFileSelect={handleFileSelect} />
            
            {selectedFile && (
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleProcessFile}
                  disabled={processFileMutation.isPending}
                  className="btn-primary w-full"
                >
                  {processFileMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <DocumentArrowUpIcon className="h-4 w-4 mr-2" />
                      Process File
                    </>
                  )}
                </button>
              </div>
            )}

            {processedData && (
              <div className="mt-4 p-4 bg-success-50 rounded-lg border border-success-200">
                <h3 className="font-medium text-success-800 mb-2">
                  File Processed Successfully
                </h3>
                <div className="space-y-1 text-sm text-success-600">
                  <p>{processedData.orders.length} orders processed</p>
                  <p>{processedData.summary.successfulGeocoding} addresses geocoded</p>
                  <p>{processedData.summary.failedGeocoding} failed geocoding</p>
                  <p>{processedData.summary.couriers.length} couriers found</p>
                </div>
                
                <button
                  onClick={handleCreateRoutes}
                  disabled={createRoutesMutation.isPending}
                  className="mt-3 btn-success w-full"
                >
                  {createRoutesMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Creating Routes...
                    </>
                  ) : (
                    <>
                      <MapIcon className="h-4 w-4 mr-2" />
                      Create Routes
                    </>
                  )}
                </button>
              </div>
            )}

            {processedData?.summary.errors.length > 0 && (
              <div className="mt-4 p-4 bg-warning-50 rounded-lg border border-warning-200">
                <h3 className="font-medium text-warning-800 mb-2 flex items-center">
                  <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                  Processing Warnings
                </h3>
                <div className="text-sm text-warning-600">
                  <p>{processedData.summary.errors.length} errors occurred during processing</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="space-y-6">
            {/* Couriers Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Recent Couriers ({couriers.length})
              </h2>
              
              {couriers.length === 0 ? (
                <div className="text-center py-8">
                  <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No couriers</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Upload an Excel file to create couriers and routes.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {couriers.slice(0, 4).map((courier: any) => (
                    <CourierCard
                      key={courier._id}
                      courier={courier}
                      isSelected={selectedCourier === courier._id}
                      onSelect={() => setSelectedCourier(
                        selectedCourier === courier._id ? null : courier._id
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Map Section */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Route Map
              </h2>
              
              <RouteMap 
                routes={routes}
                selectedCourier={selectedCourier || undefined}
                height="400px"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
