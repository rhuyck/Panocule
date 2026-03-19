import type { Map as MLMap } from 'maplibre-gl';
import type { GeoShape, GeoPoint } from '../types';
import { NS, pxFromEvent, getShapeBBox } from '../render';

type MSMode = 'idle' | 'selecting' | 'moving';

interface MSState {
  mode:          MSMode;
  startX:        number;
  startY:        number;
  selRect:       SVGRectElement | null;
  hoverOverlays: SVGElement[];
  previewIds:    Set<string>;
  dragStartX:    number;
  dragStartY:    number;
  origGeos:      Map<string, GeoPoint[]>;
}

function getShapePoints(shape: GeoShape): GeoPoint[] {
  switch (shape.type) {
    case 'pen':     return shape.points;
    case 'rect':    return shape.corners;
    case 'ellipse': return [shape.center, shape.edgeX, shape.edgeY];
    case 'line':    return [shape.start, shape.end];
  }
}

function setShapePoints(shape: GeoShape, pts: GeoPoint[]): void {
  switch (shape.type) {
    case 'pen':     shape.points  = pts; break;
    case 'rect':    shape.corners = pts as [GeoPoint, GeoPoint, GeoPoint, GeoPoint]; break;
    case 'ellipse': shape.center = pts[0]; shape.edgeX = pts[1]; shape.edgeY = pts[2]; break;
    case 'line':    shape.start  = pts[0]; shape.end   = pts[1]; break;
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function showConfirmDialog(
  n: number,
  onConfirm: () => void,
  onCancel:  () => void,
): void {
  let overlay = document.getElementById('ms-confirm') as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ms-confirm';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <span>Move ${n} shape${n !== 1 ? 's' : ''}?</span>
    <button id="ms-ok">✓</button>
    <button id="ms-cancel">✗</button>
  `;
  overlay.style.display = 'flex';
  document.getElementById('ms-ok')?.addEventListener('click', () => {
    overlay!.style.display = 'none';
    onConfirm();
  }, { once: true });
  document.getElementById('ms-cancel')?.addEventListener('click', () => {
    overlay!.style.display = 'none';
    onCancel();
  }, { once: true });
}

export function createMultiselectTool(
  svg: SVGSVGElement,
  map: MLMap,
  getShapes:      () => GeoShape[],
  getSelectedIds: () => Set<string>,
  setSelectedIds: (ids: Set<string>) => void,
  onRedraw: () => void,
  onSave:   () => void,
) {
  const st: MSState = {
    mode: 'idle', startX: 0, startY: 0,
    selRect: null, hoverOverlays: [], previewIds: new Set(),
    dragStartX: 0, dragStartY: 0, origGeos: new Map(),
  };

  function clearHoverOverlays(): void {
    st.hoverOverlays.forEach(el => el.remove());
    st.hoverOverlays = [];
  }

  function shapesInSelRect(x0: number, y0: number, x1: number, y1: number): Set<string> {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const result = new Set<string>();
    for (const shape of getShapes()) {
      const bbox = getShapeBBox(map, shape);
      if (!bbox) continue;
      const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) result.add(shape.id);
    }
    return result;
  }

  function addHoverOverlay(shape: GeoShape): void {
    const bbox = getShapeBBox(map, shape);
    if (!bbox) return;
    const pad = 4;
    const el = document.createElementNS(NS, 'rect') as SVGRectElement;
    el.setAttribute('x',                String(bbox.x - pad));
    el.setAttribute('y',                String(bbox.y - pad));
    el.setAttribute('width',            String(bbox.w + pad * 2));
    el.setAttribute('height',           String(bbox.h + pad * 2));
    el.setAttribute('fill',             'none');
    el.setAttribute('stroke',           '#ff6b6b');
    el.setAttribute('stroke-width',     '1.5');
    el.setAttribute('stroke-dasharray', '4 2');
    el.setAttribute('pointer-events',   'none');
    svg.appendChild(el);
    st.hoverOverlays.push(el);
  }

  function down(e: PointerEvent): void {
    const { x, y } = pxFromEvent(svg, e);
    const selectedIds = getSelectedIds();

    // If shapes are already selected, check if dragging within them
    if (selectedIds.size > 0) {
      for (const shape of getShapes()) {
        if (!selectedIds.has(shape.id)) continue;
        const bbox = getShapeBBox(map, shape);
        if (!bbox) continue;
        if (x >= bbox.x && x <= bbox.x + bbox.w && y >= bbox.y && y <= bbox.y + bbox.h) {
          st.mode       = 'moving';
          st.dragStartX = x;
          st.dragStartY = y;
          st.origGeos   = new Map();
          for (const s of getShapes()) {
            if (selectedIds.has(s.id)) {
              st.origGeos.set(s.id, getShapePoints(s).map(p => [...p] as GeoPoint));
            }
          }
          return;
        }
      }
    }

    // Start marquee selection
    st.mode    = 'selecting';
    st.startX  = x;
    st.startY  = y;
    const el = document.createElementNS(NS, 'rect') as SVGRectElement;
    el.setAttribute('x',                String(x));
    el.setAttribute('y',                String(y));
    el.setAttribute('width',            '0');
    el.setAttribute('height',           '0');
    el.setAttribute('fill',             'rgba(255,107,107,0.08)');
    el.setAttribute('stroke',           '#ff6b6b');
    el.setAttribute('stroke-width',     '1.5');
    el.setAttribute('stroke-dasharray', '6 3');
    el.setAttribute('pointer-events',   'none');
    svg.appendChild(el);
    st.selRect = el;
    setSelectedIds(new Set());
    onRedraw();
  }

  function move(e: PointerEvent): void {
    const { x, y } = pxFromEvent(svg, e);

    if (st.mode === 'selecting' && st.selRect) {
      st.selRect.setAttribute('x',      String(Math.min(st.startX, x)));
      st.selRect.setAttribute('y',      String(Math.min(st.startY, y)));
      st.selRect.setAttribute('width',  String(Math.abs(x - st.startX)));
      st.selRect.setAttribute('height', String(Math.abs(y - st.startY)));
      const inside = shapesInSelRect(st.startX, st.startY, x, y);
      if (!setsEqual(inside, st.previewIds)) {
        st.previewIds = inside;
        clearHoverOverlays();
        for (const shape of getShapes()) {
          if (inside.has(shape.id)) addHoverOverlay(shape);
        }
      }
    }

    if (st.mode === 'moving') {
      const refLL = map.unproject([st.dragStartX, st.dragStartY]);
      const curLL = map.unproject([x, y]);
      const dlng  = curLL.lng - refLL.lng;
      const dlat  = curLL.lat - refLL.lat;
      for (const shape of getShapes()) {
        const orig = st.origGeos.get(shape.id);
        if (!orig) continue;
        setShapePoints(shape, orig.map((p): GeoPoint => [p[0] + dlng, p[1] + dlat]));
      }
      onRedraw();
    }
  }

  function up(_e: PointerEvent): void {
    if (st.mode === 'selecting') {
      st.selRect?.remove();
      st.selRect = null;
      clearHoverOverlays();
      setSelectedIds(st.previewIds);
      st.previewIds = new Set();
      st.mode = 'idle';
      onRedraw();
    } else if (st.mode === 'moving') {
      st.mode = 'idle';
      const n = getSelectedIds().size;
      showConfirmDialog(n,
        () => { onSave(); onRedraw(); },
        () => {
          // Revert to original positions
          for (const shape of getShapes()) {
            const orig = st.origGeos.get(shape.id);
            if (orig) setShapePoints(shape, orig);
          }
          onRedraw();
        },
      );
    }
  }

  function cancel(): void {
    st.selRect?.remove();
    st.selRect = null;
    clearHoverOverlays();
    st.mode = 'idle';
  }

  return { down, move, up, cancel };
}
