import { NodeLoad } from './NodeLoad';
import { BoundaryCondition } from './BoundaryCondition';

export class Node {
  number: number = 0;
  x: number = 0;
  y: number = 0;
  z: number = 0;
  temperature: number = 0;
  intensityGroup: number = 0;
  longWeight: number = 0;
  forceWeight: number = 0;
  addForceWeight: number = 0;
  area: number = 0;
  boundaryCondition: BoundaryCondition | null = null;
  loads: NodeLoad[] = [];
  selected: boolean = false;
  isShown: boolean = true;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  getLoad(caseIndex: number): NodeLoad {
    while (this.loads.length <= caseIndex) {
      this.loads.push(new NodeLoad());
    }
    return this.loads[caseIndex];
  }

  setLoadCaseCount(count: number): void {
    while (this.loads.length < count) {
      this.loads.push(new NodeLoad());
    }
    if (this.loads.length > count) {
      this.loads.length = count;
    }
  }

  removeLoad(index: number): void {
    this.loads.splice(index, 1);
  }

  /** Z → Y → X 順でソート比較 */
  compareTo(other: Node): number {
    if (this.z < other.z) return -1;
    if (this.z > other.z) return 1;
    if (this.y < other.y) return -1;
    if (this.y > other.y) return 1;
    if (this.x < other.x) return -1;
    if (this.x > other.x) return 1;
    return 0;
  }
}
