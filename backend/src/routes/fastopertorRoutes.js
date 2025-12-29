const express = require('express');
const { FastopertorController } = require('../controllers/FastopertorController');

const router = express.Router();
const fastopertorController = new FastopertorController();

// POST /api/fastopertor/fetch - Получить данные из Fastopertor API
router.post('/fetch', fastopertorController.fetchData.bind(fastopertorController));

// POST /api/fastopertor/validate - Валидация API подключения
router.post('/validate', fastopertorController.validateApi.bind(fastopertorController));

module.exports = router;


