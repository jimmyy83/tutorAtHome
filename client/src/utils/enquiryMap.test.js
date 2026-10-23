import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnquiryMapModel, validCoordinates } from './enquiryMap.js';

test('saved coordinates accept valid numeric values and reject missing or out-of-range values', () => {
  assert.deepEqual(validCoordinates('25.995', '80.0'), { lat: 25.995, lng: 80 });
  assert.equal(validCoordinates(undefined, undefined), null);
  assert.equal(validCoordinates('', ''), null);
  assert.equal(validCoordinates(90.01, 80), null);
  assert.equal(validCoordinates(25, -180.01), null);
});

test('enquiry map model places its marker at the saved coordinates and uses OSM tiles', () => {
  const coordinates = { lat: 25.995, lng: 80.0 };
  const model = buildEnquiryMapModel(coordinates, coordinates, 14, 640, 280);
  assert.deepEqual(model.marker, { x: 320, y: 140 });
  assert.ok(model.tiles.length > 0);
  assert.ok(model.tiles.every(tile => tile.src.startsWith('https://tile.openstreetmap.org/14/')));
  assert.equal(buildEnquiryMapModel(null, coordinates, 14, 640, 280), null);
});
