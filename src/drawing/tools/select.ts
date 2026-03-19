import type { Map } from 'maplibre-gl';
import type { GeoShape, GeoPoint } from '../types';
import { NS, pxFromEvent, pxFromGeo, getShapeBBox } from '../render';

type SelectMode = 'idle' | 'dragging' | 'rotating';

interface SelectState {
  mode:     SelectMode;
  shapeId:  string | null;
  // drag
  dragStartX:    number;
  dragStartY:    number;
  origGeoPoints: GeoPoint[];
  // rotation
  rotCenterGeo:  GeoPoint | null;
  rotStartAngle: number;
  rotOrigPts:    GeoPoint[];
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

function hitTest(map: Map, shape: GeoShape, px: number, py: number): boolean {
  const bbox = getShapeBBox(map, shape);
  if (!bbox) return false;
  const pad = 10;
  return px >= bbox.x - pad && px <= bbox.x + bbox.w + pad
      && py >= bbox.y - pad && py <= bbox.y + bbox.h + pad;
}

/** Rotate a geo point around a center using flat-earth approximation (valid at city-block scale). */
function rotateGeo(pt: GeoPoint, center: GeoPoint, angle: number): GeoPoint {
  const cosLat = Math.cos(center[1] * Math.PI / 180);
  const kLng   = 111320 * cosLat; // metres per degree lng
  const kLat   = 111320;          // metres per degree lat
  const dx = (pt[0] - center[0]) * kLng;
  const dy = (pt[1] - center[1]) * kLat;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [
    center[0] + (dx * cos - dy * sin) / kLng,
    center[1] + (dx * sin + dy * cos) / kLat,
  ];
}

export function createSelectTool(
  svg: SVGSVGElement,
  map: Map,
  getShapes:      () => GeoShape[],
  _getSelectedIds: () => Set<string>,
  setSelectedIds:  (ids: Set<string>) => void,
  onRedraw: () => void,
  onSave:   () => void,
) {
  const st: SelectState = {
    mode: 'idle', shapeId: null,
    dragStartX: 0, dragStartY: 0, origGeoPoints: [],
    rotCenterGeo: null, rotStartAngle: 0, rotOrigPts: [],
  };

  // ── Rotation handle rendering ─────────────────────────────────────────────

  function renderHandles(): void {
    if (!st.shapeId) return;
    const shape = getShapes().find(s => s.id === st.shapeId);
    if (!shape) return;
    const bbox = getShapeBBox(map, shape);
    if (!bbox) return;

    const cx     = bbox.x + bbox.w / 2;
    const topY   = bbox.y - 6;   // top edge of selection box (matches renderSelectionBox pad=6)
    const handleY = topY - 28;   // 28 px above selection box

    // Dashed stem
    const stem = document.createElementNS(NS, 'line') as SVGLineElement;
    stem.setAttribute('x1',              String(cx));
    stem.setAttribute('y1',              String(topY));
    stem.setAttribute('x2',              String(cx));
    stem.setAttribute('y2',              String(handleY));
    stem.setAttribute('stroke',          'rgba(255,255,255,0.45)');
    stem.setAttribute('stroke-width',    '1');
    stem.setAttribute('stroke-dasharray','3 2');
    stem.setAttribute('pointer-events',  'none');
    svg.appendChild(stem);

    // Handle circle
    const c = document.createElementNS(NS, 'circle') as SVGCircleElement;
    c.setAttribute('cx',           String(cx));
    c.setAttribute('cy',           String(handleY));
    c.setAttribute('r',            '9');
    c.setAttribute('fill',         'rgba(255,255,255,0.9)');
    c.setAttribute('stroke',       '#333');
    c.setAttribute('stroke-width', '1.5');
    c.setAttribute('cursor',       'grab');
    c.dataset['rotateHandle'] = 'true';
    svg.appendChild(c);

    // Rotation icon
    const t = document.createElementNS(NS, 'text') as SVGTextElement;
    t.setAttribute('x',           String(cx));
    t.setAttribute('y',           String(handleY + 4));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size',   '11');
    t.setAttribute('pointer-events', 'none');
    t.setAttribute('fill',        '#333');
    t.textContent = '↻';
    svg.appendChild(t);
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function down(e: PointerEvent): void {
    const target    = e.target as SVGElement;
    const { x, y } = pxFromEvent(svg, e);

    // Rotation handle click
    if (target.dataset['rotateHandle'] && st.shapeId) {
      const shape = getShapes().find(s => s.id === st.shapeId);
      if (shape) {
        const bbox = getShapeBBox(map, shape);
        if (bbox) {
          const cx = bbox.x + bbox.w / 2;
          const cy = bbox.y + bbox.h / 2;
          const centerLL  = map.unproject([cx, cy]);
          st.rotCenterGeo = [centerLL.lng, centerLL.lat];
          st.rotStartAngle = Math.atan2(y - cy, x - cx);
          st.rotOrigPts    = getShapePoints(shape).map(p => [...p] as GeoPoint);
          st.mode          = 'rotating';
          return;
        }
      }
    }

    // Shape hit-test
    const shapes = getShapes();
    let hit: GeoShape | null = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitTest(map, shapes[i], x, y)) { hit = shapes[i]; break; }
    }
    if (hit) {
      setSelectedIds(new Set([hit.id]));
      st.mode          = 'dragging';
      st.shapeId       = hit.id;
      st.dragStartX    = x;
      st.dragStartY    = y;
      st.origGeoPoints = getShapePoints(hit).map(p => [...p] as GeoPoint);
    } else {
      setSelectedIds(new Set());
      st.mode    = 'idle';
      st.shapeId = null;
    }
    onRedraw();
  }

  function move(e: PointerEvent): void {
    const { x, y } = pxFromEvent(svg, e);

    if (st.mode === 'dragging' && st.shapeId) {
      const refLL  = map.unproject([st.dragStartX, st.dragStartY]);
      const curLL  = map.unproject([x, y]);
      const dlng   = curLL.lng - refLL.lng;
      const dlat   = curLL.lat - refLL.lat;
      const shape  = getShapes().find(s => s.id === st.shapeId);
      if (shape) {
        setShapePoints(shape, st.origGeoPoints.map(([lng, lat]): GeoPoint => [lng + dlng, lat + dlat]));
        onRedraw();
      }
    }

    if (st.mode === 'rotating' && st.shapeId && st.rotCenterGeo) {
      const centerPx    = pxFromGeo(map, st.rotCenterGeo);
      const currentAngle = Math.atan2(y - centerPx.y, x - centerPx.x);
      const delta        = currentAngle - st.rotStartAngle;
      const shape        = getShapes().find(s => s.id === st.shapeId);
      if (shape) {
        setShapePoints(shape, st.rotOrigPts.map(p => rotateGeo(p, st.rotCenterGeo!, delta)));
        onRedraw();
      }
    }
  }

  function up(_e: PointerEvent): void {
    if (st.mode === 'dragging' || st.mode === 'rotating') {
      st.mode = 'idle';
      onSave();
    }
  }

  function cancel(): void {
    if (st.mode === 'dragging' && st.shapeId) {
      const shape = getShapes().find(s => s.id === st.shapeId);
      if (shape) setShapePoints(shape, st.origGeoPoints);
    }
    if (st.mode === 'rotating' && st.shapeId) {
      const shape = getShapes().find(s => s.id === st.shapeId);
      if (shape) setShapePoints(shape, st.rotOrigPts);
    }
    st.mode    = 'idle';
    st.shapeId = null;
    onRedraw();
  }

  return { down, move, up, cancel, renderHandles };
}
