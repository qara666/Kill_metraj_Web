#!/usr/bin/env bash
set -euo pipefail

echo "==> Self-host setup for routing/geocoding"
cd "$(dirname "$0")/.."

mkdir -p routing-data valhalla-data nominatim-data

if [ ! -f routing-data/ukraine-latest.osm.pbf ]; then
  echo "==> Downloading Ukraine OSM extract..."
  curl -L "https://download.geofabrik.de/europe/ukraine-latest.osm.pbf" -o routing-data/ukraine-latest.osm.pbf
fi

if [ ! -f routing-data/ukraine-latest.osrm ]; then
  echo "==> Building OSRM dataset (one-time, can take long)..."
  docker run --rm -t -v "$(pwd)/routing-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/ukraine-latest.osm.pbf
  docker run --rm -t -v "$(pwd)/routing-data:/data" osrm/osrm-backend osrm-partition /data/ukraine-latest.osrm
  docker run --rm -t -v "$(pwd)/routing-data:/data" osrm/osrm-backend osrm-customize /data/ukraine-latest.osrm
fi

echo "==> Starting OSRM + Valhalla (Nominatim is optional — slow first import)..."
docker compose -f docker-compose.selfhost.yml up -d osrm valhalla

echo "==> Health checks..."
set +e
curl -sf "http://127.0.0.1:5050/route/v1/driving/30.5234,50.4501;30.5240,50.4510?overview=false" >/dev/null && echo "OSRM OK" || echo "OSRM FAIL"
curl -sf "http://127.0.0.1:8002/route" -H "Content-Type: application/json" -d '{"locations":[{"lat":50.4501,"lon":30.5234},{"lat":50.4510,"lon":30.5240}],"costing":"auto"}' >/dev/null && echo "VALHALLA OK" || echo "VALHALLA FAIL"
curl -sf "http://127.0.0.1:8080/search?format=json&q=Kyiv&limit=1" >/dev/null && echo "NOMINATIM OK" || echo "NOMINATIM skip (start with: docker compose -f docker-compose.selfhost.yml up -d nominatim)"
set -e

echo "==> Set for backend (self first, remote fallback is automatic):"
echo "SELF_HOST_OSRM_URL=http://127.0.0.1:5050"
echo "REMOTE_OSRM_URL=http://116.204.153.171:5050"
echo "SELF_HOST_VALHALLA_URL=http://127.0.0.1:8002"
echo "REMOTE_VALHALLA_URL=http://valhalla.yapiko.kh.ua"
echo "NOMINATIM_URL=http://127.0.0.1:8080"
