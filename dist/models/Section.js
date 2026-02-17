export var SectionType;
(function (SectionType) {
    SectionType[SectionType["Horizontal"] = 0] = "Horizontal";
    SectionType[SectionType["Vertical"] = 1] = "Vertical";
    SectionType[SectionType["Diagonal"] = 2] = "Diagonal";
    SectionType[SectionType["Other"] = 3] = "Other";
    SectionType[SectionType["Truss"] = 4] = "Truss";
    SectionType[SectionType["Wall"] = 5] = "Wall";
})(SectionType || (SectionType = {}));
export var SectionShape;
(function (SectionShape) {
    SectionShape[SectionShape["DirectInput"] = 0] = "DirectInput";
    SectionShape[SectionShape["Rectangle"] = 1] = "Rectangle";
    SectionShape[SectionShape["Circle"] = 2] = "Circle";
    SectionShape[SectionShape["Steel"] = 3] = "Steel";
    SectionShape[SectionShape["Box"] = 4] = "Box";
    SectionShape[SectionShape["I_Steel"] = 5] = "I_Steel";
    SectionShape[SectionShape["H_Steel"] = 6] = "H_Steel";
})(SectionShape || (SectionShape = {}));
export class Section {
    constructor() {
        this.number = 0;
        this.materialNumber = 0;
        this.type = SectionType.Horizontal;
        this.shape = SectionShape.DirectInput;
        this.p1_A = 0; // 断面積 (cm^2)
        this.p2_Ix = 0; // 断面二次モーメント Ix
        this.p3_Iy = 0;
        this.p4_Iz = 0;
        this.ky = 0; // せん断面積比
        this.kz = 0;
        this.comment = '';
    }
}
//# sourceMappingURL=Section.js.map