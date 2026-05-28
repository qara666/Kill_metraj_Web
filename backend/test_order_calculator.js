/**
 * Test script for Order Calculator Worker
 */

const { orderCalculator } = require('./workers/orderCalculator');
const logger = require('./src/utils/logger');

async function testOrderCalculator() {
    console.log('=== Testing Order Calculator Worker ===');
    
    try {
        // Start the calculator
        console.log('Starting order calculator...');
        orderCalculator.start();
        
        // Wait a bit for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get stats
        const stats = orderCalculator.getStats();
        console.log('\nCalculator Stats:', JSON.stringify(stats, null, 2));
        
        // Get active orders
        console.log('\nGetting active orders...');
        const orders = await orderCalculator.getActiveOrders();
        console.log(`Found ${orders.length} active orders`);
        
        if (orders.length > 0) {
            console.log('\nSample orders:');
            orders.slice(0, 3).forEach((order, i) => {
                console.log(`${i + 1}. ${order.address} - Courier: ${order.courier}`);
            });
            
            // Group orders
            const grouped = orderCalculator.groupOrders(orders);
            console.log(`\nGrouped into ${Object.keys(grouped).length} couriers`);
            
            // Calculate routes
            console.log('\nCalculating routes...');
            for (const [courierId, courierOrders] of Object.entries(grouped)) {
                if (courierOrders.length >= 2) {
                    console.log(`\nCalculating route for ${courierId} (${courierOrders.length} orders)...`);
                    try {
                        const route = await orderCalculator.calculateCourierRoute(courierId, courierOrders);
                        if (route) {
                            console.log(`✓ Route calculated: ${route.totalDistance.toFixed(2)} km, ${route.totalDuration} min`);
                            console.log(`  Engine: ${route.engine}`);
                        } else {
                            console.log(`✗ No route calculated`);
                        }
                    } catch (error) {
                        console.log(`✗ Error: ${error.message}`);
                    }
                }
            }
        } else {
            console.log('No active orders found');
        }
        
        // Get updated stats
        const finalStats = orderCalculator.getStats();
        console.log('\n=== Final Stats ===');
        console.log(JSON.stringify(finalStats, null, 2));
        
        // Stop the calculator
        orderCalculator.stop();
        console.log('\nTest completed');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run test
testOrderCalculator().catch(console.error);