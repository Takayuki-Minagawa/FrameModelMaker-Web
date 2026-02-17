export class Spring {
  number: number = 0;
  method: number = 0;
  kTheta: number = 0; // 回転バネ定数

  /** 剛接合（デフォルト）*/
  static readonly RIGID = (() => {
    const s = new Spring();
    s.number = 1;
    return s;
  })();

  /** ピン接合（デフォルト）*/
  static readonly PIN = (() => {
    const s = new Spring();
    s.number = 2;
    return s;
  })();

  /** デフォルトバネ（番号1,2）の数 */
  static readonly DEFAULT_SPRING_COUNT = 3;

  get isDefault(): boolean {
    return this.number === 1 || this.number === 2;
  }
}
