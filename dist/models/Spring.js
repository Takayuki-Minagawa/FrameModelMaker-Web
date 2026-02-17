export class Spring {
    constructor() {
        this.number = 0;
        this.method = 0;
        this.kTheta = 0; // 回転バネ定数
    }
    get isDefault() {
        return this.number === 1 || this.number === 2;
    }
}
/** 剛接合（デフォルト）*/
Spring.RIGID = (() => {
    const s = new Spring();
    s.number = 1;
    return s;
})();
/** ピン接合（デフォルト）*/
Spring.PIN = (() => {
    const s = new Spring();
    s.number = 2;
    return s;
})();
/** デフォルトバネ（番号1,2）の数 */
Spring.DEFAULT_SPRING_COUNT = 3;
//# sourceMappingURL=Spring.js.map