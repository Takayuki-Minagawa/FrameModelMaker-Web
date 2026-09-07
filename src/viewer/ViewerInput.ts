interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CartesianPointLike {
  x: number;
  y: number;
  z: number;
}

/** Convert CSS client coordinates to the viewer's logical pixel coordinates. */
export function clientPointToViewport(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } | null {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (
    ![x, y, rect.width, rect.height, viewportWidth, viewportHeight].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    x < 0 ||
    y < 0 ||
    x > rect.width ||
    y > rect.height
  )
    return null;
  return {
    x: (x * viewportWidth) / rect.width,
    y: (y * viewportHeight) / rect.height,
  };
}

/** Defensive geometry guard for result diagrams, which may receive invalid models. */
export function hasDrawableMemberSpan(i: CartesianPointLike, j: CartesianPointLike): boolean {
  const dx = j.x - i.x;
  const dy = j.y - i.y;
  const dz = j.z - i.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  return Number.isFinite(lengthSq) && lengthSq > 1e-12;
}
