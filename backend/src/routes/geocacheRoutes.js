const express = require('express');
const router = express.Router();
const GeoCache = require('../models/GeoCache');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * POST /api/geocache/bulk-get
 */
router.post('/bulk-get', async (req, res) => {
    try {
        const { addresses } = req.body;
        if (!Array.isArray(addresses) || addresses.length === 0) {
            return res.json({ success: true, hits: {} });
        }
        const searchKeys = addresses.slice(0, 100).map(a => a.toLowerCase().trim());
        const records = await GeoCache.findAll({
            where: {
                address_key: { [Op.in]: searchKeys },
                expires_at: { [Op.gt]: new Date() }
            }
        });
        const hits = {};
        records.forEach(r => {
            hits[r.address_key] = {
                success: r.is_success,
                formattedAddress: r.formatted_address,
                latitude: r.lat,
                longitude: r.lng,
                placeId: r.place_id,
                locationType: r.location_type,
                types: r.types || [],
                error: r.error_message
            };
        });
        if (records.length > 0) {
            const ids = records.map(r => r.id);
            GeoCache.update(
                { hit_count: sequelize.literal('hit_count + 1') },
                { where: { id: { [Op.in]: ids } } }
            ).catch(e => console.error('[GeoCache] Error incrementing hit count:', e));
        }
        res.json({ success: true, hits });
    } catch (error) {
        console.error('[GeoCache] Error in bulk-get:', error);
        res.status(500).json({ success: false, hits: {}, error: error.message });
    }
});

/**
 * POST /api/geocache/bulk-set
 */
router.post('/bulk-set', async (req, res) => {
    try {
        const { entries } = req.body;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.json({ success: true, saved: 0 });
        }
        const now = new Date();
        const recordsToUpsert = entries.slice(0, 100).map(entry => {
            const result = entry.result;
            const days = entry.ttlDays || 30;
            const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            return {
                address_key: entry.address_key.toLowerCase().trim(),
                lat: result.latitude || null,
                lng: result.longitude || null,
                formatted_address: result.formattedAddress || null,
                location_type: result.locationType || null,
                place_id: result.placeId || null,
                types: result.types || [],
                is_success: result.success,
                error_message: result.error || null,
                expires_at: expiresAt,
                updated_at: now
            };
        });
        await GeoCache.bulkCreate(recordsToUpsert, {
            updateOnDuplicate: [
                'lat', 'lng', 'formatted_address', 'location_type',
                'place_id', 'types', 'is_success', 'error_message',
                'expires_at', 'updated_at'
            ]
        });
        res.json({ success: true, saved: recordsToUpsert.length });
    } catch (error) {
        console.error('[GeoCache] Error in bulk-set:', error);
        res.status(500).json({ success: false, saved: 0, error: error.message });
    }
});

/**
 * GET /api/geocache/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const total = await GeoCache.count();
        const active = await GeoCache.count({
            where: { expires_at: { [Op.gt]: new Date() } }
        });
        const topHits = await GeoCache.findAll({
            attributes: ['address_key', 'hit_count', 'formatted_address'],
            order: [['hit_count', 'DESC']],
            limit: 10
        });
        res.json({
            success: true,
            stats: { total, active, topHits }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const KmlService = require('../services/KmlService');
const { KmlHub, KmlZone } = require('../models');

/**
 * POST /api/geocache/find-zone
 */
router.post('/find-zone', async (req, res) => {
    try {
        const { lat, lng, hubNames } = req.body;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, error: 'Missing lat/lng' });
        }
        const where = { is_active: true };
        if (Array.isArray(hubNames) && hubNames.length > 0) {
            const hubs = await KmlHub.findAll({ where: { name: { [Op.in]: hubNames } } });
            where.hub_id = { [Op.in]: hubs.map(h => h.id) };
        }
        const zones = await KmlZone.findAll({ where });
        const result = KmlService.findZoneForLocation(lat, lng, zones);
        res.json({
            success: true,
            zone: result ? {
                name: result.name,
                hubName: (await result.getHub()).name,
                isTechnical: result.is_technical
            } : null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/geocache/kml-sync
 */
router.post('/kml-sync', async (req, res) => {
    try {
        const { hubName, url } = req.body;
        if (!hubName || !url) {
            return res.status(400).json({ success: false, error: 'Missing hubName or url' });
        }
        const result = await KmlService.syncHubFromUrl(hubName, url);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/geocache/hubs
 */
router.get('/hubs', async (req, res) => {
    try {
        const hubs = await KmlHub.findAll({
            include: [{ model: KmlZone, as: 'zones', attributes: ['id'] }]
        });
        res.json({
            success: true,
            hubs: hubs.map(h => ({
                id: h.id,
                name: h.name,
                sourceUrl: h.source_url,
                isActive: h.is_active,
                lastSyncAt: h.last_sync_at,
                zoneCount: h.zones.length
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/geocache/hubs/:hubId/zones
 */
router.get('/hubs/:hubId/zones', async (req, res) => {
    try {
        const { hubId } = req.params;
        const zones = await KmlZone.findAll({
            where: { hub_id: hubId, is_active: true }
        });
        res.json({
            success: true,
            zones: zones.map(z => ({
                id: z.id,
                name: z.name,
                folderName: z.folder_name,
                boundary: z.boundary,
                bounds: z.bounds,
                isTechnical: z.is_technical
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
