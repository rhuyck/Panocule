import type { Map } from 'maplibre-gl';
import { LngLatBounds } from 'maplibre-gl';

export interface SiteContext {
  /** Display name shown in the UI */
  name: string;
  /** Initial map center [longitude, latitude] */
  center: [number, number];
  /**
   * Maximum pannable area — includes the site plus a substantial context buffer.
   * The map cannot be panned or zoomed outside this boundary.
   * Format: [[sw_lng, sw_lat], [ne_lng, ne_lat]]
   */
  bounds: [[number, number], [number, number]];
  /**
   * Site focus area — the polygon shown as the yellow site boundary.
   * Sized to fill ~75% of the viewport at startup (via fitBounds).
   * Should be meaningfully smaller than bounds so context is visible on pan.
   */
  focusBounds: [[number, number], [number, number]];
  /** Minimum zoom level */
  minZoom: number;
  /** Maximum zoom level */
  maxZoom: number;
}

/**
 * Default context: Columbus, OH downtown demo site.
 *
 * focusBounds (~630 m × 490 m) is the site boundary polygon shown in the UI.
 * bounds (~3.8 km × 2.7 km) is the larger pannable area — pan away from the
 * site to explore surrounding blocks and streets.
 */
export const DEFAULT_CONTEXT: SiteContext = {
  name: 'Columbus Downtown — Demo Site',
  center: [-83.0007, 39.9612],
  bounds: [
    [-83.022, 39.948], // SW — ~1.8 km west, ~1.5 km south of center
    [-82.979, 39.974], // NE — ~1.9 km east, ~1.4 km north of center
  ],
  focusBounds: [
    [-83.0044, 39.9590], // SW — ~630 m × 490 m site boundary
    [-82.9970, 39.9634], // NE
  ],
  minZoom: 13,
  maxZoom: 21,
};

/**
 * Applies a SiteContext to a MapLibre Map instance.
 * Sets maxBounds to the full pannable area (ctx.bounds), not the site polygon.
 */
export function applyContext(map: Map, ctx: SiteContext): void {
  map.setMaxBounds(new LngLatBounds(ctx.bounds[0], ctx.bounds[1]));
  map.setMinZoom(ctx.minZoom);
  map.setMaxZoom(ctx.maxZoom);
}
