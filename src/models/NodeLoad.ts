export class NodeLoad {
  p1: number = 0; // X方向力 (kN)
  p2: number = 0; // Y方向力 (kN)
  p3: number = 0; // Z方向力 (kN)
  m1: number = 0; // X軸モーメント (kN*cm)
  m2: number = 0; // Y軸モーメント (kN*cm)
  m3: number = 0; // Z軸モーメント (kN*cm)

  get isZero(): boolean {
    return this.p1 === 0 && this.p2 === 0 && this.p3 === 0 &&
           this.m1 === 0 && this.m2 === 0 && this.m3 === 0;
  }
}
