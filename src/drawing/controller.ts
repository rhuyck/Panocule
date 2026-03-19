import type { Map } from 'maplibre-gl';
import type { GeoShape, GeoPoint, ShapeStyle, ToolName, LineSubtool, LineShape, PenShape } from './types';
import { DEFAULT_STYLE } from './types';
import { loadShapes, saveShapes, clearShapes, loadActiveStyle, saveActiveStyle } from './store';
import { NS, initSvgDefs, redrawAll } from './render';
import { createRectTool }        from './tools/rect';
import { createEllipseTool }     from './tools/ellipse';
import { createLineTool }        from './tools/line';
import { createSelectTool }      from './tools/select';
import { createMultiselectTool } from './tools/multiselect';
import { createVertexTool }      from './tools/vertex';

export type { ToolName };

export interface DrawingController {
  setTool(tool: ToolName): void;
  clearAll(): void;
  deleteSelected(): void;
  setVisible(visible: boolean): void;
}

export function createDrawingController(svg: SVGSVGElement, map: Map): DrawingController {
  const shapes: GeoShape[]     = loadShapes();
  const selectedIds              = new Set<string>();
  let   activeTool: ToolName    = 'none';
  let   lineSubtool: LineSubtool = 'basic';
  let   shiftActive              = false;
  let   activeStyle: ShapeStyle  = loadActiveStyle() ?? { ...DEFAULT_STYLE };

  // ── Init SVG ─────────────────────────────────────────────────────────────

  initSvgDefs(svg);
  const vg = document.createElementNS(NS, 'g');
  vg.id = 'vertex-handles';
  svg.appendChild(vg);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function save(): void { saveShapes(shapes); }

  function redraw(): void {
    redrawAll(svg, map, shapes, selectedIds);
    if (activeTool === 'vertex') vertexTool.refreshHandles();
    if (activeTool === 'select' && selectedIds.size === 1) selectTool.renderHandles();
    updatePropsPanel();
  }

  function commitShape(shape: GeoShape | null): void {
    if (shape) {
      shapes.push(shape);
      if (shape.type === 'line') mergeClosedLoopIfAny(shape);
      save();
    }
    redraw();
  }

  // ── Closed-loop detection: merge connected line segments into a polygon ───

  function mergeClosedLoopIfAny(newLine: LineShape): void {
    const EPS = 1e-10;
    function eq(a: GeoPoint, b: GeoPoint): boolean {
      return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
    }

    const lines = shapes.filter(s => s.type === 'line') as LineShape[];
    const path: LineShape[] = [newLine];
    const visited = new Set<string>([newLine.id]);

    function dfs(cur: GeoPoint): boolean {
      if (eq(cur, newLine.start)) return path.length > 1; // need ≥ 2 segments
      if (path.length >= 50) return false;
      for (const l of lines) {
        if (visited.has(l.id)) continue;
        let next: GeoPoint | null = null;
        if (eq(cur, l.start)) next = l.end;
        else if (eq(cur, l.end)) next = l.start;
        if (next) {
          visited.add(l.id); path.push(l);
          if (dfs(next)) return true;
          path.pop(); visited.delete(l.id);
        }
      }
      return false;
    }

    if (!dfs(newLine.end)) return;

    // Build polygon vertices by walking the path in order
    const pts: GeoPoint[] = [];
    let cur: GeoPoint = newLine.start;
    for (const l of path) {
      if (eq(cur, l.start)) { pts.push(l.start); cur = l.end; }
      else                   { pts.push(l.end);   cur = l.start; }
    }

    // Remove all lines in the loop and replace with a closed polygon
    const loopIds = new Set(path.map(l => l.id));
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (loopIds.has(shapes[i].id)) shapes.splice(i, 1);
    }
    const polygon: PenShape = {
      id: crypto.randomUUID(),
      type: 'pen', points: pts, style: newLine.style, closed: true,
    };
    shapes.push(polygon);
  }

  // ── Tool instances ────────────────────────────────────────────────────────

  const rectTool    = createRectTool(svg, map);
  const ellipseTool = createEllipseTool(svg, map);
  const lineTool    = createLineTool(svg, map, () => shapes);

  const selectTool = createSelectTool(
    svg, map,
    () => shapes,
    () => selectedIds,
    (ids) => { selectedIds.clear(); ids.forEach(id => selectedIds.add(id)); },
    () => redraw(),
    () => { save(); redraw(); },
  );

  const multiselectTool = createMultiselectTool(
    svg, map,
    () => shapes,
    () => selectedIds,
    (ids) => { selectedIds.clear(); ids.forEach(id => selectedIds.add(id)); },
    () => redraw(),
    () => { save(); redraw(); },
  );

  const vertexTool = createVertexTool(
    svg, map,
    () => shapes,
    () => selectedIds,
    () => redraw(),
    () => { save(); redraw(); },
  );

  // ── Pointer events ────────────────────────────────────────────────────────

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    if (activeTool === 'none') return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    switch (activeTool) {
      case 'rect':        rectTool.down(e, activeStyle); break;
      case 'ellipse':     ellipseTool.down(e, activeStyle); break;
      case 'line':        lineTool.down(e, activeStyle, lineSubtool); break;
      case 'select':      selectTool.down(e); break;
      case 'multiselect': multiselectTool.down(e); break;
      case 'vertex':      vertexTool.down(e); break;
    }
  });

  svg.addEventListener('pointermove', (e: PointerEvent) => {
    switch (activeTool) {
      case 'rect':        rectTool.move(e, shiftActive); break;
      case 'ellipse':     ellipseTool.move(e, shiftActive); break;
      case 'line':        lineTool.move(e, shiftActive); break;
      case 'select':      selectTool.move(e); break;
      case 'multiselect': multiselectTool.move(e); break;
      case 'vertex':      vertexTool.move(e); break;
    }
  });

  svg.addEventListener('pointerup', (e: PointerEvent) => {
    switch (activeTool) {
      case 'rect':    commitShape(rectTool.up(e, crypto.randomUUID(), activeStyle, shiftActive)); break;
      case 'ellipse': commitShape(ellipseTool.up(e, crypto.randomUUID(), activeStyle, shiftActive)); break;
      case 'line':    commitShape(lineTool.up(e, crypto.randomUUID(), activeStyle, lineSubtool, shiftActive)); break;
      case 'select':      selectTool.up(e); break;
      case 'multiselect': multiselectTool.up(e); break;
      case 'vertex':      vertexTool.up(e); break;
    }
  });

  svg.addEventListener('pointercancel', () => {
    switch (activeTool) {
      case 'rect':        rectTool.cancel(); break;
      case 'ellipse':     ellipseTool.cancel(); break;
      case 'line':        lineTool.cancel(); break;
      case 'select':      selectTool.cancel(); break;
      case 'multiselect': multiselectTool.cancel(); break;
      case 'vertex':      vertexTool.cancel(); break;
    }
    redraw();
  });

  svg.addEventListener('contextmenu', (e: Event) => {
    if (activeTool === 'vertex') vertexTool.onContextMenu(e);
    else e.preventDefault();
  });

  // ── Map events ────────────────────────────────────────────────────────────

  map.once('load', () => redraw());
  map.on('move',   () => redraw());
  map.on('resize', () => redraw());

  // ── Properties panel ─────────────────────────────────────────────────────

  const propStroke    = document.getElementById('prop-stroke')       as HTMLInputElement | null;
  const propWidth     = document.getElementById('prop-width')        as HTMLInputElement | null;
  const propFill      = document.getElementById('prop-fill')         as HTMLInputElement | null;
  const propOpacity   = document.getElementById('prop-fill-opacity') as HTMLInputElement | null;
  const drawProps     = document.getElementById('draw-props')        as HTMLElement | null;
  const lineSubtoolEl = document.getElementById('line-subtool')      as HTMLElement | null;
  const shiftBtn      = document.getElementById('shift-btn')         as HTMLButtonElement | null;

  function populatePanelFromStyle(s: ShapeStyle): void {
    if (propStroke)  propStroke.value  = s.strokeColor;
    if (propWidth)   propWidth.value   = String(s.strokeWidth);
    if (propFill)    propFill.value    = s.fillColor;
    if (propOpacity) propOpacity.value = String(s.fillOpacity);
  }

  function updatePropsPanel(): void {
    if (!drawProps) return;
    const hide = activeTool === 'none' || activeTool === 'vertex';
    drawProps.style.display = hide ? 'none' : 'flex';
    if (hide) return;

    const isLeader = activeTool === 'line' && lineSubtool === 'leader';

    if (selectedIds.size === 1) {
      const shape = shapes.find(s => selectedIds.has(s.id));
      if (shape) populatePanelFromStyle(shape.style);
    } else {
      populatePanelFromStyle(activeStyle);
    }

    if (propStroke)  propStroke.disabled  = isLeader;
    if (propWidth)   propWidth.disabled   = isLeader;
    if (propFill)    propFill.disabled    = isLeader;
    if (propOpacity) propOpacity.disabled = isLeader;
  }

  function applyStyleToSelected(patch: Partial<ShapeStyle>): void {
    if (selectedIds.size === 0) return;
    for (const shape of shapes) {
      if (selectedIds.has(shape.id)) shape.style = { ...shape.style, ...patch };
    }
    save(); redraw();
  }

  propStroke?.addEventListener('input', () => {
    activeStyle = { ...activeStyle, strokeColor: propStroke!.value };
    saveActiveStyle(activeStyle); applyStyleToSelected({ strokeColor: propStroke!.value });
  });
  propWidth?.addEventListener('input', () => {
    const v = parseFloat(propWidth!.value);
    activeStyle = { ...activeStyle, strokeWidth: v };
    saveActiveStyle(activeStyle); applyStyleToSelected({ strokeWidth: v });
  });
  propFill?.addEventListener('input', () => {
    activeStyle = { ...activeStyle, fillColor: propFill!.value };
    saveActiveStyle(activeStyle); applyStyleToSelected({ fillColor: propFill!.value });
  });
  propOpacity?.addEventListener('input', () => {
    const v = parseFloat(propOpacity!.value);
    activeStyle = { ...activeStyle, fillOpacity: v };
    saveActiveStyle(activeStyle); applyStyleToSelected({ fillOpacity: v });
  });

  // ── Shift key ─────────────────────────────────────────────────────────────

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Shift' && !e.repeat) { shiftActive = true; shiftBtn?.classList.add('active'); }
  });
  document.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Shift') { shiftActive = false; shiftBtn?.classList.remove('active'); }
  });
  shiftBtn?.addEventListener('click', () => {
    shiftActive = !shiftActive;
    shiftBtn.classList.toggle('active', shiftActive);
  });

  // ── Delete key shortcut ───────────────────────────────────────────────────

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && activeTool === 'select') {
      deleteSelectedShapes();
    }
  });

  // ── Line sub-tool strip ───────────────────────────────────────────────────

  document.querySelectorAll<HTMLButtonElement>('[data-subtool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-subtool]')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lineSubtool = btn.dataset['subtool'] as LineSubtool;
      updatePropsPanel();
    });
  });

  // ── Overlay interactivity ─────────────────────────────────────────────────

  function setOverlayInteractive(tool: ToolName): void {
    const active = tool !== 'none';
    svg.classList.toggle('drawing', active);
    svg.style.cursor = (tool === 'select' || tool === 'multiselect' || tool === 'vertex')
      ? 'default'
      : active ? 'crosshair' : '';
  }

  // ── Delete selected helper ────────────────────────────────────────────────

  function deleteSelectedShapes(): void {
    if (selectedIds.size === 0) return;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (selectedIds.has(shapes[i].id)) shapes.splice(i, 1);
    }
    selectedIds.clear();
    save(); redraw();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    setTool(tool: ToolName): void {
      if (activeTool === 'vertex')      vertexTool.deactivate();
      if (activeTool === 'multiselect') multiselectTool.cancel();

      activeTool = tool;
      setOverlayInteractive(tool);
      if (lineSubtoolEl) lineSubtoolEl.style.display = tool === 'line' ? 'flex' : 'none';
      if (tool === 'vertex') vertexTool.activate();
      if (tool !== 'select' && tool !== 'multiselect' && tool !== 'vertex') selectedIds.clear();
      redraw();
    },

    clearAll(): void {
      if (!confirm('Clear all shapes? This cannot be undone.')) return;
      shapes.length = 0;
      selectedIds.clear();
      clearShapes();
      redraw();
    },

    deleteSelected(): void {
      deleteSelectedShapes();
    },

    setVisible(visible: boolean): void {
      svg.style.display = visible ? '' : 'none';
    },
  };
}
