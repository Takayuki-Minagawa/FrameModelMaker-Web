export class MemberLoad {
    constructor() {
        this.lengthMethod = 0;
        this.type = 0;
        this.direction = 0;
        this.scale = 0;
        this.loadCode = '';
        this.unitLoad = 0;
        this.p1 = 0;
        this.p2 = 0;
        this.p3 = 0;
    }
    get isZero() {
        return this.p1 === 0 && this.p2 === 0 && this.p3 === 0 &&
            this.scale === 0 && this.unitLoad === 0;
    }
}
//# sourceMappingURL=MemberLoad.js.map