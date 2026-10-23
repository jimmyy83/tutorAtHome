const TILE_SIZE = 256;

export function validCoordinates(latitude, longitude) {
  if (latitude === null || latitude === undefined || String(latitude).trim() === '' || longitude === null || longitude === undefined || String(longitude).trim() === '') return null;
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function projectToWorld({ lat, lng }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin(clampedLat * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * scale,
    y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

const wrap = (value, range) => ((value % range) + range) % range;

export function buildEnquiryMapModel(coordinates, center, zoom, width, height) {
  const saved = validCoordinates(coordinates?.lat, coordinates?.lng);
  if (!saved || !validCoordinates(center?.lat, center?.lng)) return null;
  const centerWorld = projectToWorld(center, zoom), savedWorld = projectToWorld(saved, zoom);
  const left = centerWorld.x - width / 2, top = centerWorld.y - height / 2, tileCount = 2 ** zoom;
  const firstX = Math.floor(left / TILE_SIZE) - 1, lastX = Math.floor((left + width) / TILE_SIZE) + 1;
  const firstY = Math.floor(top / TILE_SIZE) - 1, lastY = Math.floor((top + height) / TILE_SIZE) + 1;
  const tiles = [];
  for (let y = firstY; y <= lastY; y += 1) {
    if (y < 0 || y >= tileCount) continue;
    for (let x = firstX; x <= lastX; x += 1) {
      const wrappedX = wrap(x, tileCount);
      tiles.push({
        key: `${zoom}-${wrappedX}-${y}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - left,
        top: y * TILE_SIZE - top,
      });
    }
  }
  const wrappedDeltaX = ((savedWorld.x - centerWorld.x + TILE_SIZE * tileCount / 2) % (TILE_SIZE * tileCount) + TILE_SIZE * tileCount) % (TILE_SIZE * tileCount) - TILE_SIZE * tileCount / 2;
  return {
    tiles,
    marker: { x: width / 2 + wrappedDeltaX, y: height / 2 + savedWorld.y - centerWorld.y },
    centerWorld,
  };
}
