import type { Map } from 'maplibre-gl';
import type { EllipseShape, ShapeStyle } from '../types';
import { NS, pxFromEvent, geoFromPx } from '../render';

interface EllipseState {
  el: SVGEllipseElement;
  cx: number;
  cy: number;
}

export function createEllipseTool(svg: SVGSVGElement, map: Map) {
  let state: EllipseState | null = null;

  function down(e: PointerEvent, style: ShapeStyle): void {
    const { x, y } = pxFromEvent(svg, e);
    const el = document.createElementNS(NS, 'ellipse') as SVGEllipseElement;
    el.setAttribute('cx',           String(x));
    el.setAttribute('cy',           String(y));
    el.setAttribute('rx',           '0');
    el.setAttribute('ry',           '0');
    el.setAttribute('stroke',       style.strokeColor);
    el.setAttribute('stroke-width', String(style.strokeWidth));
    el.setAttribute('fill',         style.fillColor);
    el.setAttribute('fill-opacity', String(style.fillOpacity));
    svg.appendChild(el);
    state = { el, cx: x, cy: y };
  }

  function move(e: PointerEvent, shiftActive: boolean): void {
    if (!state) return;
    const { x, y } = pxFromEvent(svg, e);
    let rx = Math.abs(x - state.cx);
    let ry = Math.abs(y - state.cy);
    if (shiftActive) ry = rx;
    state.el.setAttribute('rx', String(rx));
    state.el.setAttribute('ry', String(ry));
  }

  function up(e: PointerEvent, id: string, style: ShapeStyle, shiftActive: boolean): EllipseShape | null {
    if (!state) return null;
    const { x, y } = pxFromEvent(svg, e);
    let rx = Math.abs(x - state.cx);
    let ry = Math.abs(y - state.cy);
    if (shiftActive) ry = rx;
    const { cx, cy } = state;
    state.el.remove();
    state = null;
    if (rx < 2 || ry < 2) return null;
    return {
      id,
      type:   'ellipse',
      center: geoFromPx(map, cx,      cy),
      edgeX:  geoFromPx(map, cx + rx, cy),
      edgeY:  geoFromPx(map, cx,      cy + ry),
      style,
    };
  }

  function cancel(): void {
    state?.el.remove();
    state = null;
  }

  return { down, move, up, cancel };
}
