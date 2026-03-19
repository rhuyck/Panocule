/**
 * SVG drawing overlay — tools: pen (freehand), rect, circle.
 *
 * Shapes are stored as geographic coordinates [longitude, latitude] rather
 * than screen pixels. On every map move/zoom/resize the overlay is redrawn
 * by projecting the stored geo coords back to current screen pixels, so
 * drawings stay pinned to the map as the user pans and zooms.
 *
 * Storage: GeoShape[] serialised as JSON under STORAGE_KEY in localStorage.
 */

import type { Map, LngLatLike } from 'maplibre-gl';

export type ToolName = 'none' | 'pen' | 'rect' | 'circle';

// ── Geo shape types ───────────────────────────────────────────────────────────

/** [longitude, latitude] */
type GeoPoint = [number, number];

interface PenShape    { type: 'pen';    points: GeoPoint[]; }
interface RectShape   { type: 'rect';   corners: [GeoPoint, GeoPoint, GeoPoint, GeoPoint]; }
interface CircleShape { type: 'circle'; center: GeoPoint; edge: GeoPoint; }

export type GeoShape = PenShape | RectShape | CircleShape;

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'drawing-geo-shapes-v2';
const NS           = 'http://www.w3.org/2000/svg';
const STROKE_COLOR = '#ff6b6b';
const STROKE_WIDTH = 2;
const FILL_SHAPE   = 'rgba(255,107,107,0.12)';

// ── Persistence ───────────────────────────────────────────────────────────────

function saveShapes(shapes: GeoShape[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shapes));
}

function loadShapes(): GeoShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GeoShape[]) : [];
  } catch {
    return [];
  }
}

// ── SVG element helpers ───────────────────────────────────────────────────────

function applyBaseStyle(el: SVGElement): void {
  el.setAttribute('stroke', STROKE_COLOR);
  el.setAttribute('stroke-width', String(STROKE_WIDTH));
  el.setAttribute('fill', 'none');
}

function makePoly(): SVGPolylineElement {
  const el = document.createElementNS(NS, 'polyline') as SVGPolylineElement;
  applyBaseStyle(el);
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('stroke-linecap', 'round');
  return el;
}

function makeRect(): SVGRectElement {
  const el = document.createElementNS(NS, 'rect') as SVGRectElement;
  applyBaseStyle(el);
  el.setAttribute('fill', FILL_SHAPE);
  return el;
}

function makeCircle(): SVGCircleElement {
  const el = document.createElementNS(NS, 'circle') as SVGCircleElement;
  applyBaseStyle(el);
  el.setAttribute('fill', FILL_SHAPE);
  return el;
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function pxFromEvent(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function geoFromPx(map: Map, x: number, y: number): GeoPoint {
  const ll = map.unproject([x, y]);
  return [ll.lng, ll.lat];
}

function pxFromGeo(map: Map, geo: GeoPoint): { x: number; y: number } {
  return map.project(geo as LngLatLike);
}

// ── Render committed shapes from geo coords ───────────────────────────────────

function renderShape(svg: SVGSVGElement, map: Map, shape: GeoShape): void {
  switch (shape.type) {
    case 'pen': {
      if (shape.points.length < 2) return;
      const pts = shape.points
        .map(g => { const p = pxFromGeo(map, g); return `${p.x},${p.y}`; })
        .join(' ');
      const el = makePoly();
      el.setAttribute('points', pts);
      svg.appendChild(el);
      break;
    }
    case 'rect': {
      const pxs = shape.corners.map(g => pxFromGeo(map, g));
      const xs = pxs.map(p => p.x);
      const ys = pxs.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x,  h = Math.max(...ys) - y;
      if (w < 1 || h < 1) return;
      const el = makeRect();
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('width',  String(w));
      el.setAttribute('height', String(h));
      svg.appendChild(el);
      break;
    }
    case 'circle': {
      const cp = pxFromGeo(map, shape.center);
      const ep = pxFromGeo(map, shape.edge);
      const r  = Math.hypot(ep.x - cp.x, ep.y - cp.y);
      if (r < 1) return;
      const el = makeCircle();
      el.setAttribute('cx', String(cp.x));
      el.setAttribute('cy', String(cp.y));
      el.setAttribute('r',  String(r));
      svg.appendChild(el);
      break;
    }
  }
}

function redrawAll(svg: SVGSVGElement, map: Map, shapes: GeoShape[]): void {
  svg.innerHTML = '';
  for (const s of shapes) renderShape(svg, map, s);
}

// ── Active-draw state (screen pixels during gesture, converted on commit) ─────

interface ActiveDraw {
  element: SVGElement;
  startX: number;
  startY: number;
  startGeo: GeoPoint;
  geoPoints?: GeoPoint[]; // accumulated for pen tool
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DrawingController {
  setTool(tool: ToolName): void;
  clearAll(): void;
}

export function createDrawingController(svg: SVGSVGElement, map: Map): DrawingController {
  let activeTool: ToolName = 'none';
  let active: ActiveDraw | null = null;
  const shapes: GeoShape[] = loadShapes();

  // Initial render once the map canvas is ready
  map.once('load', () => redrawAll(svg, map, shapes));

  // Re-project all stored shapes to current screen pixels on every camera change
  map.on('move',   () => { if (!active) redrawAll(svg, map, shapes); });
  map.on('resize', () => { if (!active) redrawAll(svg, map, shapes); });

  function setOverlayInteractive(on: boolean): void {
    svg.classList.toggle('drawing', on);
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    if (activeTool === 'none') return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);

    const { x, y } = pxFromEvent(svg, e);
    const geo = geoFromPx(map, x, y);

    switch (activeTool) {
      case 'pen': {
        const el = makePoly();
        el.setAttribute('points', `${x},${y}`);
        svg.appendChild(el);
        active = { element: el, startX: x, startY: y, startGeo: geo, geoPoints: [geo] };
        break;
      }
      case 'rect': {
        const el = makeRect();
        el.setAttribute('x', String(x));
        el.setAttribute('y', String(y));
        el.setAttribute('width', '0');
        el.setAttribute('height', '0');
        svg.appendChild(el);
        active = { element: el, startX: x, startY: y, startGeo: geo };
        break;
      }
      case 'circle': {
        const el = makeCircle();
        el.setAttribute('cx', String(x));
        el.setAttribute('cy', String(y));
        el.setAttribute('r', '0');
        svg.appendChild(el);
        active = { element: el, startX: x, startY: y, startGeo: geo };
        break;
      }
    }
  });

  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!active) return;
    const { x, y } = pxFromEvent(svg, e);

    switch (activeTool) {
      case 'pen': {
        // Accumulate geo point; append pixel directly to the live element for
        // performance (no need to re-project the whole path on every mousemove).
        active.geoPoints!.push(geoFromPx(map, x, y));
        const prev = active.element.getAttribute('points') ?? '';
        active.element.setAttribute('points', `${prev} ${x},${y}`);
        break;
      }
      case 'rect': {
        const rx = Math.min(x, active.startX);
        const ry = Math.min(y, active.startY);
        active.element.setAttribute('x', String(rx));
        active.element.setAttribute('y', String(ry));
        active.element.setAttribute('width',  String(Math.abs(x - active.startX)));
        active.element.setAttribute('height', String(Math.abs(y - active.startY)));
        break;
      }
      case 'circle': {
        active.element.setAttribute('r', String(Math.hypot(x - active.startX, y - active.startY)));
        break;
      }
    }
  });

  svg.addEventListener('pointerup', (e: PointerEvent) => {
    if (!active) return;
    const { x, y } = pxFromEvent(svg, e);
    let shape: GeoShape | null = null;

    switch (activeTool) {
      case 'pen': {
        if (active.geoPoints && active.geoPoints.length >= 2) {
          shape = { type: 'pen', points: active.geoPoints };
        }
        break;
      }
      case 'rect': {
        const x0 = active.startX, y0 = active.startY;
        const x1 = x,            y1 = y;
        // Store all 4 pixel corners converted to geo so the rect survives
        // reprojection at any zoom / pitch without distortion at city-block scale.
        const corners: [GeoPoint, GeoPoint, GeoPoint, GeoPoint] = [
          geoFromPx(map, Math.min(x0, x1), Math.min(y0, y1)), // NW
          geoFromPx(map, Math.max(x0, x1), Math.min(y0, y1)), // NE
          geoFromPx(map, Math.max(x0, x1), Math.max(y0, y1)), // SE
          geoFromPx(map, Math.min(x0, x1), Math.max(y0, y1)), // SW
        ];
        shape = { type: 'rect', corners };
        break;
      }
      case 'circle': {
        // Store center + one point on the circumference; pixel radius is
        // recomputed dynamically from the projected distance between the two.
        shape = { type: 'circle', center: active.startGeo, edge: geoFromPx(map, x, y) };
        break;
      }
    }

    active = null;
    if (shape) {
      shapes.push(shape);
      saveShapes(shapes);
    }
    redrawAll(svg, map, shapes);
  });

  svg.addEventListener('pointercancel', () => {
    if (!active) return;
    active.element.remove();
    active = null;
    redrawAll(svg, map, shapes);
  });

  // ── Controller ────────────────────────────────────────────────────────────

  return {
    setTool(tool: ToolName) {
      activeTool = tool;
      setOverlayInteractive(tool !== 'none');
    },

    clearAll() {
      shapes.length = 0;
      localStorage.removeItem(STORAGE_KEY);
      redrawAll(svg, map, shapes);
    },
  };
}
