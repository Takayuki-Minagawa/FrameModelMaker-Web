export class CMQLoad {
  moy: number = 0;
  moz: number = 0;
  iMy: number = 0;
  iMz: number = 0;
  iQx: number = 0;
  iQy: number = 0;
  iQz: number = 0;
  jMy: number = 0;
  jMz: number = 0;
  jQx: number = 0;
  jQy: number = 0;
  jQz: number = 0;

  get isZero(): boolean {
    return this.moy === 0 && this.moz === 0 &&
           this.iMy === 0 && this.iMz === 0 &&
           this.iQx === 0 && this.iQy === 0 && this.iQz === 0 &&
           this.jMy === 0 && this.jMz === 0 &&
           this.jQx === 0 && this.jQy === 0 && this.jQz === 0;
  }
}
