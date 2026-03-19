import type { Map } from 'maplibre-gl';
import type { GeoShape, GeoPoint, PenShape } from '../types';
import { NS, pxFromEvent, pxFromGeo, geoFromPx } from '../render';

type VMode = 'idle' | 'dragging';

interface VState {
  mode:     VMode;
  shapeId:  string | null;
  pointIdx: number;
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

export function createVertexTool(
  svg: SVGSVGElement,
  map: Map,
  getShapes:      () => GeoShape[],
  getSelectedIds: () => Set<string>,
  onRedraw: () => void,
  onSave:   () => void,
) {
  const st: VState = { mode: 'idle', shapeId: null, pointIdx: -1 };

  function getHandlesGroup(): SVGGElement {
    return svg.querySelector<SVGGElement>('#vertex-handles')!;
  }

  function renderHandles(shape: GeoShape): void {
    const g = getHandlesGroup();
    if (!g) return;
    g.innerHTML = '';
    const pts = getShapePoints(shape);

    // Midpoint handles — pen, line, and rect (rect will be converted to polygon on insert)
    const isClosed = (shape.type === 'pen' && shape.closed) || shape.type === 'rect';
    const edgeCount = isClosed ? pts.length : pts.length - 1;
    if (shape.type === 'pen' || shape.type === 'line' || shape.type === 'rect') {
      for (let i = 0; i < edgeCount; i++) {
        const p0 = pxFromGeo(map, pts[i]);
        const p1 = pxFromGeo(map, pts[(i + 1) % pts.length]);
        const mid = document.createElementNS(NS, 'circle') as SVGCircleElement;
        mid.setAttribute('cx',           String((p0.x + p1.x) / 2));
        mid.setAttribute('cy',           String((p0.y + p1.y) / 2));
        mid.setAttribute('r',            '5');
        mid.setAttribute('fill',         'rgba(0,150,255,0.55)');
        mid.setAttribute('stroke',       '#00aaff');
        mid.setAttribute('stroke-width', '1.5');
        mid.setAttribute('cursor',       'crosshair');
        mid.dataset['midpointAfter'] = String(i);
        g.appendChild(mid);
      }
    }

    // Vertex handles (on top of midpoints)
    for (let i = 0; i < pts.length; i++) {
      const px = pxFromGeo(map, pts[i]);
      const c = document.createElementNS(NS, 'circle') as SVGCircleElement;
      c.setAttribute('cx',           String(px.x));
      c.setAttribute('cy',           String(px.y));
      c.setAttribute('r',            '6');
      c.setAttribute('fill',         '#ffdd00');
      c.setAttribute('stroke',       '#000');
      c.setAttribute('stroke-width', '1.5');
      c.setAttribute('cursor',       'grab');
      c.dataset['vertexIdx'] = String(i);
      g.appendChild(c);
    }
  }

  function getActiveShape(): GeoShape | undefined {
    const shapes = getShapes();
    const selected = getSelectedIds();
    if (selected.size > 0) {
      return shapes.find(s => selected.has(s.id));
    }
    return shapes[shapes.length - 1];
  }

  function activate(): void {
    const shape = getActiveShape();
    if (!shape) return;
    st.shapeId = shape.id;
    renderHandles(shape);
  }

  function deactivate(): void {
    const g = getHandlesGroup();
    if (g) g.innerHTML = '';
    st.mode    = 'idle';
    st.shapeId = null;
  }

  // Called after every map move / redrawAll so handles stay in sync
  function refreshHandles(): void {
    if (!st.shapeId) return;
    const shape = getShapes().find(s => s.id === st.shapeId);
    if (!shape) return;
    renderHandles(shape);
  }

  function down(e: PointerEvent): void {
    const target = e.target as SVGElement;
    const { x, y } = pxFromEvent(svg, e);

    if (target.dataset['vertexIdx'] !== undefined) {
      st.mode     = 'dragging';
      st.pointIdx = parseInt(target.dataset['vertexIdx']!);
      return;
    }

    if (target.dataset['midpointAfter'] !== undefined) {
      const afterIdx = parseInt(target.dataset['midpointAfter']!);
      let shape      = getShapes().find(s => s.id === st.shapeId);
      if (!shape) return;

      // Convert rect to closed polygon before inserting a vertex
      if (shape.type === 'rect') {
        const penShape: PenShape = {
          id:     shape.id,
          type:   'pen',
          points: [...shape.corners],
          style:  shape.style,
          closed: true,
        };
        const arr = getShapes();
        arr.splice(arr.findIndex(s => s.id === st.shapeId), 1, penShape);
        shape = penShape;
      }

      const pts = getShapePoints(shape);
      const insertAt = (afterIdx + 1) % (pts.length + 1);
      pts.splice(insertAt, 0, geoFromPx(map, x, y));
      setShapePoints(shape, pts);
      st.mode     = 'dragging';
      st.pointIdx = insertAt;
      renderHandles(shape);
      onRedraw();
    }
  }

  function move(e: PointerEvent): void {
    if (st.mode !== 'dragging' || !st.shapeId) return;
    const { x, y } = pxFromEvent(svg, e);
    const shape    = getShapes().find(s => s.id === st.shapeId);
    if (!shape) return;
    const pts = getShapePoints(shape);
    pts[st.pointIdx] = geoFromPx(map, x, y);
    setShapePoints(shape, pts);
    renderHandles(shape);
    onRedraw();
  }

  function up(_e: PointerEvent): void {
    if (st.mode !== 'idle') {
      st.mode = 'idle';
      onSave();
    }
  }

  function cancel(): void {
    st.mode = 'idle';
  }

  function onContextMenu(e: Event): void {
    e.preventDefault();
    const target = (e as MouseEvent).target as SVGElement;
    if (target.dataset['vertexIdx'] === undefined) return;
    const idx   = parseInt(target.dataset['vertexIdx']!);
    const shape = getShapes().find(s => s.id === st.shapeId);
    if (!shape) return;
    const pts    = getShapePoints(shape);
    const minPts = 2;
    if (pts.length <= minPts) {
      const shapes   = getShapes();
      const shapeIdx = shapes.findIndex(s => s.id === st.shapeId);
      if (shapeIdx >= 0) shapes.splice(shapeIdx, 1);
      st.shapeId = null;
      const g = getHandlesGroup();
      if (g) g.innerHTML = '';
    } else {
      pts.splice(idx, 1);
      setShapePoints(shape, pts);
      renderHandles(shape);
    }
    onSave();
    onRedraw();
  }

  return { activate, deactivate, refreshHandles, down, move, up, cancel, onContextMenu };
}
