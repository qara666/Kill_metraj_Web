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

// Proxy route for OSRM fetching (bypasses Mixed Content blocks on Render)
router.get('/osrm', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        // Validation: only allow OSRM-like URLs for security
        const isOsrmUrl = url.includes('/route/v1/') || url.includes('/table/v1/') || url.includes('/nearest/v1/');
        if (!isOsrmUrl) {
            return res.status(400).json({ success: false, error: 'Разрешены только запросы к OSRM' });
        }

        logger.info('OSRM Proxy: Запрос к', { url });

        const response = await axios.get(url, {
            timeout: 15000 // OSRM can take time for large matrices
        });

        // Forward successful response
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        logger.error('OSRM Proxy Error', {
            url: url,
            status,
            message: error.message
        });
        res.status(status).json({
            success: false,
            error: 'Ошибка OSRM прокси',
            details: error.message
        });
    }
});

// Proxy route for Geocoding (Nominatim, Photon, etc.)
router.get('/geocoding', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL обязателен' });
    }

    try {
        // Validation: only allow geocoding-like URLs for security
        const isGeocodingUrl = url.includes('nominatim.openstreetmap.org') || 
                              url.includes('photon.komoot.io') || 
                              url.includes('api.mapbox.com/geocoding') ||
                              url.includes('maps.googleapis.com/maps/api/geocode');
                              
        if (!isGeocodingUrl) {
            return res.status(400).json({ success: false, error: 'Разрешены только запросы к доверенным геокодерам' });
        }

        logger.info('Geocoding Proxy: Запрос к', { url: url.substring(0, 100) + '...' });

        const response = await axios.get(url, {
            headers: { 'Accept-Language': 'ru-RU,ru;q=0.9,uk-UA;q=0.8,uk;q=0.7,en-US;q=0.6,en;q=0.5' },
            timeout: 10000 
        });

        // Forward successful response
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        logger.error('Geocoding Proxy Error', {
            url: url.substring(0, 100) + '...',
            status,
            message: error.message
        });
        res.status(status).json({
            success: false,
            error: 'Ошибка Геокодинг прокси',
            details: error.message
        });
    }
});

module.exports = router;
