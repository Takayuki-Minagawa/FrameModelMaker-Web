export class BoundaryCondition {
  nodeNumber: number = 0;
  deltaX: number = 0; // X方向変位拘束 (0:自由, 1:固定)
  deltaY: number = 0;
  deltaZ: number = 0;
  thetaX: number = 0; // X軸回転拘束
  thetaY: number = 0;
  thetaZ: number = 0;
}
