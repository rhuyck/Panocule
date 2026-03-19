# Panocule

A prototype for geo-anchored 2D/3D map drawing — SVG annotations pinned to a MapLibre satellite basemap, with an animated transition to a Three.js LiDAR point-cloud view.

**Stack:** TypeScript · Vite · MapLibre GL · Three.js

---

## What it does

- **2D mode** — satellite basemap with a GeoJSON site-plan overlay and an SVG drawing layer. Shapes are drawn in screen pixels but stored as geographic coordinates (`[lng, lat]`) so they stay pinned to the map through any pan, zoom, or rotation.
- **3D mode** — animated fly-to + fade-in of a procedurally-generated Three.js point cloud co-registered to the map's Mercator coordinate space, simulating a LiDAR scan.
- **Transition** — a single toggle button drives a smooth 2D ↔ 3D transition (pitch/bearing fly-to + opacity fade on the point cloud, toolbar swap).

---

## Project structure

```
src/
├── main.ts           # Entry point — map setup, toolbar wiring, layer composition
├── constants.ts      # Demo site center coords and point-cloud size
├── context.ts        # SiteContext type — geographic bounds/zoom constraints
├── sitePlan.ts       # GeoJSON bounding-box polygon for the demo site
├── pointCloud.ts     # Three.js MapLibre custom layer (procedural point cloud)
├── transitions.ts    # 2D ↔ 3D animated transition controller
├── styles.css
└── drawing/
    ├── controller.ts # Top-level DrawingController — event routing, tool lifecycle
    ├── types.ts      # GeoShape union type, ShapeStyle, ToolName
    ├── store.ts      # localStorage persistence (shapes + active style)
    ├── render.ts     # SVG rendering, coordinate helpers, bounding-box utils
    └── tools/
        ├── pen.ts         # Freehand polyline + auto-closing polygon
        ├── rect.ts        # Axis-aligned rectangle (Shift = square)
        ├── ellipse.ts     # Ellipse (Shift = circle)
        ├── line.ts        # Straight line: basic | dashed | leader arrow
        ├── select.ts      # Single-shape select, drag-move, rotation handle
        ├── multiselect.ts # Rubber-band lasso for multi-shape select + move
        └── vertex.ts      # Per-point vertex editing (drag, add, delete via right-click)
```

---

## Drawing system

### Geo-anchored shapes

All shapes are stored as geographic coordinates rather than screen pixels. On every `move` or `resize` event the SVG is fully redrawn by re-projecting the stored geo coords through `map.project()`. This means:

- Drawings survive arbitrary pan/zoom/rotate/pitch changes with no drift.
- Persistence is trivial: shapes are JSON-serialised to `localStorage` as-is.

### Shape types (`src/drawing/types.ts`)

| Type | Storage |
|------|---------|
| `pen` | `GeoPoint[]` + optional `closed` flag (renders as `<polygon>` when closed) |
| `rect` | 4 `GeoPoint` corners (NW → NE → SE → SW) |
| `ellipse` | `center`, `edgeX`, `edgeY` — two radii stored as geo points |
| `line` | `start` + `end` + `subtype`: `basic | dashed | leader` |

Each shape carries a `ShapeStyle` (stroke color/width/dash, fill color/opacity) so per-shape styling is independent of the active brush.

### Tool architecture

Each tool in `src/drawing/tools/` exports a factory function that returns `{ down, move, up, cancel }` — plain pointer-event handlers with no internal DOM coupling. The controller (`controller.ts`) owns the shape array, routes pointer events to whichever tool is active, and calls `redrawAll()` after every mutation.

**Pen tool** (`pen.ts`) — accumulates geo points on `pointermove`. On `pointerup`, checks if the end point is within 16px of the start and auto-closes to a filled polygon if so. A cyan ring renders at the start point as a close-proximity indicator.

**Select tool** (`select.ts`) — hit-tests against shape bounding boxes. Supports drag-to-move (delta applied in geo space) and a rotation handle rendered above the selection box. Rotation uses a flat-earth approximation (valid at city-block scale) to rotate geo points around the shape centroid.

**Line tool** (`line.ts`) — snaps to 45° increments when Shift is held. Completed line segments participate in **closed-loop detection**: when a new line segment causes a set of connected lines to form a closed path, the controller automatically replaces all segments with a single `pen` polygon.

**Vertex tool** (`vertex.ts`) — renders a draggable handle for every geo point of the selected shape. Right-click on a handle deletes the vertex; right-click on an edge inserts one.

**Multiselect tool** (`multiselect.ts`) — rubber-band lasso drawn as a dashed SVG rect during drag. On release, all shapes whose bounding boxes intersect the lasso are selected. Supports drag-move of the entire selection.

### Coordinate helpers (`src/drawing/render.ts`)

```ts
geoFromPx(map, x, y)   // screen px  → [lng, lat]  via map.unproject()
pxFromGeo(map, geo)     // [lng, lat] → screen px   via map.project()
pxFromEvent(svg, e)     // PointerEvent → svg-relative px
getShapeBBox(map, shape) // projects all shape points, returns {x,y,w,h}
```

---

## Getting started

```bash
npm install
npm run dev      # dev server at localhost:5173
npm run build    # builds to dist/
```

---

## Point cloud (`src/pointCloud.ts`)

A MapLibre `CustomLayer` with `renderingMode: '3d'` that renders a Three.js scene using the map's own WebGL context. The origin is anchored to the site center via `MercatorCoordinate.fromLngLat()` and the projection matrix is composed from MapLibre's `matrix` uniform. 180 000 procedurally-coloured points are distributed across 12 building clusters with roof, facade, vegetation, road, and ground classifications.
