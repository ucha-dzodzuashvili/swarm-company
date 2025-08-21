export type Variant = 'aqua' | 'red' | 'tri';

export interface NodeData {
  id: string;
  x: number;
  y: number;
  r: number; // core radius
  value: number;
  variant: Variant;
}

export interface LinkData {
  id: string;
  from: string;
  to: string;
}

export interface FleetGroup {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  count: number;
}
