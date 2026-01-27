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
        logger.info(`📥 Fetching KML from: ${url}`);

        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000 // 10s timeout
        });

        logger.info(`✅ KML fetched successfully, size: ${response.data.length} bytes`);

        // Frontend expects JSON with 'contents' field
        res.json({
            success: true,
            contents: response.data
        });
    } catch (error) {
        logger.error('❌ Error fetching KML:', {
            url: url,
            error: error.message,
            code: error.code,
            status: error.response?.status
        });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch KML',
            details: error.message
        });
    }
});

module.exports = router;
