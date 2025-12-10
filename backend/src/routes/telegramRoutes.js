/**
 * Роуты для работы с Telegram API
 */

const express = require('express');
const router = express.Router();
const telegramService = require('../services/TelegramService');

/**
 * POST /api/telegram/initialize
 * Инициализация подключения к Telegram
 */
router.post('/initialize', async (req, res) => {
  try {
    const { sessionId, apiId, apiHash, phoneNumber } = req.body;

    // Валидация обязательных полей
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionId обязателен и должен быть непустой строкой'
      });
    }

    if (!apiId) {
      return res.status(400).json({
        success: false,
        error: 'apiId обязателен'
      });
    }

    if (!apiHash || typeof apiHash !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'apiHash обязателен и должен быть строкой'
      });
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber обязателен и должен быть строкой'
      });
    }

    const result = await telegramService.initialize(
      sessionId.trim(),
      String(apiId).trim(),
      apiHash.trim(),
      phoneNumber.trim()
    );
    
    if (result.success) {
      res.json(result);
    } else if (result.needsAuth) {
      res.status(200).json(result); // 200, так как это ожидаемое состояние
    } else {
      res.status(400).json(result); // 400 для ошибок валидации
    }
  } catch (error) {
    console.error('Ошибка инициализации Telegram:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

/**
 * POST /api/telegram/complete-auth
 * Завершение авторизации с кодом
 */
router.post('/complete-auth', async (req, res) => {
  try {
    const { sessionId, apiId, apiHash, phoneNumber, phoneCode, phoneCodeHash } = req.body;

    // Валидация всех обязательных полей
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionId обязателен'
      });
    }

    if (!apiId) {
      return res.status(400).json({
        success: false,
        error: 'apiId обязателен'
      });
    }

    if (!apiHash || typeof apiHash !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'apiHash обязателен'
      });
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber обязателен'
      });
    }

    if (!phoneCode || typeof phoneCode !== 'string' || phoneCode.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'phoneCode обязателен и должен быть непустой строкой'
      });
    }

    if (!phoneCodeHash || typeof phoneCodeHash !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'phoneCodeHash обязателен. Попробуйте подключиться заново.'
      });
    }

    const result = await telegramService.completeAuth(
      sessionId.trim(),
      String(apiId).trim(),
      apiHash.trim(),
      phoneNumber.trim(),
      phoneCode.trim(),
      phoneCodeHash.trim()
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result); // 400 для ошибок валидации
    }
  } catch (error) {
    console.error('Ошибка завершения авторизации:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

/**
 * GET /api/telegram/status/:sessionId
 * Проверка статуса подключения
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const isConnected = telegramService.isConnected(sessionId);
    
    res.json({
      success: true,
      connected: isConnected
    });
  } catch (error) {
    console.error('Ошибка проверки статуса:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

/**
 * GET /api/telegram/chats/:sessionId
 * Получение списка чатов
 */
router.get('/chats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await telegramService.getChats(sessionId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Ошибка получения чатов:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

/**
 * POST /api/telegram/search/:sessionId
 * Поиск сообщений
 */
router.post('/search/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query, chatIds, dateFrom, dateTo, limit } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Необходим параметр query'
      });
    }

    const result = await telegramService.searchMessages(sessionId, {
      query,
      chatIds,
      dateFrom,
      dateTo,
      limit
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Ошибка поиска сообщений:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

/**
 * POST /api/telegram/disconnect/:sessionId
 * Отключение от Telegram
 */
router.post('/disconnect/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await telegramService.disconnect(sessionId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Ошибка отключения:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

module.exports = router;

