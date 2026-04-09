const logger = require('../src/utils/logger');
try {
    console.log('Attempting to require turboCalculator...');
    const turbo = require('./turboCalculator');
    console.log('Success! TurboCalculator is defined:', !!turbo);
    console.log('Trigger type:', typeof turbo.trigger);
} catch (e) {
    console.error('FAILED to require turboCalculator:');
    console.error(e);
}
