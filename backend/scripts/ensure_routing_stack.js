#!/usr/bin/env node
/**
 * Brings up local OSRM + Valhalla via Docker Compose (if Docker is available).
 * Safe to run before simple_server: on failure, backend uses remote/public fallback.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

function hasDocker() {
    const r = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'pipe' });
    return r.status === 0;
}

function composeUp(backendRoot, composeFile) {
    const r = spawnSync(
        'docker',
        ['compose', '-f', composeFile, 'up', '-d', 'osrm', 'valhalla'],
        { cwd: backendRoot, encoding: 'utf8', stdio: 'inherit' }
    );
    return r.status === 0;
}

async function waitOsrmReady(baseUrl, maxAttempts = 45) {
    const b = baseUrl.replace(/\/+$/, '');
    const url = `${b}/route/v1/driving/30.5234,50.4501;30.5240,50.4510?overview=false`;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await axios.get(url, { timeout: 2500, proxy: false, validateStatus: () => true });
            if (res.status === 200 && res.data?.routes?.[0]) return true;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
}

async function main() {
    if (process.env.SKIP_DOCKER_ROUTING === '1' || process.env.SKIP_DOCKER_ROUTING === 'true') {
        return;
    }
    if (!hasDocker()) {
        console.warn('[ensure_routing_stack] Docker not running — using remote OSRM/Valhalla only.');
        return;
    }

    const backendRoot = path.join(__dirname, '..');
    const stack = path.join(backendRoot, 'docker-compose.selfhost.yml');
    if (!fs.existsSync(stack)) {
        console.warn('[ensure_routing_stack] docker-compose.selfhost.yml missing — skip.');
        return;
    }

    const routingData = path.join(backendRoot, 'routing-data', 'ukraine-latest.osrm');
    if (!fs.existsSync(routingData)) {
        console.warn('[ensure_routing_stack] OSRM graph not built (missing routing-data/ukraine-latest.osrm).');
        console.warn('[ensure_routing_stack] Run once: npm run setup:routing   (or bash scripts/setup_selfhost.sh)');
        return;
    }

    console.log('[ensure_routing_stack] Starting OSRM + Valhalla containers...');
    if (!composeUp(backendRoot, stack)) {
        console.warn('[ensure_routing_stack] docker compose failed — remote fallback will be used.');
        return;
    }

    const selfUrl = (process.env.SELF_HOST_OSRM_URL || 'http://127.0.0.1:5050').replace(/\/+$/, '');
    const ok = await waitOsrmReady(selfUrl);
    if (ok) {
        console.log('[ensure_routing_stack] Local OSRM is ready.');
    } else {
        console.warn('[ensure_routing_stack] OSRM did not become ready in time — using remote until it is up.');
    }
}

main().catch((e) => console.warn('[ensure_routing_stack]', e.message));
