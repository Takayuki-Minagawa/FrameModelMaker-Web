import { Node } from './Node';
import { Member } from './Member';
import { Section } from './Section';
import { Material } from './Material';
import { BoundaryCondition } from './BoundaryCondition';
import { Spring } from './Spring';
import { Wall } from './Wall';

export class FrameDocument {
  title: string = '';
  nodes: Node[] = [];
  members: Member[] = [];
  sections: Section[] = [];
  materials: Material[] = [];
  boundaries: BoundaryCondition[] = [];
  springs: Spring[] = [];
  walls: Wall[] = [];
  loadCaseCount: number = 1;
  loadCaseIndex: number = 0;
  calcCaseMemo: string[] = [];

  /** 変更通知コールバック */
  private changeListeners: Array<() => void> = [];

  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  notifyChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  /** ドキュメント初期化 */
  init(): void {
    this.title = '';
    this.nodes = [];
    this.members = [];
    this.sections = [];
    this.materials = [];
    this.boundaries = [];
    this.springs = [];
    this.walls = [];
    this.loadCaseCount = 1;
    this.loadCaseIndex = 0;
    this.calcCaseMemo = [];
    this.notifyChange();
  }

  /** 新しい節点番号を取得 */
  get newNodeNumber(): number {
    let max = 0;
    for (const n of this.nodes) {
      max = Math.max(max, n.number);
    }
    return max + 1;
  }

  /** 新しい部材番号を取得 */
  get newMemberNumber(): number {
    let max = 0;
    for (const m of this.members) {
      max = Math.max(max, m.number);
    }
    return max + 1;
  }

  /** 番号から節点を検索 */
  findNodeByNumber(number: number): Node | undefined {
    return this.nodes.find(n => n.number === number);
  }

  /** 番号からバネを検索 */
  findSpringByNumber(number: number): Spring | undefined {
    if (number === Spring.RIGID.number) return Spring.RIGID;
    if (number === Spring.PIN.number) return Spring.PIN;
    return this.springs.find(s => s.number === number);
  }

  /** 番号から断面を検索 */
  findSectionByNumber(number: number): Section | undefined {
    return this.sections.find(s => s.number === number);
  }

  /** 番号から材料を検索 */
  findMaterialByNumber(number: number): Material | undefined {
    return this.materials.find(m => m.number === number);
  }

  /** 番号を1から振り直す */
  assignNumbers(): void {
    this.nodes.forEach((n, i) => n.number = i + 1);
    this.materials.forEach((m, i) => m.number = i + 1);
    this.sections.forEach((s, i) => s.number = i + 1);
    let springNum = Spring.DEFAULT_SPRING_COUNT;
    this.springs.forEach(s => s.number = springNum++);
    this.members.forEach((m, i) => m.number = i + 1);
    this.walls.forEach((w, i) => w.number = i + 1);
    this.notifyChange();
  }

  /** 節点・部材をソート */
  sort(): void {
    this.nodes.sort((a, b) => a.compareTo(b));
    this.members.sort((a, b) => {
      const nodeA = this.findNodeByNumber(a.iNodeNumber);
      const nodeB = this.findNodeByNumber(b.iNodeNumber);
      if (!nodeA || !nodeB) return 0;
      if (nodeA.z !== nodeB.z) return nodeA.z - nodeB.z;
      return a.iNodeNumber - b.iNodeNumber;
    });
    this.notifyChange();
  }

  /** 荷重定義を追加 */
  addLoadCase(): void {
    this.loadCaseCount++;
    for (const n of this.nodes) n.setLoadCaseCount(this.loadCaseCount);
    for (const m of this.members) m.setLoadCaseCount(this.loadCaseCount);
    this.notifyChange();
  }

  /** 荷重定義を削除 */
  removeLoadCase(index: number): void {
    if (index < 0 || index >= this.loadCaseCount) return;
    for (const n of this.nodes) n.removeLoad(index);
    for (const m of this.members) m.removeLoad(index);
    this.loadCaseCount--;
    if (this.loadCaseIndex >= this.loadCaseCount) {
      this.loadCaseIndex = Math.max(0, this.loadCaseCount - 1);
    }
    this.notifyChange();
  }

  /** 重複ノード統合 */
  mergeOverlappingNodes(threshold: number): void {
    const mergeMap = new Map<Node, Node>();

    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dz = n1.z - n2.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= threshold) {
          mergeMap.set(n2, n1);
        }
      }
    }

    const deleted = new Set(mergeMap.keys());
    this.nodes = this.nodes.filter(n => !deleted.has(n));

    for (const m of this.members) {
      const iNode = this.findNodeByNumber(m.iNodeNumber);
      const jNode = this.findNodeByNumber(m.jNodeNumber);
      if (iNode && deleted.has(iNode)) {
        const replacement = mergeMap.get(iNode);
        if (replacement) m.iNodeNumber = replacement.number;
      }
      if (jNode && deleted.has(jNode)) {
        const replacement = mergeMap.get(jNode);
        if (replacement) m.jNodeNumber = replacement.number;
      }
    }

    this.notifyChange();
  }
}
