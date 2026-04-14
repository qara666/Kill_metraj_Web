'use strict';

/**
 * Probes self-hosted OSRM / Valhalla / Nominatim (Docker or localhost).
 * When a service is down, consumers skip it and use soft fallback to public providers.
 */

const axios = require('axios');
const logger = require('../utils/logger');

function trimUrl(u) {
    return (u || '').trim().replace(/\/+$/, '');
}

function selfOsrmUrl() {
    return trimUrl(process.env.SELF_HOST_OSRM_URL || 'http://127.0.0.1:5050');
}

function selfValhallaUrl() {
    return trimUrl(process.env.SELF_HOST_VALHALLA_URL || 'http://127.0.0.1:8002');
}

function nominatimLocalUrl() {
    return trimUrl(process.env.NOMINATIM_URL || 'http://127.0.0.1:8080');
}

function isLocalHostUrl(u) {
    if (!u || typeof u !== 'string') return false;
    try {
        const withProto = u.startsWith('http') ? u : `http://${u}`;
        const h = new URL(withProto).hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '::1';
    } catch {
        return false;
    }
}

let state = {
    osrmLocal: null,
    valhallaLocal: null,
    nominatimLocal: null,
    lastProbeAt: 0,
    lastError: null
};

let probeInterval = null;

async function probeOsrm(baseUrl) {
    const b = trimUrl(baseUrl);
    const url = `${b}/route/v1/driving/30.5234,50.4501;30.5240,50.4510?overview=false`;
    const res = await axios.get(url, { timeout: 3500, proxy: false, validateStatus: () => true });
    return res.status === 200 && res.data?.routes?.[0];
}

async function probeValhalla(baseUrl) {
    const b = trimUrl(baseUrl);
    const body = {
        locations: [{ lat: 50.4501, lon: 30.5234 }, { lat: 50.451, lon: 30.524 }],
        costing: 'auto'
    };
    const res = await axios.post(`${b}/route`, body, {
        timeout: 6000,
        proxy: false,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json' }
    });
    return res.status === 200 && res.data?.trip?.summary;
}

async function probeNominatim(baseUrl) {
    const b = trimUrl(baseUrl);
    const url = `${b}/search?format=json&q=${encodeURIComponent('Kyiv')}&limit=1`;
    const res = await axios.get(url, { timeout: 3500, proxy: false, validateStatus: () => true });
    return res.status === 200 && Array.isArray(res.data) && res.data.length > 0;
}

async function probeAll() {
    if (process.env.DISABLE_SELF_HOST_ROUTING === '1' || process.env.DISABLE_SELF_HOST_ROUTING === 'true') {
        state = {
            osrmLocal: false,
            valhallaLocal: false,
            nominatimLocal: false,
            lastProbeAt: Date.now(),
            lastError: null
        };
        return state;
    }
    try {
        const [o, v, n] = await Promise.all([
            probeOsrm(selfOsrmUrl()).catch(() => false),
            probeValhalla(selfValhallaUrl()).catch(() => false),
            probeNominatim(nominatimLocalUrl()).catch(() => false)
        ]);
        state.osrmLocal = !!o;
        state.valhallaLocal = !!v;
        state.nominatimLocal = !!n;
        state.lastProbeAt = Date.now();
        state.lastError = null;
        logger.info(`[SelfHostHealth] osrm=${state.osrmLocal} valhalla=${state.valhallaLocal} nominatim=${state.nominatimLocal}`);
    } catch (e) {
        state.lastError = e.message;
    }
    return getState();
}

function getState() {
    return {
        osrmLocal: state.osrmLocal,
        valhallaLocal: state.valhallaLocal,
        nominatimLocal: state.nominatimLocal,
        lastProbeAt: state.lastProbeAt,
        lastError: state.lastError,
        urls: {
            osrm: selfOsrmUrl(),
            valhalla: selfValhallaUrl(),
            nominatim: nominatimLocalUrl()
        }
    };
}

function startPeriodicProbe(ms = 120000) {
    if (probeInterval) return;
    probeAll().catch(() => {});
    probeInterval = setInterval(() => {
        probeAll().catch(() => {});
    }, ms);
}

function isSelfOsrmAvailable() {
    return state.osrmLocal === true;
}

function isSelfValhallaAvailable() {
    return state.valhallaLocal === true;
}

/** Skip local Nominatim only after a failed probe (soft fallback to public). */
function shouldQueryNominatimLocal() {
    if (process.env.DISABLE_SELF_HOST_ROUTING === '1' || process.env.DISABLE_SELF_HOST_ROUTING === 'true') {
        return false;
    }
    if (state.nominatimLocal === false) return false;
    return true;
}

module.exports = {
    probeAll,
    getState,
    startPeriodicProbe,
    isLocalHostUrl,
    selfOsrmUrl,
    selfValhallaUrl,
    nominatimLocalUrl,
    isSelfOsrmAvailable,
    isSelfValhallaAvailable,
    shouldQueryNominatimLocal
};
