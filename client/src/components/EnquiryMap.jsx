import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Minus, Plus } from 'lucide-react';
import { buildEnquiryMapModel, projectToWorld } from '../utils/enquiryMap.js';

const fromWorld = ({ x, y }, zoom) => {
  const scale = 256 * 2 ** zoom, n = Math.PI - 2 * Math.PI * y / scale;
  return { lat: 180 / Math.PI * Math.atan(Math.sinh(n)), lng: x / scale * 360 - 180 };
};

export default function EnquiryMap({ coordinates, label, address }) {
  const mapRef = useRef(null), drag = useRef(null);
  const [size, setSize] = useState({ width: 640, height: 280 });
  const [center, setCenter] = useState(coordinates);
  const [zoom, setZoom] = useState(14);
  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, Math.round(entry.contentRect.width)), height: Math.max(1, Math.round(entry.contentRect.height)) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const model = useMemo(() => buildEnquiryMapModel(coordinates, center, zoom, size.width, size.height), [coordinates, center, zoom, size]);
  const startDrag = event => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, world: projectToWorld(center, zoom) };
    mapRef.current?.setPointerCapture(event.pointerId);
  };
  const moveDrag = event => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    setCenter(fromWorld({ x: current.world.x - dx, y: current.world.y - dy }, zoom));
  };
  const stopDrag = event => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (mapRef.current?.hasPointerCapture(event.pointerId)) mapRef.current.releasePointerCapture(event.pointerId);
  };
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${coordinates.lat},${coordinates.lng}`)}`;

  if (!model) return <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Saved map coordinates are missing or invalid. No map marker can be shown.</p>;
  return <section className="mt-4" aria-label="Parent selected location">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{label || 'Selected enquiry location'}</h3>{address && <p className="mt-1 text-sm leading-5 text-slate-600">{address}</p>}<p className="mt-1 text-xs text-slate-500">Saved coordinates: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}</p></div><a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 hover:border-[#d7192d] hover:text-[#a91425]">Open in Google Maps</a></div>
    <div ref={mapRef} className="location-map" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} role="application" aria-label="Interactive map centered on the saved parent location. Drag to pan; use the zoom buttons to zoom." tabIndex={0} onKeyDown={event => { if (event.key === '+' || event.key === '=') setZoom(value => Math.min(18, value + 1)); else if (event.key === '-') setZoom(value => Math.max(3, value - 1)); }}>
      {model.tiles.map(tile => <img key={tile.key} className="location-map-tile" src={tile.src} alt="" draggable="false" style={{ left: tile.left, top: tile.top }} loading="lazy"/>)}
      <div className="location-map-pin" aria-label="Saved parent location" style={{ left: model.marker.x, top: model.marker.y }}><MapPin size={36} fill="#f4bd62" stroke="#0c284b" strokeWidth={1.8}/></div>
      <div className="location-map-zoom" onPointerDown={event => event.stopPropagation()}><button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(18, value + 1))}><Plus size={18}/></button><button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(3, value - 1))}><Minus size={18}/></button></div>
      <div className="location-map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={event => event.stopPropagation()}>OpenStreetMap contributors</a></div>
    </div>
  </section>;
}
