const axios = require('axios');
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Proxy route for KML fetching
router.get('/kml', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    logger.info(`Fetching KML from: ${url}`);

    try {
        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000 // 10s timeout
        });

        res.header('Content-Type', 'application/vnd.google-earth.kml+xml');
        res.send(response.data);
    } catch (error) {
        logger.error('Error fetching KML:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch KML',
            details: error.message
        });
    }
});

module.exports = router;
