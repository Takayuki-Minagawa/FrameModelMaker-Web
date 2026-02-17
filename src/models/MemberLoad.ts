export class MemberLoad {
  lengthMethod: number = 0;
  type: number = 0;
  direction: number = 0;
  scale: number = 0;
  loadCode: string = '';
  unitLoad: number = 0;
  p1: number = 0;
  p2: number = 0;
  p3: number = 0;

  get isZero(): boolean {
    return this.p1 === 0 && this.p2 === 0 && this.p3 === 0 &&
           this.scale === 0 && this.unitLoad === 0;
  }
}
