import os, sys

path = 'src/components/route/RouteManagement.tsx'
with open(path, 'r') as f:
    content = f.read()

# Marker-based total rewrite of the RETURN block v5.232
unique_anchor = '  const formatDistance = (distanceKm: number) => {'
anchor_pos = content.find(unique_anchor)

if anchor_pos == -1:
    print('ERROR: Anchor not found')
    sys.exit(1)

# Find the next 'return (' after our unique anchor
start_idx = content.find('  return (', anchor_pos)
end_section = '// --- Helper Components for Virtualization ---'
end_idx = content.find(end_section)

if start_idx != -1 and end_idx != -1:
    new_ui = r'''  return (
    <div className="flex flex-col gap-8 w-full max-w-full overflow-x-hidden min-h-screen px-4 lg:px-0">
      {/* 🚀 ELITE DASHBOARD HEADER v5.232 🚀 */}
      <header className={clsx(
        "rounded-[3rem] p-10 shadow-2xl border transition-all duration-700 relative overflow-hidden backdrop-blur-3xl group",
        isDark ? "bg-[#151B2C]/80 border-white/5" : "bg-white border-black/5 shadow-blue-500/5"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-fuchsia-600/5 to-pink-600/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-10">
          <div className="flex items-center gap-8">
            <div className={clsx(
              "w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-[0_20px_50px_rgba(37,_99,_235,_0.3)] transition-all hover:rotate-12 active:scale-90 text-white bg-gradient-to-br",
              isDark ? "from-blue-600 to-indigo-800" : "from-blue-500 to-indigo-600"
            )}>
              <MapIcon className="w-12 h-12" />
            </div>
            <div>
              <h1 className={clsx(
                "text-4xl font-black tracking-tight uppercase leading-none mb-3",
                isDark ? "text-white" : "text-gray-900"
              )}>
                Маршрутизація
              </h1>
              <div className="flex items-center gap-4">
                <span className={clsx("text-sm font-black uppercase tracking-[0.4em] opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                  {fleetStats.total} кур'єрів
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 animate-pulse" />
                <span className={clsx("text-sm font-black uppercase tracking-[0.4em] opacity-40", isDark ? "text-gray-400" : "text-gray-500")}>
                  {(excelData?.routes?.length ?? 0)} АКТИВНІ МАРШРУТИ
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => (window as any).__refreshTurboRoutes?.()}
                className={clsx(
                  "h-16 px-10 rounded-3xl flex items-center gap-4 transition-all active:scale-95 text-xs font-black uppercase tracking-[0.4em] border shadow-lg",
                  isDark 
                    ? "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10 hover:border-blue-500/40" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent hover:border-blue-300"
                )}
              >
                <ArrowPathIcon className="w-6 h-6" />
                <span>Оновити</span>
              </button>
              <button
                onClick={() => setShowHelpModal(true)}
                className={clsx(
                  "w-16 h-16 rounded-3xl flex items-center justify-center transition-all border p-0 active:scale-95 shadow-lg group/help",
                  isDark ? "bg-white/5 border-white/5 text-gray-400 hover:text-blue-400 hover:border-blue-500/40" : "bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200"
                )}
              >
                <QuestionMarkCircleIcon className="w-8 h-8 transition-transform group-hover/help:rotate-12" />
              </button>
            </div>
            
            <div className="h-16 px-8 rounded-3xl flex items-center gap-6 bg-black/40 border border-white/10 backdrop-blur-3xl shadow-inner ring-1 ring-white/5">
               <ServiceStatusDashboard />
            </div>
          </div>
        </div>
      </header>

      {/* 🚀 CORE DASHBOARD INTERFACE v5.232 🚀 */}
      <>
        <div className="flex flex-col xl:flex-row gap-10 items-start min-h-[600px] mb-32">
          {/* ELITE SIDEBAR: COURIER MANAGEMENT */}
          <div className="w-full lg:w-[460px] lg:sticky lg:top-10" data-tour="courier-select">
            <div className={clsx(
              "rounded-[3.5rem] shadow-2xl border overflow-hidden relative transition-all duration-700",
              isDark ? "bg-[#151B2C]/95 border-white/5 backdrop-blur-3xl" : "bg-white border-black/5 shadow-blue-500/10"
            )}>
              <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-24 -mt-24 blur-[80px] opacity-70 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col h-full">
                {/* Stats Header Grid */}
                <div className="p-8 border-b border-white/10 bg-black/20">
                  <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className={clsx(
                      "p-6 rounded-[2.5rem] border flex flex-col items-center justify-center transition-all shadow-xl backdrop-blur-md",
                       isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-black/10"
                    )}>
                      <span className={clsx("text-3xl font-black leading-none mb-2", isDark ? "text-blue-400" : "text-blue-600")}>{fleetStats.total}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Всього</span>
                    </div>

                    <button
                      onClick={() => setShowReturningModal(true)}
                      className={clsx(
                        "p-6 rounded-[2.5rem] border flex flex-col items-center justify-center transition-all hover:scale-[1.05] active:scale-95 group relative overflow-hidden shadow-xl backdrop-blur-md",
                        isDark ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-200"
                      )}
                    >
                      <div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/5 transition-all" />
                      <span className="text-3xl font-black leading-none mb-2 text-purple-500">{fleetStats.returning}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-600/60">Повернення</span>
                    </button>

                    <button
                      onClick={() => setShowTransitModal(true)}
                      className={clsx(
                        "p-6 rounded-[2.5rem] border flex flex-col items-center justify-center transition-all hover:scale-[1.05] active:scale-95 group shadow-xl backdrop-blur-md",
                        isDark ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                      )}
                    >
                      <span className="text-3xl font-black leading-none mb-2 text-blue-500">{fleetStats.inTransit}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/50">В дорозі</span>
                    </button>

                    <div className={clsx(
                      "p-6 rounded-[2.5rem] border flex flex-col items-center justify-center shadow-xl backdrop-blur-md",
                      isDark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
                    )}>
                      <span className="text-3xl font-black leading-none mb-2 text-emerald-500">{fleetStats.finished}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/50">Завершено</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      "flex-1 flex items-center gap-4 px-8 py-5 rounded-[2.25rem] border transition-all shadow-inner ring-1 ring-white/5",
                      isDark ? "bg-black/50 border-white/10 focus-within:border-blue-500/60" : "bg-gray-100 border-black/10 focus-within:border-blue-400"
                    )}>
                      <MagnifyingGlassIcon className="w-6 h-6 opacity-30" />
                      <input
                        type="text"
                        placeholder="ПОШУК КУР'ЄРА..."
                        value={courierSearchTerm}
                        onChange={(e) => setCourierSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-black w-full placeholder:opacity-20 uppercase tracking-[0.4em] text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* COURIER LIST: HIGH-FIDELITY HEIGHT CONSTRAINT */}
                <div className="p-6">
                  <div className="h-[calc(100vh-34rem)] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                    <div className="sticky top-0 z-10 pb-4 bg-[#151B2C]/10 backdrop-blur-2xl">
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
                      <div className="h-px bg-white/10 mt-6 shadow-glow" />
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
                        <div className="py-32 flex flex-col items-center justify-center opacity-30 filter grayscale mix-blend-overlay">
                          <TruckIcon className="w-20 h-20 mb-6" />
                          <p className="text-xs font-black uppercase tracking-[0.5em]">Список порожній</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Sidebar Navigation */}
                {Math.ceil(filteredCouriers.length / couriersPerPage) > 1 && (
                  <div className="p-8 border-t border-white/10 bg-black/40 flex items-center justify-between backdrop-blur-3xl">
                    <button 
                      onClick={() => setCourierPage(p => Math.max(1, p - 1))}
                      disabled={courierPage === 1}
                      className="h-12 px-8 rounded-2xl hover:bg-white/10 disabled:opacity-20 transition-all font-black text-xs uppercase tracking-widest border border-white/10 shadow-lg"
                    >
                      Назад
                    </button>
                    <span className="text-xs font-black uppercase tracking-[0.4em] opacity-50">
                      {courierPage} / {Math.ceil(filteredCouriers.length / couriersPerPage)}
                    </span>
                    <button 
                      onClick={() => setCourierPage(p => p + 1)}
                      disabled={courierPage >= Math.ceil(filteredCouriers.length / couriersPerPage)}
                      className="h-12 px-8 rounded-2xl hover:bg-white/10 disabled:opacity-20 transition-all font-black text-xs uppercase tracking-widest border border-white/10 shadow-lg"
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
                "flex flex-col items-center justify-center p-20 lg:p-40 rounded-[4rem] border-8 border-dashed transition-all duration-700",
                isDark ? "bg-[#151B2C]/30 border-white/5 shadow-[inset_0_2px_40px_rgba(0,0,0,0.4)]" : "bg-gray-50 border-gray-100"
              )}>
                <div className={clsx(
                  "w-36 h-36 rounded-[3rem] flex items-center justify-center mb-10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] relative group/icon",
                  isDark ? "bg-gray-800/90" : "bg-white"
                )}>
                   <div className="absolute inset-0 bg-blue-500/20 rounded-[3rem] blur-[40px] animate-pulse group-hover/icon:blur-[60px] transition-all" />
                   <TruckIcon className={clsx("w-16 h-16 relative z-10 transition-transform group-hover/icon:scale-110", isDark ? "text-gray-500" : "text-gray-300")} />
                </div>
                <h3 className={clsx("text-4xl font-black mb-4 tracking-tighter uppercase", isDark ? "text-gray-500" : "text-gray-400")}>
                  Виберіть кур'єра
                </h3>
                <p className={clsx("text-sm font-black uppercase tracking-[0.4em] opacity-20", isDark ? "text-white" : "text-black")}>
                  ДЛЯ ПОЧАТКУ ПЛАНУВАННЯ МАРШРУТІВ
                </p>
              </div>
            ) : (
              <div className="space-y-10 animate-in fade-in zoom-in duration-700">
                <Suspense fallback={<div className="h-96 flex items-center justify-center opacity-30 font-black uppercase tracking-[0.5em] animate-pulse">Завантаження замовлень...</div>}>
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

        {/* ANALYTICS & ACTIVE ROUTES PANELS */}
        <div className="pt-20 pb-40 space-y-20 border-t border-white/5">
          {excelData?.routes && excelData.routes.length > 0 && (
            <div className="animate-in slide-in-from-bottom-[100px] duration-1000">
               <div className="flex items-center gap-6 mb-12 ml-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-500/30" />
                  <h2 className={clsx(
                    "text-xs font-black uppercase tracking-[0.6em] whitespace-nowrap opacity-50",
                    isDark ? "text-white" : "text-gray-600"
                  )}>
                    ДІЮЧІ МАРШРУТИ ФЛОТУ
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-500/30" />
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-10" data-tour="route-list">
                 {(() => {
                    const sortedRoutes = [...excelData.routes].sort((a, b) => b.id.localeCompare(a.id));
                    const totalPages = Math.ceil(sortedRoutes.length / routesPerPage);
                    const safePage = Math.min(Math.max(1, routePage), Math.max(1, totalPages));
                    return sortedRoutes.slice((safePage - 1) * routesPerPage, safePage * routesPerPage).map((route) => (
                      <Suspense key={route.id} fallback={<div className="h-72 rounded-[3rem] bg-gray-50/5 animate-pulse border border-white/5" />}>
                        <RouteCard
                          route={route}
                          isDark={isDark}
                          onRecalculate={() => {}}
                          onDelete={() => {}}
                          onOpenMaps={() => {}}
                          onOpenValhalla={() => {}}
                        />
                      </Suspense>
                    ));
                 })()}
               </div>
               
               {/* Global Route Pagination */}
               {excelData.routes.length > routesPerPage && (
                 <div className="flex justify-center mt-20 gap-4">
                   <button 
                     onClick={() => setRoutePage(p => Math.max(1, p - 1))}
                     disabled={routePage === 1}
                     className="w-14 h-14 rounded-3xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-blue-600 transition-all font-black text-sm disabled:opacity-5 shadow-2xl active:scale-95"
                   >
                     ←
                   </button>
                   <div className="h-14 px-10 rounded-3xl flex items-center justify-center bg-black/40 border border-white/10 font-black text-sm tracking-[0.4em] shadow-inner text-blue-400">
                     {routePage} / {Math.ceil(excelData.routes.length / routesPerPage)}
                   </div>
                   <button 
                     onClick={() => setRoutePage(p => p + 1)}
                     disabled={routePage >= Math.ceil(excelData.routes.length / routesPerPage)}
                     className="w-14 h-14 rounded-3xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-blue-600 transition-all font-black text-sm disabled:opacity-5 shadow-2xl active:scale-95"
                   >
                     →
                   </button>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* OVERLAYS, MODALS & GLOBAL SYSTEMS */}
        <div id="km-core-overlays-v5232" className="relative z-[100]">
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
'''

# Build new content
new_content = content[:start_idx] + new_ui + content[end_idx:]

with open(path, 'w') as f:
    f.write(new_content)

print(f'SUCCESS: ELITE v5.232 DEPLOYED. Start pos: {start_idx}, End pos: {end_idx}')
else:
    print(f'ERROR: markers not found properly. start:{start_idx} end:{end_idx} anchor:{anchor_pos}')
    sys.exit(1)
