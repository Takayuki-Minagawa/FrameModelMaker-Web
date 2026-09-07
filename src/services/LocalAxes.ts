import { Vector3 } from 'three';
import type { LocalAxisMetadata } from '../models/AnalysisMetadata';

type Point = { x: number; y: number; z: number };
export interface LocalAxes {
  x: [number, number, number];
  y: [number, number, number];
  z: [number, number, number];
  source: 'specified' | 'inferred';
}

export function resolveLocalAxes(i: Point, j: Point, metadata?: LocalAxisMetadata): LocalAxes {
  const x = new Vector3(j.x - i.x, j.y - i.y, j.z - i.z);
  if (!Number.isFinite(x.lengthSq()) || x.lengthSq() < 1e-12)
    throw new Error('Local axes require a finite nonzero member span.');
  x.normalize();
  const vector = (values: number[] | undefined, label: string): Vector3 | undefined => {
    if (!values) return undefined;
    if (values.length !== 3 || !values.every(Number.isFinite) || Math.hypot(...values) < 1e-12)
      throw new Error(`${label} must be a finite nonzero 3-vector.`);
    return new Vector3(...(values as [number, number, number])).normalize();
  };
  const declaredX = vector(metadata?.x, 'local x');
  if (declaredX && declaredX.dot(x) < 1 - 1e-8)
    throw new Error('Declared local x differs from the I→J direction.');
  const yInput = vector(metadata?.y, 'local y');
  const vecxz = vector(metadata?.vecxz, 'vecxz');
  let y = yInput?.clone().addScaledVector(x, -yInput.dot(x)) ?? vecxz?.clone().cross(x);
  if (y && y.lengthSq() < 1e-12) throw new Error('Local orientation vector is parallel to the member.');
  const source = y ? 'specified' : 'inferred';
  y ??= (Math.abs(x.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)).cross(x);
  y.normalize();
  if (yInput && vecxz && vecxz.clone().cross(x).normalize().dot(y) < 1 - 1e-8)
    throw new Error('local y and vecxz specify inconsistent orientations.');
  return { x: x.toArray(), y: y.toArray(), z: x.clone().cross(y).normalize().toArray(), source };
}
