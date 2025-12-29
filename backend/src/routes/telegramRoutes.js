/**
 * Роуты для работы с Telegram API
 */

const express = require('express');
const router = express.Router();
const telegramService = require('../services/TelegramService');
const logger = require('../utils/logger');

/**
 * POST /api/telegram/initialize
 * Инициализация подключения к Telegram
 */
router.post('/initialize', async (req, res) => {
  try {
    const { sessionId, apiId, apiHash, phoneNumber } = req.body;

    logger.info('Получен запрос на инициализацию Telegram', {
      sessionId: sessionId ? `${sessionId.substring(0, 10)}...` : 'undefined',
      apiId: apiId ? String(apiId).substring(0, 5) + '...' : 'undefined',
      apiHashLength: apiHash ? apiHash.length : 0,
      phoneNumberLength: phoneNumber ? phoneNumber.length : 0
    });

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

    // Номер телефона опционален - не требуется для работы с существующей сессией
    // if (!phoneNumber || typeof phoneNumber !== 'string') {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'phoneNumber обязателен и должен быть строкой'
    //   });
    // }

    // Очищаем и нормализуем данные
    const cleanSessionId = sessionId.trim();
    const cleanApiId = String(apiId).trim();
    const cleanApiHash = apiHash.trim();
    const cleanPhoneNumber = phoneNumber ? phoneNumber.trim() : '';

    logger.debug('Очищенные данные инициализации', {
      apiId: cleanApiId.substring(0, 5) + '...',
      apiHashLength: cleanApiHash.length,
      phoneNumberLength: cleanPhoneNumber.length
    });

    const result = await telegramService.initialize(
      cleanSessionId,
      cleanApiId,
      cleanApiHash,
      cleanPhoneNumber
    );
    
    if (result.success) {
      res.json(result);
    } else if (result.needsAuth) {
      res.status(200).json(result); // 200, так как это ожидаемое состояние
    } else {
      res.status(400).json(result); // 400 для ошибок валидации
    }
  } catch (error) {
    logger.error('Ошибка инициализации Telegram', {
      error: error.message,
      stack: error.stack
    });
    // Безопасное извлечение сообщения об ошибке
    let errorMessage = 'Неизвестная ошибка';
    try {
      if (error && typeof error === 'object' && error.message !== undefined) {
        errorMessage = String(error.message);
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = String(error);
      }
    } catch (e) {
      errorMessage = 'Не удалось извлечь сообщение об ошибке';
    }
    res.status(500).json({
      success: false,
      error: errorMessage
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
    } else if (result.needsAuth) {
      // Ожидаемое состояние при истечении/неверном коде — фронт запросит новый код
      res.status(200).json(result);
    } else {
      res.status(400).json(result); // 400 для ошибок валидации
    }
  } catch (error) {
    logger.error('Ошибка завершения авторизации Telegram', {
      error: error.message,
      stack: error.stack
    });
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
    logger.error('Ошибка проверки статуса Telegram', {
      error: error.message,
      stack: error.stack
    });
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
    logger.error('Ошибка получения чатов Telegram', {
      error: error.message,
      stack: error.stack
    });
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
    logger.error('Ошибка поиска сообщений Telegram', {
      error: error.message,
      stack: error.stack
    });
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
    logger.error('Ошибка отключения Telegram', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message || 'Неизвестная ошибка'
    });
  }
});

module.exports = router;

