import type { Map } from 'maplibre-gl';
import type { RectShape, ShapeStyle, GeoPoint } from '../types';
import { NS, pxFromEvent, geoFromPx } from '../render';

interface RectState {
  el:     SVGRectElement;
  startX: number;
  startY: number;
}

export function createRectTool(svg: SVGSVGElement, map: Map) {
  let state: RectState | null = null;

  function down(e: PointerEvent, style: ShapeStyle): void {
    const { x, y } = pxFromEvent(svg, e);
    const el = document.createElementNS(NS, 'rect') as SVGRectElement;
    el.setAttribute('x',            String(x));
    el.setAttribute('y',            String(y));
    el.setAttribute('width',        '0');
    el.setAttribute('height',       '0');
    el.setAttribute('stroke',       style.strokeColor);
    el.setAttribute('stroke-width', String(style.strokeWidth));
    el.setAttribute('fill',         style.fillColor);
    el.setAttribute('fill-opacity', String(style.fillOpacity));
    svg.appendChild(el);
    state = { el, startX: x, startY: y };
  }

  function move(e: PointerEvent, shiftActive: boolean): void {
    if (!state) return;
    const { x, y } = pxFromEvent(svg, e);
    let dx = x - state.startX;
    let dy = y - state.startY;
    if (shiftActive) {
      const side = Math.min(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx) * side;
      dy = Math.sign(dy) * side;
    }
    state.el.setAttribute('x',      String(Math.min(state.startX, state.startX + dx)));
    state.el.setAttribute('y',      String(Math.min(state.startY, state.startY + dy)));
    state.el.setAttribute('width',  String(Math.abs(dx)));
    state.el.setAttribute('height', String(Math.abs(dy)));
  }

  function up(e: PointerEvent, id: string, style: ShapeStyle, shiftActive: boolean): RectShape | null {
    if (!state) return null;
    const { x, y } = pxFromEvent(svg, e);
    let dx = x - state.startX;
    let dy = y - state.startY;
    if (shiftActive) {
      const side = Math.min(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx) * side;
      dy = Math.sign(dy) * side;
    }
    const x0 = state.startX, y0 = state.startY;
    const x1 = x0 + dx,      y1 = y0 + dy;
    state.el.remove();
    state = null;
    if (Math.abs(dx) < 2 || Math.abs(dy) < 2) return null;
    const corners: [GeoPoint, GeoPoint, GeoPoint, GeoPoint] = [
      geoFromPx(map, Math.min(x0, x1), Math.min(y0, y1)), // NW
      geoFromPx(map, Math.max(x0, x1), Math.min(y0, y1)), // NE
      geoFromPx(map, Math.max(x0, x1), Math.max(y0, y1)), // SE
      geoFromPx(map, Math.min(x0, x1), Math.max(y0, y1)), // SW
    ];
    return { id, type: 'rect', corners, style };
  }

  function cancel(): void {
    state?.el.remove();
    state = null;
  }

  return { down, move, up, cancel };
}
