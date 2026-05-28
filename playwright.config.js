module.exports = {
  testDir: 'tests/e2e',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: process.env.FRONTEND_BASE_URL || 'http://localhost:10000',
  },
};
