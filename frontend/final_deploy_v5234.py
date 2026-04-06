import os, sys

path = 'src/components/route/RouteManagement.tsx'
with open(path, 'r') as f:
    text = f.read()

# Marker-based precise surgery v5.234
marker_start = '  return ('
unique_prev = '  const formatDistance = (distanceKm: number) => {'
p_idx = text.find(unique_prev)
if p_idx == -1:
    print('ERROR: Prev anchor not found')
    sys.exit(1)

start_idx = text.find(marker_start, p_idx)
marker_end = '// --- Helper Components for Virtualization ---'
end_idx = text.find(marker_end)

if start_idx == -1 or end_idx == -1:
    print(f'ERROR: markers not found. start:{start_idx} end:{end_idx}')
    sys.exit(1)

# Construct the ELITE UI block
# Note the closing }; at the very end of the replacement block
elite_ui = r'''  return (
    <div className="flex flex-col gap-10 w-full max-w-full overflow-x-hidden min-h-screen px-4 lg:px-8 bg-transparent">
      {/* 🚀 ELITE DASHBOARD HEADER v5.234 🚀 */}
      <header className={clsx(
        "rounded-[3.5rem] p-12 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] border transition-all duration-1000 relative overflow-hidden backdrop-blur-[100px]",
        isDark ? "bg-[#151B2C]/90 border-white/5" : "bg-white/80 border-black/5"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-fuchsia-600/10 to-pink-600/10 opacity-60 mix-blend-overlay pointer-events-none" />
        
        <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-12">
          <div className="flex items-center gap-10">
            <div className={clsx(
              "w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-[0_30px_60px_rgba(37,_99,_235,_0.4)] transition-all hover:rotate-12 hover:scale-110 active:scale-95 text-white bg-gradient-to-br",
              isDark ? "from-blue-600 to-indigo-900" : "from-blue-500 to-indigo-700"
            )}>
              <MapIcon className="w-14 h-14" />
            </div>
            <div>
              <h1 className={clsx(
                "text-5xl font-black tracking-tighter uppercase leading-none mb-4",
                isDark ? "text-white" : "text-gray-900"
              )}>
                Маршрутизація
              </h1>
              <div className="flex items-center gap-6">
                <span className={clsx("text-sm font-black uppercase tracking-[0.5em] opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                  {fleetStats.total} кур'єрів
                </span>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className={clsx("text-sm font-black uppercase tracking-[0.5em] opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                  {(excelData?.routes?.length ?? 0)} ACTIVE ROUTES
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => (window as any).__refreshTurboRoutes?.()}
                className={clsx(
                  "h-20 px-12 rounded-[2rem] flex items-center gap-4 transition-all active:scale-95 text-xs font-black uppercase tracking-[0.5em] border-2 shadow-[0_15px_40px_rgba(0,0,0,0.3)]",
                  isDark 
                    ? "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10 hover:border-blue-500/50" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200 hover:border-blue-400"
                )}
              >
                <ArrowPathIcon className="w-6 h-6" />
                <span>Оновити</span>
              </button>
              <button
                onClick={() => setShowHelpModal(true)}
                className={clsx(
                  "w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all border-2 active:scale-95 shadow-[0_15px_40px_rgba(0,0,0,0.3)] group/help relative",
                  isDark ? "bg-white/5 border-white/5 text-gray-400 hover:text-blue-400 hover:border-blue-500/50" : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
                )}
              >
                <div className="absolute inset-0 bg-blue-500/0 group-hover/help:bg-blue-500/10 transition-all rounded-[2rem]" />
                <QuestionMarkCircleIcon className="w-9 h-9 transition-transform group-hover/help:rotate-12 relative z-10" />
              </button>
            </div>
            
            <div className="h-20 px-10 rounded-[2rem] flex items-center gap-8 bg-black/60 border-2 border-white/10 backdrop-blur-3xl shadow-2xl ring-2 ring-white/5">
                <ServiceStatusDashboard />
            </div>
          </div>
        </div>
      </header>

      {/* 🚀 DASHBOARD GRID v5.234 🚀 */}
      <>
        <div className="flex flex-col xl:flex-row gap-12 items-start min-h-[700px] mb-40">
          {/* ELITE SIDEBAR INTERFACE */}
          <div className="w-full lg:w-[480px] lg:sticky lg:top-12" data-tour="courier-select">
            <div className={clsx(
              "rounded-[4rem] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-2 transition-all duration-700 relative overflow-hidden",
              isDark ? "bg-[#151B2C]/95 border-white/10 backdrop-blur-[100px]" : "bg-white/90 border-black/5"
            )}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full -mr-32 -mt-32 blur-[120px] opacity-100 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col h-full">
                {/* Stats Header Pods */}
                <div className="p-10 border-b-2 border-white/5 bg-black/30">
                  <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className={clsx(
                      "p-8 rounded-[2.5rem] border-2 flex flex-col items-center justify-center transition-all bg-gradient-to-b shadow-2xl",
                       isDark ? "bg-white/5 border-white/10" : "from-gray-50 to-white border-gray-200"
                    )}>
                      <span className={clsx("text-4xl font-black leading-none mb-3", isDark ? "text-blue-400" : "text-blue-600")}>{fleetStats.total}</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] opacity-40">Всього</span>
                    </div>

                    <button
                      onClick={() => setShowReturningModal(true)}
                      className={clsx(
                        "p-8 rounded-[2.5rem] border-2 flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 group relative overflow-hidden shadow-2xl",
                        isDark ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-200"
                      )}
                    >
                      <div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/10 transition-all" />
                      <span className="text-4xl font-black leading-none mb-3 text-purple-500">{fleetStats.returning}</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] text-purple-600/60 font-bold">Повернення</span>
                    </button>

                    <button
                      onClick={() => setShowTransitModal(true)}
                      className={clsx(
                        "p-8 rounded-[2.5rem] border-2 flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 group shadow-2xl",
                        isDark ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                      )}
                    >
                      <span className="text-4xl font-black leading-none mb-3 text-blue-500">{fleetStats.inTransit}</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] text-blue-500/60 font-bold">В дорозі</span>
                    </button>

                    <div className={clsx(
                      "p-8 rounded-[2.5rem] border-2 flex flex-col items-center justify-center bg-gradient-to-t shadow-2xl",
                      isDark ? "from-emerald-500/10 to-transparent border-emerald-500/20" : "from-emerald-50 to-white border-emerald-200"
                    )}>
                      <span className="text-4xl font-black leading-none mb-3 text-emerald-500">{fleetStats.finished}</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] text-emerald-500/60 font-bold">Завершено</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "flex-1 flex items-center gap-4 px-10 py-6 rounded-[3rem] border-2 transition-all shadow-[inset_0_2px_15px_rgba(0,0,0,0.5)]",
                      isDark ? "bg-black/60 border-white/5 focus-within:border-blue-500/50" : "bg-gray-100 border-black/10 focus-within:border-blue-400"
                    )}>
                      <MagnifyingGlassIcon className="w-7 h-7 opacity-30" />
                      <input
                        type="text"
                        placeholder="ПОШУК КУР'ЄРА..."
                        value={courierSearchTerm}
                        onChange={(e) => setCourierSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm font-black w-full placeholder:opacity-20 uppercase tracking-[0.5em] text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* COURIER LIST INTERFACE */}
                <div className="p-8">
                  <div className="h-[calc(100vh-36rem)] overflow-y-auto pr-4 space-y-6 custom-scrollbar">
                    <div className="sticky top-0 z-10 pb-6 bg-[#151B2C]/10 backdrop-blur-[100px]">
                      <CourierListItem
                        courierName="Не назначено"
                        vehicleType="car"
                        isSelected={selectedCourier === 'Не назначено' || isId0CourierName(selectedCourier)}
                        onSelect={(name) => handleCourierSelect(name)}
                        deliveredOrdersCount={getCourierMetrics('Не назначено').delivered}
                        totalOrdersCount={getCourierMetrics('Не назначено').total}
                        calculatedCount={getCourierMetrics('Не назначено').activeInRoute}
                        unassignedCount={getCourierMetrics('Не назначено').unassigned}
                        isDark={isDark}
                      />
                      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent mt-8 shadow-glow" />
                    </div>

                    {(() => {
                      const totalPages = Math.ceil(filteredCouriers.length / couriersPerPage);
                      const safePage = Math.min(Math.max(1, courierPage), Math.max(1, totalPages));
                      const visibilityBuffer = filteredCouriers.slice((safePage - 1) * couriersPerPage, safePage * couriersPerPage);
                      
                      return visibilityBuffer.length > 0 ? (
                        visibilityBuffer.map((name) => (
                          <CourierListItem
                            key={name}
                            courierName={name}
                            vehicleType={getCourierVehicleType(name)}
                            isSelected={selectedCourier === name}
                            onSelect={handleCourierSelect}
                            deliveredOrdersCount={getCourierMetrics(name).delivered}
                            totalOrdersCount={getCourierMetrics(name).total}
                            calculatedCount={getCourierMetrics(name).activeInRoute}
                            unassignedCount={getCourierMetrics(name).unassigned}
                            distanceKm={getCourierMetrics(name).distanceKm}
                            isDark={isDark}
                          />
                        ))
                      ) : (
                        <div className="py-40 flex flex-col items-center justify-center opacity-30 grayscale">
                          <TruckIcon className="w-24 h-24 mb-6" />
                          <p className="text-sm font-black uppercase tracking-[0.6em]">Список порожній</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Pagination */}
                {Math.ceil(filteredCouriers.length / couriersPerPage) > 1 && (
                  <div className="p-10 border-t-2 border-white/5 bg-black/50 flex items-center justify-between backdrop-blur-3xl">
                    <button 
                      onClick={() => setCourierPage(p => Math.max(1, p - 1))}
                      disabled={courierPage === 1}
                      className="h-14 px-10 rounded-[2rem] hover:bg-white/10 disabled:opacity-20 transition-all font-black text-xs uppercase tracking-widest border-2 border-white/10 shadow-2xl active:scale-95"
                    >
                      Назад
                    </button>
                    <span className="text-sm font-black uppercase tracking-[0.5em] opacity-60">
                      {courierPage} / {Math.ceil(filteredCouriers.length / couriersPerPage)}
                    </span>
                    <button 
                      onClick={() => setCourierPage(p => p + 1)}
                      disabled={courierPage >= Math.ceil(filteredCouriers.length / couriersPerPage)}
                      className="h-14 px-10 rounded-[2rem] hover:bg-white/10 disabled:opacity-20 transition-all font-black text-xs uppercase tracking-widest border-2 border-white/10 shadow-2xl active:scale-95"
                    >
                      Далі
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MAIN WORKING AREA: ORDER DASHBOARD */}
          <div className="flex-1 w-full relative min-w-0" data-tour="order-select">
            {!selectedCourier ? (
              <div className={clsx(
                "flex flex-col items-center justify-center p-32 lg:p-60 rounded-[5rem] border-8 border-dashed transition-all duration-1000 shadow-2xl",
                isDark ? "bg-[#151B2C]/40 border-white/10" : "bg-gray-50 border-gray-200"
              )}>
                <div className={clsx(
                  "w-48 h-48 rounded-[4rem] flex items-center justify-center mb-12 shadow-2xl relative",
                  isDark ? "bg-gray-900/90" : "bg-white"
                )}>
                   <div className="absolute inset-0 bg-blue-500/30 rounded-[4rem] blur-[60px] animate-pulse" />
                   <TruckIcon className={clsx("w-24 h-24 relative z-10", isDark ? "text-gray-600" : "text-gray-300")} />
                </div>
                <h3 className={clsx("text-6xl font-black mb-6 tracking-tighter uppercase", isDark ? "text-gray-600" : "text-gray-400")}>
                  Виберіть кур'єра
                </h3>
              </div>
            ) : (
              <div className="space-y-12 animate-in fade-in duration-1000">
                <Suspense fallback={<div className="h-screen flex items-center justify-center opacity-30 font-black uppercase tracking-[0.8em]">SYSTEM LOADING...</div>}>
                  <OrderList 
                    orders={excelData.orders}
                    courierName={selectedCourier}
                    isDark={isDark}
                    ordersInRoutes={excelData.routes}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </div>

        {/* Global Overlays & Modals Systems v5.234 */}
        <div id="km-final-overlays-v5234" className="relative z-[200]">
          {showAddressEditModal && editingOrder && (
            <AddressEditModal
              isOpen={showAddressEditModal}
              onClose={() => {
                setShowAddressEditModal(false)
                setEditingOrder(null)
              }}
              onSave={(newAddress, coords) => handleAddressUpdate(newAddress, coords)}
              currentAddress={editingOrder.address}
              orderNumber={editingOrder.orderNumber}
              customerName={editingOrder.customerName}
              cityContext={localSettings.cityBias}
              isDark={isDark}
            />
          )}

          {showHelpModal && (
            <Suspense fallback={null}>
              <HelpModalRoutes
                isOpen={showHelpModal}
                onClose={() => setShowHelpModal(false)}
                onStartTour={() => {
                  setShowHelpModal(false)
                  setTimeout(() => setShowHelpTour(true), 300)
                }}
              />
            </Suspense>
          )}

          {showHelpTour && (
            <Suspense fallback={null}>
              <HelpTour
                isOpen={showHelpTour}
                onClose={() => setShowHelpTour(false)}
                onComplete={() => setShowHelpTour(false)}
                steps={[]}
              />
            </Suspense>
          )}

          <ReturningCouriersModal
            show={showReturningModal}
            onClose={() => setShowReturningModal(false)}
            isDark={isDark}
            data={returningCouriersData}
            isGeocoding={isGeocodingETA}
            onSelectCourier={(name) => {
              setSelectedCourier(name)
              setShowReturningModal(false)
            }}
          />

          <TransitCouriersModal
            show={showTransitModal}
            onClose={() => setShowTransitModal(false)}
            isDark={isDark}
            data={transitCouriersData}
            onSelectCourier={(name) => {
              setSelectedCourier(name)
              setShowTransitModal(false)
            }}
          />

          <DisambiguationModal
            open={!!(disambModal && disambModal.open)}
            title={disambModal?.title || ''}
            options={disambModal?.options || []}
            isDark={isDark}
            onResolve={handleDisambiguationResolve}
          />
        </div>
      </>
    </div>
  );
};
'''

# Replacement
final_content = text[:start_idx] + elite_ui + text[end_idx:]

with open(path, 'w') as f:
    f.write(final_content)

print(f'SUCCESS: ELITE v5.234 DEPLOYED. start:{start_idx} end:{end_idx}')
