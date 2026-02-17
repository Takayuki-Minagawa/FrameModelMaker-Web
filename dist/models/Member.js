import { MemberLoad } from './MemberLoad';
import { CMQLoad } from './CMQLoad';
export class Member {
    constructor() {
        this.number = 0;
        this.iNodeNumber = 0; // I端節点番号
        this.jNodeNumber = 0; // J端節点番号
        this.ixSpring = 0; // I端接合X バネ番号
        this.iySpring = 0;
        this.izSpring = 0;
        this.jxSpring = 0; // J端接合X バネ番号
        this.jySpring = 0;
        this.jzSpring = 0;
        this.sectionNumber = 0;
        this.p1 = 0;
        this.p2 = 0;
        this.p3 = 0;
        this.memberLoads = [];
        this.cmqLoads = [];
        this.selected = false;
        this.isShown = true;
    }
    getMemberLoad(caseIndex) {
        while (this.memberLoads.length <= caseIndex) {
            this.memberLoads.push(new MemberLoad());
        }
        return this.memberLoads[caseIndex];
    }
    getCMQLoad(caseIndex) {
        while (this.cmqLoads.length <= caseIndex) {
            this.cmqLoads.push(new CMQLoad());
        }
        return this.cmqLoads[caseIndex];
    }
    setLoadCaseCount(count) {
        while (this.memberLoads.length < count) {
            this.memberLoads.push(new MemberLoad());
        }
        while (this.cmqLoads.length < count) {
            this.cmqLoads.push(new CMQLoad());
        }
        if (this.memberLoads.length > count)
            this.memberLoads.length = count;
        if (this.cmqLoads.length > count)
            this.cmqLoads.length = count;
    }
    removeLoad(index) {
        this.memberLoads.splice(index, 1);
        this.cmqLoads.splice(index, 1);
    }
}
//# sourceMappingURL=Member.js.map