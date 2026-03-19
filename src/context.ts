import type { Map } from 'maplibre-gl';
import { LngLatBounds } from 'maplibre-gl';

export interface SiteContext {
  /** Display name shown in the UI */
  name: string;
  /** Initial map center [longitude, latitude] */
  center: [number, number];
  /**
   * Hard geographic boundary — the map cannot be panned or zoomed outside
   * this bounding box. Prevents runaway tile usage on shared API keys.
   * Format: [[sw_lng, sw_lat], [ne_lng, ne_lat]]
   */
  bounds: [[number, number], [number, number]];
  /** Minimum zoom level (prevents zooming so far out the bounds are useless) */
  minZoom: number;
  /** Maximum zoom level */
  maxZoom: number;
}

/**
 * Default context: Columbus, OH downtown — roughly 10 city blocks (~1.5 km²).
 * Replace center/bounds with property-specific coordinates in a real deployment.
 */
export const DEFAULT_CONTEXT: SiteContext = {
  name: 'Columbus Downtown — Demo Site',
  center: [-83.0007, 39.9612],
  bounds: [
    [-83.015, 39.953], // SW — ~1.2 km west, ~0.9 km south of center
    [-82.986, 39.969], // NE — ~1.3 km east, ~0.9 km north of center
  ],
  minZoom: 14,
  maxZoom: 21,
};

/**
 * Applies a SiteContext to a MapLibre Map instance.
 * After this call the map will refuse to pan outside ctx.bounds and
 * will clamp zoom to [ctx.minZoom, ctx.maxZoom].
 */
export function applyContext(map: Map, ctx: SiteContext): void {
  map.setMaxBounds(new LngLatBounds(ctx.bounds[0], ctx.bounds[1]));
  map.setMinZoom(ctx.minZoom);
  map.setMaxZoom(ctx.maxZoom);
}
