import type { GeoShape, ShapeStyle } from './types';

const SHAPES_KEY = 'drawing-geo-shapes-v3';
const STYLE_KEY  = 'drawing-active-style-v3';

export function saveShapes(shapes: GeoShape[]): void {
  localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes));
}

export function loadShapes(): GeoShape[] {
  try {
    const raw = localStorage.getItem(SHAPES_KEY);
    return raw ? (JSON.parse(raw) as GeoShape[]) : [];
  } catch {
    return [];
  }
}

export function clearShapes(): void {
  localStorage.removeItem(SHAPES_KEY);
}

export function saveActiveStyle(style: ShapeStyle): void {
  localStorage.setItem(STYLE_KEY, JSON.stringify(style));
}

export function loadActiveStyle(): ShapeStyle | null {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    return raw ? (JSON.parse(raw) as ShapeStyle) : null;
  } catch {
    return null;
  }
}
