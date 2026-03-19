import type { Map, LngLatLike } from 'maplibre-gl';
import type { GeoShape, GeoPoint } from './types';

export const NS = 'http://www.w3.org/2000/svg';

// ── Coordinate helpers ────────────────────────────────────────────────────────

export function pxFromGeo(map: Map, geo: GeoPoint): { x: number; y: number } {
  return map.project(geo as LngLatLike);
}

export function geoFromPx(map: Map, x: number, y: number): GeoPoint {
  const ll = map.unproject([x, y]);
  return [ll.lng, ll.lat];
}

export function pxFromEvent(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ── Bounding box ──────────────────────────────────────────────────────────────

export interface BBox { x: number; y: number; w: number; h: number; }

export function getShapeBBox(map: Map, shape: GeoShape): BBox | null {
  let pts: { x: number; y: number }[] = [];

  switch (shape.type) {
    case 'pen':
      pts = shape.points.map(g => pxFromGeo(map, g));
      if (shape.controlPts) {
        for (const cp of shape.controlPts) {
          if (cp) pts.push(pxFromGeo(map, cp));
        }
      }
      break;
    case 'rect':
      pts = shape.corners.map(g => pxFromGeo(map, g));
      break;
    case 'ellipse': {
      const cp = pxFromGeo(map, shape.center);
      const ex = pxFromGeo(map, shape.edgeX);
      const ey = pxFromGeo(map, shape.edgeY);
      const rx = Math.hypot(ex.x - cp.x, ex.y - cp.y);
      const ry = Math.hypot(ey.x - cp.x, ey.y - cp.y);
      pts = [
        { x: cp.x - rx, y: cp.y - ry },
        { x: cp.x + rx, y: cp.y + ry },
      ];
      break;
    }
    case 'line':
      pts = [pxFromGeo(map, shape.start), pxFromGeo(map, shape.end)];
      if (shape.controlPt) pts.push(pxFromGeo(map, shape.controlPt));
      break;
  }

  if (!pts.length) return null;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

// ── SVG defs (markers) ────────────────────────────────────────────────────────

export function initSvgDefs(svg: SVGSVGElement): void {
  svg.querySelector('defs')?.remove();
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <marker id="marker-dot" markerWidth="8" markerHeight="8" refX="4" refY="4">
      <circle cx="4" cy="4" r="3" fill="#e63946"/>
    </marker>
    <marker id="marker-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
      <path d="M0,0 L0,10 L10,5 Z" fill="#e63946"/>
    </marker>
  `;
  svg.insertBefore(defs, svg.firstChild);
}

// ── Shape rendering ───────────────────────────────────────────────────────────

function renderSelectionBox(svg: SVGSVGElement, map: Map, shape: GeoShape): void {
  const bbox = getShapeBBox(map, shape);
  if (!bbox) return;
  const pad = 6;
  const el = document.createElementNS(NS, 'rect') as SVGRectElement;
  el.setAttribute('x',      String(bbox.x - pad));
  el.setAttribute('y',      String(bbox.y - pad));
  el.setAttribute('width',  String(bbox.w + pad * 2));
  el.setAttribute('height', String(bbox.h + pad * 2));
  el.setAttribute('fill',             'none');
  el.setAttribute('stroke',          '#00d4ff');
  el.setAttribute('stroke-width',    '1.5');
  el.setAttribute('stroke-dasharray','6 3');
  el.setAttribute('pointer-events',  'none');
  svg.appendChild(el);
}

export function renderShape(
  svg: SVGSVGElement,
  map: Map,
  shape: GeoShape,
  isSelected = false,
): void {
  const s = shape.style;

  switch (shape.type) {
    case 'pen': {
      if (shape.points.length < 2) return;
      const hasCtrl = shape.controlPts?.some(cp => cp != null) ?? false;
      if (hasCtrl) {
        const n = shape.points.length;
        const pxs = shape.points.map(g => pxFromGeo(map, g));
        const isClosed = shape.closed && n >= 3;
        const edgeCount = isClosed ? n : n - 1;
        let d = `M ${pxs[0].x},${pxs[0].y}`;
        for (let i = 0; i < edgeCount; i++) {
          const p1   = pxs[(i + 1) % n];
          const ctrl = shape.controlPts?.[i];
          if (ctrl) {
            const cp = pxFromGeo(map, ctrl);
            d += ` Q ${cp.x},${cp.y} ${p1.x},${p1.y}`;
          } else {
            d += ` L ${p1.x},${p1.y}`;
          }
        }
        if (isClosed) d += ' Z';
        const el = document.createElementNS(NS, 'path') as SVGPathElement;
        el.setAttribute('d',               d);
        el.setAttribute('stroke',          s.strokeColor);
        el.setAttribute('stroke-width',    String(s.strokeWidth));
        el.setAttribute('stroke-linejoin', 'round');
        el.setAttribute('stroke-linecap',  'round');
        el.setAttribute('fill',            isClosed ? s.fillColor : 'none');
        if (isClosed) el.setAttribute('fill-opacity', String(s.fillOpacity));
        if (s.strokeDash) el.setAttribute('stroke-dasharray', s.strokeDash);
        el.dataset['shapeId'] = shape.id;
        svg.appendChild(el);
      } else {
        const ptsStr = shape.points
          .map(g => { const p = pxFromGeo(map, g); return `${p.x},${p.y}`; })
          .join(' ');
        if (shape.closed && shape.points.length >= 3) {
          const el = document.createElementNS(NS, 'polygon') as SVGPolygonElement;
          el.setAttribute('points',          ptsStr);
          el.setAttribute('stroke',          s.strokeColor);
          el.setAttribute('stroke-width',    String(s.strokeWidth));
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('fill',            s.fillColor);
          el.setAttribute('fill-opacity',    String(s.fillOpacity));
          if (s.strokeDash) el.setAttribute('stroke-dasharray', s.strokeDash);
          el.dataset['shapeId'] = shape.id;
          svg.appendChild(el);
        } else {
          const el = document.createElementNS(NS, 'polyline') as SVGPolylineElement;
          el.setAttribute('points',          ptsStr);
          el.setAttribute('stroke',          s.strokeColor);
          el.setAttribute('stroke-width',    String(s.strokeWidth));
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('stroke-linecap',  'round');
          el.setAttribute('fill',            'none');
          if (s.strokeDash) el.setAttribute('stroke-dasharray', s.strokeDash);
          el.dataset['shapeId'] = shape.id;
          svg.appendChild(el);
        }
      }
      break;
    }

    case 'rect': {
      // Project all 4 geo corners to current screen pixels and render as a polygon.
      // Using SVGPolygonElement (not SVGRectElement) means rotation is preserved
      // correctly: the 4 corners rotate in geo space and are re-projected each frame.
      const pxs = shape.corners.map(g => pxFromGeo(map, g));
      const pts = pxs.map(p => `${p.x},${p.y}`).join(' ');
      const el = document.createElementNS(NS, 'polygon') as SVGPolygonElement;
      el.setAttribute('points',          pts);
      el.setAttribute('stroke',          s.strokeColor);
      el.setAttribute('stroke-width',    String(s.strokeWidth));
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('fill',            s.fillColor);
      el.setAttribute('fill-opacity',    String(s.fillOpacity));
      if (s.strokeDash) el.setAttribute('stroke-dasharray', s.strokeDash);
      el.dataset['shapeId'] = shape.id;
      svg.appendChild(el);
      break;
    }

    case 'ellipse': {
      const cp   = pxFromGeo(map, shape.center);
      const exPx = pxFromGeo(map, shape.edgeX);
      const eyPx = pxFromGeo(map, shape.edgeY);
      const rx   = Math.hypot(exPx.x - cp.x, exPx.y - cp.y);
      const ry   = Math.hypot(eyPx.x - cp.x, eyPx.y - cp.y);
      if (rx < 1 || ry < 1) return;
      // Derive rotation from the screen-space direction to edgeX so the ellipse
      // follows its geo-rotated orientation correctly.
      const angleDeg = Math.atan2(exPx.y - cp.y, exPx.x - cp.x) * (180 / Math.PI);
      const el = document.createElementNS(NS, 'ellipse') as SVGEllipseElement;
      el.setAttribute('cx',           String(cp.x));
      el.setAttribute('cy',           String(cp.y));
      el.setAttribute('rx',           String(rx));
      el.setAttribute('ry',           String(ry));
      el.setAttribute('transform',    `rotate(${angleDeg} ${cp.x} ${cp.y})`);
      el.setAttribute('stroke',       s.strokeColor);
      el.setAttribute('stroke-width', String(s.strokeWidth));
      el.setAttribute('fill',         s.fillColor);
      el.setAttribute('fill-opacity', String(s.fillOpacity));
      if (s.strokeDash) el.setAttribute('stroke-dasharray', s.strokeDash);
      el.dataset['shapeId'] = shape.id;
      svg.appendChild(el);
      break;
    }

    case 'line': {
      const sp  = pxFromGeo(map, shape.start);
      const ep  = pxFromGeo(map, shape.end);
      let el: SVGElement;
      if (shape.controlPt) {
        const cp   = pxFromGeo(map, shape.controlPt);
        const path = document.createElementNS(NS, 'path') as SVGPathElement;
        path.setAttribute('d',              `M ${sp.x},${sp.y} Q ${cp.x},${cp.y} ${ep.x},${ep.y}`);
        path.setAttribute('fill',           'none');
        path.setAttribute('stroke-linecap', 'round');
        el = path;
      } else {
        const line = document.createElementNS(NS, 'line') as SVGLineElement;
        line.setAttribute('x1',             String(sp.x));
        line.setAttribute('y1',             String(sp.y));
        line.setAttribute('x2',             String(ep.x));
        line.setAttribute('y2',             String(ep.y));
        line.setAttribute('stroke-linecap', 'round');
        el = line;
      }
      if (shape.subtype === 'leader') {
        el.setAttribute('stroke',       '#e63946');
        el.setAttribute('stroke-width', '2');
        el.setAttribute('marker-start', 'url(#marker-dot)');
        el.setAttribute('marker-end',   'url(#marker-arrow)');
      } else {
        el.setAttribute('stroke',       s.strokeColor);
        el.setAttribute('stroke-width', String(s.strokeWidth));
        if (shape.subtype === 'dashed') {
          el.setAttribute('stroke-dasharray', '8 4');
        } else if (s.strokeDash) {
          el.setAttribute('stroke-dasharray', s.strokeDash);
        }
      }
      el.dataset['shapeId'] = shape.id;
      svg.appendChild(el);
      break;
    }
  }

  if (isSelected) renderSelectionBox(svg, map, shape);
}

// ── Full redraw ───────────────────────────────────────────────────────────────

export function redrawAll(
  svg: SVGSVGElement,
  map: Map,
  shapes: GeoShape[],
  selectedIds: Set<string> = new Set(),
): void {
  // Preserve <defs> and #vertex-handles across full redraws
  const defs     = svg.querySelector('defs');
  const vHandles = svg.querySelector<SVGGElement>('#vertex-handles');

  svg.innerHTML = '';

  if (defs) svg.appendChild(defs);

  for (const s of shapes) renderShape(svg, map, s, selectedIds.has(s.id));

  // Re-attach vertex handles group (cleared so vertex tool can repopulate)
  if (vHandles) {
    vHandles.innerHTML = '';
    svg.appendChild(vHandles);
  } else {
    const g = document.createElementNS(NS, 'g');
    g.id = 'vertex-handles';
    svg.appendChild(g);
  }
}
