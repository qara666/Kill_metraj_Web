const { AsyncLocalStorage } = require('async_hooks');

// Store for RLS context (user_id, division_id, role)
const rlsContextStore = new AsyncLocalStorage();

module.exports = {
    rlsContextStore
};
