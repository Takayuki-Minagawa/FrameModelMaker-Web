import { NodeLoad } from './NodeLoad';
export class Node {
    constructor(x = 0, y = 0, z = 0) {
        this.number = 0;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.temperature = 0;
        this.intensityGroup = 0;
        this.longWeight = 0;
        this.forceWeight = 0;
        this.addForceWeight = 0;
        this.area = 0;
        this.boundaryCondition = null;
        this.loads = [];
        this.selected = false;
        this.isShown = true;
        this.x = x;
        this.y = y;
        this.z = z;
    }
    getLoad(caseIndex) {
        while (this.loads.length <= caseIndex) {
            this.loads.push(new NodeLoad());
        }
        return this.loads[caseIndex];
    }
    setLoadCaseCount(count) {
        while (this.loads.length < count) {
            this.loads.push(new NodeLoad());
        }
        if (this.loads.length > count) {
            this.loads.length = count;
        }
    }
    removeLoad(index) {
        this.loads.splice(index, 1);
    }
    /** Z → Y → X 順でソート比較 */
    compareTo(other) {
        if (this.z < other.z)
            return -1;
        if (this.z > other.z)
            return 1;
        if (this.y < other.y)
            return -1;
        if (this.y > other.y)
            return 1;
        if (this.x < other.x)
            return -1;
        if (this.x > other.x)
            return 1;
        return 0;
    }
}
//# sourceMappingURL=Node.js.map