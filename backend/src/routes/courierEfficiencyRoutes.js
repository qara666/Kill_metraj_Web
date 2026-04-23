const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const AnalyticsService = require('../services/AnalyticsService');
const logger = require('../utils/logger');

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV;
const needAuth = !isDev;

if (needAuth) {
  router.use(authenticateToken);
}

// GET /api/efficiency/hourly
router.get('/hourly', needAuth ? authorize('analytics:read') : (req, res, next) => next(), async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, error: 'Требуется параметр date (YYYY-MM-DD)' });
        }
        const data = await AnalyticsService.getHourlyEfficiency(date);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('[Efficiency] Ошибка:', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

// GET /api/efficiency/courier/:courierId
router.get('/courier/:courierId', needAuth ? authorize('analytics:read') : (req, res, next) => next(), async (req, res) => {
    try {
        const { date } = req.query;
        const courierId = req.params.courierId;
        if (!date) {
            return res.status(400).json({ success: false, error: 'Требуется параметр date (YYYY-MM-DD)' });
        }
        const data = await AnalyticsService.getCourierEfficiency(date, courierId);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('[Efficiency] Ошибка:', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

// GET /api/efficiency/dynamics
router.get('/dynamics', needAuth ? authorize('analytics:read') : (req, res, next) => next(), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'Требуются startDate и endDate' });
        }
        const data = await AnalyticsService.getOrderDynamics(startDate, endDate);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('[Efficiency] Ошибка:', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

// GET /api/efficiency/monitoring
router.get('/monitoring', needAuth ? authorize('analytics:read') : (req, res, next) => next(), async (req, res) => {
    try {
        const { date, minEfficiency, earlyRelease } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, error: 'Требуется параметр date (YYYY-MM-DD)' });
        }
        const options = {
            minEfficiencyThreshold: minEfficiency ? parseFloat(minEfficiency) : 1.5,
            earlyReleaseThreshold: earlyRelease ? parseFloat(earlyRelease) : 0.8
        };
        const data = await AnalyticsService.getSmartMonitoring(date, options);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('[Efficiency] Ошибка:', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

// GET /api/efficiency/today
router.get('/today', needAuth ? authorize('analytics:read') : (req, res, next) => next(), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const data = await AnalyticsService.getSmartMonitoring(today);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('[Efficiency] Ошибка:', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

module.exports = router;