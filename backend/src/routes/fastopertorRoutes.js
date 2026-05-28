const express = require('express');
const { FastopertorController } = require('../controllers/FastopertorController');

const router = express.Router();
const fastopertorController = new FastopertorController();

/**
 * Обертка для обработки асинхронных ошибок в маршрутах
 */
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// POST /api/fastopertor/fetch - Получить данные из Fastopertor API
router.post('/fetch', asyncHandler(fastopertorController.fetchData.bind(fastopertorController)));

// POST /api/fastopertor/validate - Валидация API подключения
router.post('/validate', asyncHandler(fastopertorController.validateApi.bind(fastopertorController)));

module.exports = router;


