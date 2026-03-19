import type { Map } from 'maplibre-gl';
import type { PenShape, ShapeStyle, GeoPoint } from '../types';
import { NS, pxFromEvent, pxFromGeo, geoFromPx } from '../render';

const CLOSE_PX = 16; // pixel radius within which end snaps to start, closing the polygon

interface PenState {
  el:             SVGPolylineElement;
  pts:            GeoPoint[];
  closeIndicator: SVGCircleElement | null;
}

export function createPenTool(svg: SVGSVGElement, map: Map) {
  let state: PenState | null = null;

  function down(e: PointerEvent, style: ShapeStyle): void {
    const { x, y } = pxFromEvent(svg, e);
    const el = document.createElementNS(NS, 'polyline') as SVGPolylineElement;
    el.setAttribute('stroke',          style.strokeColor);
    el.setAttribute('stroke-width',    String(style.strokeWidth));
    el.setAttribute('fill',            'none');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('stroke-linecap',  'round');
    el.setAttribute('points',          `${x},${y}`);
    svg.appendChild(el);
    state = { el, pts: [geoFromPx(map, x, y)], closeIndicator: null };
  }

  function move(e: PointerEvent): void {
    if (!state) return;
    const { x, y } = pxFromEvent(svg, e);
    state.pts.push(geoFromPx(map, x, y));
    const prev = state.el.getAttribute('points') ?? '';
    state.el.setAttribute('points', `${prev} ${x},${y}`);

    // Show/hide close indicator when cursor is near the start point
    if (state.pts.length >= 4) {
      const startPx   = pxFromGeo(map, state.pts[0]);
      const nearStart = Math.hypot(x - startPx.x, y - startPx.y) < CLOSE_PX;
      if (nearStart && !state.closeIndicator) {
        const c = document.createElementNS(NS, 'circle') as SVGCircleElement;
        c.setAttribute('cx',           String(startPx.x));
        c.setAttribute('cy',           String(startPx.y));
        c.setAttribute('r',            '12');
        c.setAttribute('fill',         'none');
        c.setAttribute('stroke',       '#00d4ff');
        c.setAttribute('stroke-width', '2.5');
        c.setAttribute('pointer-events', 'none');
        svg.appendChild(c);
        state.closeIndicator = c;
      } else if (!nearStart && state.closeIndicator) {
        state.closeIndicator.remove();
        state.closeIndicator = null;
      }
    }
  }

  function up(_e: PointerEvent, id: string, style: ShapeStyle): PenShape | null {
    if (!state) return null;
    const pts = state.pts;
    state.el.remove();
    state.closeIndicator?.remove();
    state = null;
    if (pts.length < 2) return null;

    // Auto-close if end is near start
    if (pts.length >= 4) {
      const startPx = pxFromGeo(map, pts[0]);
      const endPx   = pxFromGeo(map, pts[pts.length - 1]);
      if (Math.hypot(endPx.x - startPx.x, endPx.y - startPx.y) < CLOSE_PX) {
        // Trim back to just before the close-approach, return as polygon
        return { id, type: 'pen', points: pts.slice(0, -1), style, closed: true };
      }
    }
    return { id, type: 'pen', points: pts, style };
  }

  function cancel(): void {
    state?.closeIndicator?.remove();
    state?.el.remove();
    state = null;
  }

  return { down, move, up, cancel };
}
