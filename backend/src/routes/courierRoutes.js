const express = require('express');
const router = express.Router();
const { authenticateToken, authorize, auditLog } = require('../middleware/auth');
const CreateCourierCommand = require('../commands/CreateCourierCommand');
const UpdateCourierCommand = require('../commands/UpdateCourierCommand');
const DeleteCourierCommand = require('../commands/DeleteCourierCommand');
const ListCouriersQuery = require('../queries/ListCouriersQuery');
const GetCourierQuery = require('../queries/GetCourierQuery');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/couriers - Get all couriers
 */
router.get('/', authorize('courier:list'), async (req, res) => {
    try {
        const divisionId = req.user.role === 'admin' ? null : req.user.divisionId;
        const couriers = await ListCouriersQuery.execute({ divisionId });
        res.json({ success: true, data: couriers });
    } catch (error) {
        logger.error('Ошибка получения списка курьеров', { error: error.message });
        res.status(500).json({ success: false, error: 'ВнутренняяОшибкаСервера' });
    }
});

/**
 * GET /api/couriers/:id - Get specific courier
 */
router.get('/:id', authorize('courier:read'), async (req, res) => {
    try {
        const courier = await GetCourierQuery.execute(req.params.id);
        res.json({ success: true, data: courier });
    } catch (error) {
        logger.error('Ошибка получения курьера', { error: error.message, id: req.params.id });
        res.status(error.message === 'Courier not found' ? 404 : 500).json({
            success: false,
            error: error.message === 'Courier not found' ? 'КурьерНеНайден' : 'ВнутренняяОшибкаСервера'
        });
    }
});

/**
 * POST /api/couriers - Create new courier
 */
router.post('/', authorize('courier:create'), auditLog('create_courier'), async (req, res) => {
    try {
        const courier = await CreateCourierCommand.execute(req.body, { user: req.user });
        res.status(201).json({ success: true, data: courier });
    } catch (error) {
        logger.error('Ошибка создания курьера', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'ОшибкаЗапроса' });
    }
});

/**
 * PUT /api/couriers/:id - Update courier
 */
router.put('/:id', authorize('courier:update'), auditLog('update_courier'), async (req, res) => {
    try {
        const courier = await UpdateCourierCommand.execute(req.params.id, req.body, { user: req.user });
        res.json({ success: true, data: courier });
    } catch (error) {
        logger.error('Ошибка обновления курьера', { error: error.message, id: req.params.id });
        res.status(error.message === 'Courier not found' ? 404 : 400).json({
            success: false,
            error: error.message === 'Courier not found' ? 'КурьерНеНайден' : 'ОшибкаЗапроса'
        });
    }
});

/**
 * DELETE /api/couriers/:id - Delete courier
 */
router.delete('/:id', authorize('courier:delete'), auditLog('delete_courier'), async (req, res) => {
    try {
        await DeleteCourierCommand.execute(req.params.id, { user: req.user });
        res.json({ success: true });
    } catch (error) {
        logger.error('Ошибка удаления курьера', { error: error.message, id: req.params.id });
        res.status(error.message === 'Courier not found' ? 404 : 400).json({
            success: false,
            error: error.message === 'Courier not found' ? 'КурьерНеНайден' : 'ОшибкаЗапроса'
        });
    }
});

/**
 * GET /api/couriers/:id/statistics - Get courier statistics
 */
router.get('/:id/statistics', (req, res) => {
    // Placeholder for now, can be moved to a query later
    res.json({ success: true, data: { id: req.params.id, stats: {} } });
});

module.exports = router;
