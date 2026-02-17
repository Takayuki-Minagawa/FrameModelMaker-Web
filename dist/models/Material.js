export class Material {
    constructor() {
        this.number = 0;
        this.young = 0; // ヤング係数 (kN/cm^2)
        this.shear = 0; // せん断弾性係数
        this.expansion = 0; // 熱膨張係数
        this.poisson = 0; // ポアソン比
        this.unitLoad = 0; // 単位荷重
        this.name = ''; // 材料名
    }
}
//# sourceMappingURL=Material.js.map