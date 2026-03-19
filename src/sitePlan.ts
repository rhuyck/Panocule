import { DEFAULT_CONTEXT } from './context';

/**
 * Returns a single bounding-box polygon that matches the site context bounds.
 * This makes it easy to see exactly what area is locked for the current context.
 */
export function buildSitePlan(): GeoJSON.FeatureCollection {
  const [[swLng, swLat], [neLng, neLat]] = DEFAULT_CONTEXT.bounds;

  const boundary: GeoJSON.Feature = {
    type: 'Feature',
    properties: { kind: 'block' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [swLng, swLat],
        [neLng, swLat],
        [neLng, neLat],
        [swLng, neLat],
        [swLng, swLat],
      ]],
    },
  };

  return { type: 'FeatureCollection', features: [boundary] };
}
