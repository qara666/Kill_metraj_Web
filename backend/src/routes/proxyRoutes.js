const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Прокси-маршрут для получения KML
router.get('/kml', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        logger.info('Получение KML по адресу', { url });

        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000 // таймаут 10с
        });

        logger.info('KML успешно получен', { size: response.data.length });

        // Фронтенд ожидает JSON с полем 'contents'
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

// Generic /routing proxy (Handles both OSRM GET and Valhalla POST)
router.all('/routing', async (req, res) => {
    const { url } = req.query;
    const { method, body, headers } = req;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        // Validation: only allow OSRM/Valhalla-like URLs for security
        const isRoutingUrl = url.includes('/route') || url.includes('/table') || url.includes('/sources_to_targets') || url.includes('/nearest');
        if (!isRoutingUrl) {
            return res.status(400).json({ success: false, error: 'Разрешены только маршрутные запросы' });
        }

        logger.info(`Routing Proxy (${method}):`, { url });

        const axiosConfig = {
            method,
            url,
            timeout: 20000,
            headers: {
                'Content-Type': headers['content-type'] || 'application/json'
            }
        };

        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            axiosConfig.data = body;
        }

        const response = await axios(axiosConfig);
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        const errData = error.response?.data || {};
        
        logger.error('Routing Proxy Error', {
            url: url,
            status,
            message: error.message,
            remoteError: errData
        });

        res.status(status).json(errData.success === false ? errData : {
            success: false,
            error: 'Ошибка маршрутного прокси',
            details: error.message,
            remoteStatus: status
        });
    }
});

// Proxy route for OSRM fetching (Legacy support)
router.get('/osrm', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'URL обязателен' });

    try {
        const isOsrmUrl = url.includes('/route/v1/') || url.includes('/table/v1/') || url.includes('/nearest/v1/');
        if (!isOsrmUrl) return res.status(400).json({ success: false, error: 'Разрешены только запросы к OSRM' });

        const response = await axios.get(url, { timeout: 15000 });
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        res.status(status).json({ success: false, error: 'Ошибка OSRM прокси', details: error.message });
    }
});

module.exports = router;

