const { AsyncLocalStorage } = require('async_hooks');

// Хранилище контекста RLS (user_id, division_id, role)
const rlsContextStore = new AsyncLocalStorage();

module.exports = {
    rlsContextStore
};
