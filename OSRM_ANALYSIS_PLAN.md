# OSRM Routing Alternatives — Analysis & Implementation Plan

## Current State

Your project (`turboCalculator.js`) already uses a **multi-engine fallback system**:
1. **Yapiko OSRM** (primary, custom)
2. **Valhalla** (fallback #1)
3. **Photon OSRM** (fallback #2)
4. **OSRM Public** (`router.project-osrm.org`, fallback #3)

The code uses `Promise.race()` to try engines in priority order and returns the first successful result.

---

## Top OSRM Alternatives Found

| Engine | GitHub Stars | Language | Key Features |
|--------|--------------|----------|---------------|
| **OSRM** (Project-OSRM/osrm-backend) | 7,600 ⭐ | C++ | The original, most mature, OSM routing |
| **Valhalla** (valhalla/valhalla) | 5,563 ⭐ | C++ | Walking/cycling/driving, matrix calculations, turn-by-turn |
| **GraphHopper** (graphhopper/graphhopper) | 6,384 ⭐ | Java | Great Java library, also offers cloud API, isochrones |
| **routingjs** (gis-ops/routingjs) | 69 ⭐ | TypeScript | Node.js wrapper for multiple engines (GraphHopper, Valhalla, OSRM) |
| **routx** (MKuranowski/routx) | 6 ⭐ | Rust | Lightweight, fast Rust library for OSM routing |
| **terra-route** (JamesLMilner/terra-route) | 14 ⭐ | TypeScript | Client-side routing via GeoJSON networks |

---

## Recommended for Your Project

### 1. **routingjs** (gis-ops/routingjs) — HIGH PRIORITY
- **TypeScript/Node.js wrapper** — integrates easily with your backend
- Already supports **GraphHopper, Valhalla, OSRM** with unified API
- Includes matrix calculations
- NPM: `@routingjs/graphhopper`, `@routingjs/valhalla`, `@routingjs/osrm`
- **Benefit**: Replace your custom multi-engine fallback with battle-tested library

### 2. **GraphHopper** (Directions API or self-hosted)
- Offers **free tier** with API key
- Great accuracy, includes traffic-aware routing
- NPM: `graphhopper-js-api-client` or `@graphhopper/directions-api-js-client`
- **Benefit**: Reliable commercial-grade routing, no self-host needed

### 3. **OSRM v6.0** (Project-OSRM/osrm-backend)
- Latest version with performance improvements
- Better matrix handling, more stable
- **Benefit**: Upgrade your existing OSRM server to latest version

### 4. **terra-route** (Client-side)
- Pure TypeScript, no server needed
- Uses pre-loaded GeoJSON network
- **Benefit**: Fast for small routes, offline capable

---

## Implementation Plan

### Phase 1: Improve Current Multi-Engine (Quick Wins)

| Task | Effort | Impact |
|------|--------|--------|
| Upgrade OSRM to v6.0 on your server | Medium | Faster, more stable |
| Add GraphHopper API as additional fallback | Low | Better accuracy |
| Increase timeout for matrix calculations | Low | Fewer false failures |

### Phase 2: Use routingjs Library (Recommended)

```bash
# Install
npm install @routingjs/graphhopper @routingjs/valhalla @routingjs/osrm
```

Replace your engine array in `turboCalculator.js` with routingjs:
```javascript
import { GraphHopper, Valhalla, OSRM } from '@routingjs/core';

// Configure
const gh = new GraphHopper({ key: 'YOUR_KEY' });
const valhalla = new Valhalla({ url: 'http://valhalla.yapiko.kh.ua' });
const osrm = OSRM.fromUrl('http://116.204.153.171:5050');

// Use unified API
const route = await gh.route({ waypoints });
const matrix = await gh.table({ sources, targets });
```

### Phase 3: Self-Hosted Upgrades

| Task | Effort | Impact |
|------|--------|--------|
| Set up OSRM v6.0 Docker container | Medium | Latest features |
| Deploy Valhalla Docker | Medium | Better for complex routes |
| Configure GraphHopper (optional) | High | Most features, requires tuning |

---

## Docker Deployment (Self-Hosted Options)

### OSRM v6.0
```yaml
# docker-compose.yml
services:
  osrm:
    image: osrm/osrm-backend:v6.0
    ports:
      - "5000:5000"
    volumes:
      - ./data:/data
    command: osrm-routed --algorithm mld /data/ukraine-latest.osrm
```

### Valhalla
```yaml
services:
  valhalla:
    image: valhalla/valhalla
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla_tiles:/valhalla/tiles
    environment:
      - FORCE_BUILD=1
```

---

## Priority Recommendations

1. **Immediate**: Add GraphHopper API as fallback (free tier, easy integration)
2. **Short-term**: Replace custom engine logic with routingjs library
3. **Medium-term**: Upgrade OSRM to v6.0
4. **Long-term**: Deploy Valhalla for complex routing scenarios

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| API rate limits (GraphHopper) | Cache results, use self-hosted |
| Network failures | Already have fallback, keep it |
| Matrix calculation timeouts | Increase timeouts, use batch processing |

---

## Next Steps

Would you like me to:
1. **Implement routingjs integration** — replace your multi-engine logic with the library?
2. **Add GraphHopper API** as an additional fallback engine?
3. **Create Docker configs** for OSRM v6.0 or Valhalla?
4. **Research specific routingjs methods** for matrix calculations?

Let me know which priority interests you most!