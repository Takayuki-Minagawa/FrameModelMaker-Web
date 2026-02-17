export enum SectionType {
  Horizontal = 0,
  Vertical = 1,
  Diagonal = 2,
  Other = 3,
  Truss = 4,
  Wall = 5,
}

export enum SectionShape {
  DirectInput = 0,
  Rectangle = 1,
  Circle = 2,
  Steel = 3,
  Box = 4,
  I_Steel = 5,
  H_Steel = 6,
}

export class Section {
  number: number = 0;
  materialNumber: number = 0;
  type: SectionType = SectionType.Horizontal;
  shape: SectionShape = SectionShape.DirectInput;
  p1_A: number = 0;   // 断面積 (cm^2)
  p2_Ix: number = 0;  // 断面二次モーメント Ix
  p3_Iy: number = 0;
  p4_Iz: number = 0;
  ky: number = 0;      // せん断面積比
  kz: number = 0;
  comment: string = '';
}
