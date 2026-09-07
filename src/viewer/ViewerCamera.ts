import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Bounds3 } from './ViewerMath';
import type { ProjectionMode, Vector3Tuple, ViewerCameraState } from './ViewerTypes';
type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
interface Context {
  camera: Camera;
  controls: OrbitControls;
  projectionMode: ProjectionMode;
  getAspect(): number;
}
export function captureCamera(ctx: Context): ViewerCameraState {
  return {
    projection: ctx.projectionMode,
    position: ctx.camera.position.toArray() as Vector3Tuple,
    target: ctx.controls.target.toArray() as Vector3Tuple,
    up: ctx.camera.up.toArray() as Vector3Tuple,
    zoom: ctx.camera.zoom,
    orthographicHeight:
      ctx.camera instanceof THREE.OrthographicCamera ? ctx.camera.top - ctx.camera.bottom : undefined,
  };
}
export function restoreCamera(ctx: Context, state: ViewerCameraState): void {
  ctx.camera.position.fromArray(state.position);
  ctx.camera.up.fromArray(state.up);
  ctx.camera.zoom = Math.max(state.zoom, Number.EPSILON);
  if (ctx.camera instanceof THREE.OrthographicCamera && state.orthographicHeight) {
    const halfHeight = Math.max(state.orthographicHeight / 2, Number.EPSILON);
    ctx.camera.top = halfHeight;
    ctx.camera.bottom = -halfHeight;
    ctx.camera.left = -halfHeight * ctx.getAspect();
    ctx.camera.right = halfHeight * ctx.getAspect();
  }
  ctx.controls.target.fromArray(state.target);
  ctx.camera.updateProjectionMatrix();
  ctx.controls.update();
}
export function fitCamera(ctx: Context, bounds: Bounds3, padding = 1.35): void {
  const target = new THREE.Vector3(...bounds.center);
  const radius = Math.max(bounds.maxDimension / 2, 50) * padding;
  let direction = ctx.camera.position.clone().sub(ctx.controls.target);
  if (direction.lengthSq() < 1e-12) direction.set(1, -1.2, 0.8);
  direction.normalize();
  ctx.controls.target.copy(target);

  if (ctx.camera instanceof THREE.PerspectiveCamera) {
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(ctx.camera.fov / 2));
    ctx.camera.position.copy(target).addScaledVector(direction, distance);
  } else {
    const halfHeight = radius;
    const aspect = ctx.getAspect();
    ctx.camera.left = -halfHeight * aspect;
    ctx.camera.right = halfHeight * aspect;
    ctx.camera.top = halfHeight;
    ctx.camera.bottom = -halfHeight;
    ctx.camera.zoom = 1;
    ctx.camera.position.copy(target).addScaledVector(direction, Math.max(radius * 3, 100));
  }
  ctx.camera.updateProjectionMatrix();
  ctx.camera.lookAt(target);
  ctx.controls.update();
}
