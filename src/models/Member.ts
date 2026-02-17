import { MemberLoad } from './MemberLoad';
import { CMQLoad } from './CMQLoad';

export class Member {
  number: number = 0;
  iNodeNumber: number = 0;  // I端節点番号
  jNodeNumber: number = 0;  // J端節点番号
  ixSpring: number = 0;     // I端接合X バネ番号
  iySpring: number = 0;
  izSpring: number = 0;
  jxSpring: number = 0;     // J端接合X バネ番号
  jySpring: number = 0;
  jzSpring: number = 0;
  sectionNumber: number = 0;
  p1: number = 0;
  p2: number = 0;
  p3: number = 0;
  memberLoads: MemberLoad[] = [];
  cmqLoads: CMQLoad[] = [];
  selected: boolean = false;
  isShown: boolean = true;

  getMemberLoad(caseIndex: number): MemberLoad {
    while (this.memberLoads.length <= caseIndex) {
      this.memberLoads.push(new MemberLoad());
    }
    return this.memberLoads[caseIndex];
  }

  getCMQLoad(caseIndex: number): CMQLoad {
    while (this.cmqLoads.length <= caseIndex) {
      this.cmqLoads.push(new CMQLoad());
    }
    return this.cmqLoads[caseIndex];
  }

  setLoadCaseCount(count: number): void {
    while (this.memberLoads.length < count) {
      this.memberLoads.push(new MemberLoad());
    }
    while (this.cmqLoads.length < count) {
      this.cmqLoads.push(new CMQLoad());
    }
    if (this.memberLoads.length > count) this.memberLoads.length = count;
    if (this.cmqLoads.length > count) this.cmqLoads.length = count;
  }

  removeLoad(index: number): void {
    this.memberLoads.splice(index, 1);
    this.cmqLoads.splice(index, 1);
  }
}
