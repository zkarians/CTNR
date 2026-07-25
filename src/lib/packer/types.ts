import { ContainerDimensions, Product, PackedItem } from '../types';

export interface PlacementCandidate {
  x: number;
  y: number;
  z: number;
  w: number;
  l: number;
  h: number;
  rotated: boolean;
}

export interface TempItem {
  product: Product;
  x: number;
  yRel: number;
  z: number;
  w: number;
  l: number;
  h: number;
  rotated: boolean;
}
