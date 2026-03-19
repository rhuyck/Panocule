import type { Map } from 'maplibre-gl';
import type { LineShape, ShapeStyle, LineSubtool, GeoShape, GeoPoint } from '../types';
import { NS, pxFromEvent, pxFromGeo, geoFromPx } from '../render';

const SNAP_PX = 14; // pixel radius for node snap

interface LineState {
  el:       SVGLineElement;
  startX:   number;
  startY:   number;
  startGeo: GeoPoint;
}

function snapTo45(sx: number, sy: number, ex: number, ey: number): { x: number; y: number } {
  const dist    = Math.hypot(ex - sx, ey - sy);
  const angle   = Math.atan2(ey - sy, ex - sx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return { x: sx + dist * Math.cos(snapped), y: sy + dist * Math.sin(snapped) };
}

export function createLineTool(svg: SVGSVGElement, map: Map, getShapes: () => GeoShape[]) {
  let state:         LineState          | null = null;
  let snapIndicator: SVGCircleElement   | null = null;
  let currentSnapPt: GeoPoint           | null = null;

  // Find the nearest snappable node (line endpoints + open pen endpoints) within SNAP_PX
  function findSnapPoint(x: number, y: number): GeoPoint | null {
    for (const shape of getShapes()) {
      let candidates: GeoPoint[] = [];
      if (shape.type === 'line') {
        candidates = [shape.start, shape.end];
      } else if (shape.type === 'pen' && !shape.closed && shape.points.length > 0) {
        candidates = [shape.points[0], shape.points[shape.points.length - 1]];
      }
      for (const pt of candidates) {
        const px = pxFromGeo(map, pt);
        if (Math.hypot(px.x - x, px.y - y) < SNAP_PX) return pt;
      }
    }
    return null;
  }

  function updateSnapIndicator(snapPt: GeoPoint | null): void {
    if (snapPt) {
      const px = pxFromGeo(map, snapPt);
      if (!snapIndicator) {
        snapIndicator = document.createElementNS(NS, 'circle') as SVGCircleElement;
        snapIndicator.setAttribute('r',             '10');
        snapIndicator.setAttribute('fill',          'none');
        snapIndicator.setAttribute('stroke',        '#00d4ff');
        snapIndicator.setAttribute('stroke-width',  '2');
        snapIndicator.setAttribute('pointer-events','none');
        svg.appendChild(snapIndicator);
      }
      snapIndicator.setAttribute('cx', String(px.x));
      snapIndicator.setAttribute('cy', String(px.y));
    } else {
      snapIndicator?.remove();
      snapIndicator = null;
    }
  }

  function clearSnap(): void {
    snapIndicator?.remove();
    snapIndicator  = null;
    currentSnapPt  = null;
  }

  function down(e: PointerEvent, style: ShapeStyle, subtype: LineSubtool): void {
    const { x, y } = pxFromEvent(svg, e);
    // Snap start point
    const snapPt   = findSnapPoint(x, y);
    const startGeo = snapPt ?? geoFromPx(map, x, y);
    const startPx  = snapPt ? pxFromGeo(map, snapPt) : { x, y };

    const el = document.createElementNS(NS, 'line') as SVGLineElement;
    el.setAttribute('x1', String(startPx.x));
    el.setAttribute('y1', String(startPx.y));
    el.setAttribute('x2', String(startPx.x));
    el.setAttribute('y2', String(startPx.y));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('fill', 'none');
    if (subtype === 'leader') {
      el.setAttribute('stroke',        '#e63946');
      el.setAttribute('stroke-width',  '2');
      el.setAttribute('marker-start',  'url(#marker-dot)');
      el.setAttribute('marker-end',    'url(#marker-arrow)');
    } else {
      el.setAttribute('stroke',       style.strokeColor);
      el.setAttribute('stroke-width', String(style.strokeWidth));
      if (subtype === 'dashed') el.setAttribute('stroke-dasharray', '8 4');
    }
    svg.appendChild(el);
    state = { el, startX: startPx.x, startY: startPx.y, startGeo };
    currentSnapPt = null;
  }

  function move(e: PointerEvent, shiftActive: boolean): void {
    if (!state) return;
    let { x, y } = pxFromEvent(svg, e);
    if (shiftActive) ({ x, y } = snapTo45(state.startX, state.startY, x, y));

    currentSnapPt = findSnapPoint(x, y);
    updateSnapIndicator(currentSnapPt);

    const ex = currentSnapPt ? pxFromGeo(map, currentSnapPt).x : x;
    const ey = currentSnapPt ? pxFromGeo(map, currentSnapPt).y : y;
    state.el.setAttribute('x2', String(ex));
    state.el.setAttribute('y2', String(ey));
  }

  function up(
    e: PointerEvent,
    id: string,
    style: ShapeStyle,
    subtype: LineSubtool,
    shiftActive: boolean,
  ): LineShape | null {
    if (!state) return null;
    clearSnap();

    let ex: number, ey: number, endGeo: GeoPoint;
    if (currentSnapPt) {
      const px = pxFromGeo(map, currentSnapPt);
      ex = px.x; ey = px.y;
      endGeo = currentSnapPt;
    } else {
      let { x, y } = pxFromEvent(svg, e);
      if (shiftActive) ({ x, y } = snapTo45(state.startX, state.startY, x, y));
      ex = x; ey = y;
      endGeo = geoFromPx(map, x, y);
    }

    const tooSmall = Math.hypot(ex - state.startX, ey - state.startY) < 4;
    const startGeo = state.startGeo;
    state.el.remove();
    state         = null;
    currentSnapPt = null;
    if (tooSmall) return null;

    const effectiveStyle = subtype === 'leader'
      ? { ...style, strokeColor: '#e63946', strokeWidth: 2 }
      : style;
    return { id, type: 'line', subtype, start: startGeo, end: endGeo, style: effectiveStyle };
  }

  function cancel(): void {
    state?.el.remove();
    state = null;
    clearSnap();
  }

  return { down, move, up, cancel };
}
