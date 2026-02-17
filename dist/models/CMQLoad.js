export class CMQLoad {
    constructor() {
        this.moy = 0;
        this.moz = 0;
        this.iMy = 0;
        this.iMz = 0;
        this.iQx = 0;
        this.iQy = 0;
        this.iQz = 0;
        this.jMy = 0;
        this.jMz = 0;
        this.jQx = 0;
        this.jQy = 0;
        this.jQz = 0;
    }
    get isZero() {
        return this.moy === 0 && this.moz === 0 &&
            this.iMy === 0 && this.iMz === 0 &&
            this.iQx === 0 && this.iQy === 0 && this.iQz === 0 &&
            this.jMy === 0 && this.jMz === 0 &&
            this.jQx === 0 && this.jQy === 0 && this.jQz === 0;
    }
}
//# sourceMappingURL=CMQLoad.js.map