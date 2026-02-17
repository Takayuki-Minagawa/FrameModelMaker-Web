export class BoundaryCondition {
    constructor() {
        this.nodeNumber = 0;
        this.deltaX = 0; // X方向変位拘束 (0:自由, 1:固定)
        this.deltaY = 0;
        this.deltaZ = 0;
        this.thetaX = 0; // X軸回転拘束
        this.thetaY = 0;
        this.thetaZ = 0;
    }
}
//# sourceMappingURL=BoundaryCondition.js.map