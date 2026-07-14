export interface Point3Like {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  maxDimension: number;
}

export interface LabelCandidate<T> {
  value: T;
  x: number;
  y: number;
  priority?: number;
}

export function calculateBounds(points: Iterable<Point3Like>): Bounds3 | null {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let count = 0;

  for (const point of points) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
    count++;
  }

  if (count === 0) return null;

  const size: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size,
    maxDimension: Math.max(...size),
  };
}

export function snapScalar(value: number, spacing: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(spacing) || spacing <= 0) return value;
  return Math.round(value / spacing) * spacing;
}

export function snapPoint(
  point: readonly [number, number, number],
  spacing: number,
  unlockedAxes: readonly (0 | 1 | 2)[],
): [number, number, number] {
  const result: [number, number, number] = [...point];
  for (const axis of unlockedAxes) result[axis] = snapScalar(result[axis], spacing);
  return result;
}

/** Deterministic, visually separated color for an arbitrary model key. */
export function colorForKey(key: string | number): string {
  const text = String(key);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = ((hash >>> 0) * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 65%, 48%)`;
}

/**
 * Greedy screen-space label thinning. Higher-priority candidates win; ties
 * keep stable input order so labels do not flicker while orbiting.
 */
export function thinLabelCandidates<T>(
  candidates: readonly LabelCandidate<T>[],
  maxLabels: number,
  minSpacingPx: number,
): LabelCandidate<T>[] {
  if (maxLabels <= 0 || candidates.length === 0) return [];
  if (minSpacingPx <= 0) {
    return candidates
      .map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => (b.candidate.priority ?? 0) - (a.candidate.priority ?? 0) || a.index - b.index)
      .slice(0, maxLabels)
      .map(item => item.candidate);
  }

  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => (b.candidate.priority ?? 0) - (a.candidate.priority ?? 0) || a.index - b.index);

  const cellSize = minSpacingPx;
  const buckets = new Map<string, LabelCandidate<T>[]>();
  const accepted: LabelCandidate<T>[] = [];
  const spacingSq = minSpacingPx * minSpacingPx;

  for (const { candidate } of ordered) {
    const cx = Math.floor(candidate.x / cellSize);
    const cy = Math.floor(candidate.y / cellSize);
    let overlaps = false;
    for (let y = cy - 1; y <= cy + 1 && !overlaps; y++) {
      for (let x = cx - 1; x <= cx + 1 && !overlaps; x++) {
        for (const other of buckets.get(`${x}:${y}`) ?? []) {
          const dx = candidate.x - other.x;
          const dy = candidate.y - other.y;
          if (dx * dx + dy * dy < spacingSq) {
            overlaps = true;
            break;
          }
        }
      }
    }
    if (overlaps) continue;

    accepted.push(candidate);
    const key = `${cx}:${cy}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
    if (accepted.length >= maxLabels) break;
  }

  return accepted;
}

export function pointInPolygon(
  point: { x: number; y: number },
  polygon: readonly { x: number; y: number }[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointToSegmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
  const dx = px - (ax + t * abx);
  const dy = py - (ay + t * aby);
  return dx * dx + dy * dy;
}
