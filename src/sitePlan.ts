import { DEFAULT_CONTEXT } from './context';

function makeBuilding(
  swLng: number, swLat: number,
  neLng: number, neLat: number,
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { kind: 'building' },
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
}

/**
 * Returns the site boundary polygon (focusBounds) plus a handful of building
 * footprints distributed across the site, leaving street/parking gaps between them.
 */
export function buildSitePlan(): GeoJSON.FeatureCollection {
  const [[swLng, swLat], [neLng, neLat]] = DEFAULT_CONTEXT.focusBounds;

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

  // Five building pads distributed across the site with ~30 m street gaps.
  // Coordinates are absolute lng/lat within focusBounds.
  const buildings: GeoJSON.Feature[] = [
    // NW pad — large anchor building
    makeBuilding(-83.0042, 39.9621, -83.0021, 39.9633),
    // NE pad
    makeBuilding(-83.0010, 39.9622, -82.9982, 39.9633),
    // Central pad — largest footprint
    makeBuilding(-83.0038, 39.9600, -82.9990, 39.9616),
    // SW pad
    makeBuilding(-83.0042, 39.9591, -83.0020, 39.9601),
    // SE pad
    makeBuilding(-83.0005, 39.9591, -82.9972, 39.9601),
  ];

  return { type: 'FeatureCollection', features: [boundary, ...buildings] };
}
