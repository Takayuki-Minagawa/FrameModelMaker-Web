export class NodeLoad {
    constructor() {
        this.p1 = 0; // X方向力 (kN)
        this.p2 = 0; // Y方向力 (kN)
        this.p3 = 0; // Z方向力 (kN)
        this.m1 = 0; // X軸モーメント (kN*cm)
        this.m2 = 0; // Y軸モーメント (kN*cm)
        this.m3 = 0; // Z軸モーメント (kN*cm)
    }
    get isZero() {
        return this.p1 === 0 && this.p2 === 0 && this.p3 === 0 &&
            this.m1 === 0 && this.m2 === 0 && this.m3 === 0;
    }
}
//# sourceMappingURL=NodeLoad.js.map