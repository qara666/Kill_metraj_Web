const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Proxy route for KML fetching
router.get('/kml', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        logger.info('Получение KML по адресу', { url });

        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000 // 10s timeout
        });

        logger.info('KML успешно получен', { size: response.data.length });

        // Frontend expects JSON with 'contents' field
        res.json({
            success: true,
            contents: response.data
        });
    } catch (error) {
        logger.error('Ошибка получения KML', {
            url: url,
            error: error.message,
            code: error.code,
            status: error.response?.status
        });
        res.status(500).json({
            success: false,
            error: 'Не удалось получить KML',
            details: error.message
        });
    }
});

module.exports = router;
