const { groupOrdersByTimeWindow } = require('./workers/turboGroupingHelpers.js');
const orders = [
    { id: 1, plannedTime: "12:30", deliveryZone: "ZONE A", coords: { lat: 46.482, lng: 30.723 } },
    { id: 2, plannedTime: "12:40", deliveryZone: "ZONE A", coords: { lat: 46.483, lng: 30.724 } },
    { id: 3, plannedTime: "12:50", deliveryZone: "ZONE A", coords: { lat: 46.484, lng: 30.725 } },
    { id: 4, plannedTime: "14:00", deliveryZone: "ZONE B", coords: { lat: 46.500, lng: 30.800 } }
];
const result = groupOrdersByTimeWindow(orders, "unassigned", "tester");
console.log(`Grouped ${orders.length} orders into ${result.length} blocks.`);
result.forEach((g, i) => {
    console.log(`Block ${i+1}: ${g.orders.length} orders (Split reason: ${g.splitReason || 'none'})`);
});
