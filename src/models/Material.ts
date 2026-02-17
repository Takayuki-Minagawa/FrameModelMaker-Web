export class Material {
  number: number = 0;
  young: number = 0;      // ヤング係数 (kN/cm^2)
  shear: number = 0;      // せん断弾性係数
  expansion: number = 0;  // 熱膨張係数
  poisson: number = 0;    // ポアソン比
  unitLoad: number = 0;   // 単位荷重
  name: string = '';      // 材料名
}
