/** [longitude, latitude] */
export type GeoPoint = [number, number];

export interface ShapeStyle {
  strokeColor: string;  // hex
  strokeWidth: number;  // px
  strokeDash:  string;  // '' | '8,4' | etc.
  fillColor:   string;  // hex
  fillOpacity: number;  // 0–1
}

export const DEFAULT_STYLE: ShapeStyle = {
  strokeColor: '#ff6b6b',
  strokeWidth: 2,
  strokeDash:  '',
  fillColor:   '#ff6b6b',
  fillOpacity: 0.12,
};

export interface BaseShape {
  id:    string;
  style: ShapeStyle;
}

export interface PenShape extends BaseShape {
  type:    'pen';
  points:  GeoPoint[];
  closed?: boolean; // true = polygon (last point implicitly connects to first)
}

export interface RectShape extends BaseShape {
  type:    'rect';
  corners: [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
}

export interface EllipseShape extends BaseShape {
  type:  'ellipse';
  center: GeoPoint;
  edgeX:  GeoPoint; // point along horizontal semi-axis
  edgeY:  GeoPoint; // point along vertical semi-axis
}

export interface LineShape extends BaseShape {
  type:    'line';
  subtype: 'basic' | 'dashed' | 'leader';
  start:   GeoPoint;
  end:     GeoPoint;
}

export type GeoShape = PenShape | RectShape | EllipseShape | LineShape;

export type ToolName     = 'none' | 'pen' | 'rect' | 'ellipse' | 'line' | 'select' | 'multiselect' | 'vertex';
export type LineSubtool  = 'basic' | 'dashed' | 'leader';
