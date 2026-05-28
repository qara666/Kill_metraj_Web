# Self-host routing/geocoding (practical setup)

This setup keeps your site working even when free public providers throttle.

## 1) Start self-hosted routing now

Use:
- OSRM on `http://<server>:5050`
- Valhalla on `http://<server>:8002`

See `backend/docker-compose.routing.yml`.

## 2) Backend env

Set in backend environment:

```
YAPIKO_OSRM_URL=http://<server>:5050
VALHALLA_URL=http://<server>:8002
```

Optional (if you have self-host Photon):

```
PHOTON_URL=http://<server>:2322
```

## 3) Geocoding policy now

- Provider rate is hard-limited in code to 1 request/sec/provider.
- Short timeouts + short circuit-breaker cooldowns reduce stalls and 429 cascades.
- If public providers fail, system keeps working through cache/FO coords/fallbacks.

## 4) Full self-host geocoding (later)

For full independence from public geocoders, deploy one of:
- Photon (OSM search, lightweight runtime, heavier initial indexing)
- Nominatim (heavier, but fully self-hosted OSM geocoder)

Then point `PHOTON_URL` (and/or custom nominatim endpoint if added) to your server.

