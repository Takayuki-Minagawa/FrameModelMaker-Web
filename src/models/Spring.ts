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

  static readonly RESERVED_NUMBERS = new Set([1, 2]);

  static isReservedNumber(number: number): boolean {
    return Spring.RESERVED_NUMBERS.has(number);
  }

  get isDefault(): boolean {
    return Spring.isReservedNumber(this.number);
  }
}
