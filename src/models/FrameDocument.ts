import { Node } from './Node';
import { Member } from './Member';
import { Section } from './Section';
import { Material } from './Material';
import { BoundaryCondition } from './BoundaryCondition';
import { Spring } from './Spring';
import { Wall } from './Wall';
import { LoadCase, LoadCaseType } from './LoadCase';
import { LoadCombination, LoadCombinationTerm } from './LoadCombination';
import { AnalysisMetadata } from './AnalysisMetadata';
import { NodeLoad } from './NodeLoad';
import { MemberLoad } from './MemberLoad';
import { CMQLoad } from './CMQLoad';

export type NumberedEntityKind = 'node' | 'member' | 'section' | 'material' | 'spring' | 'wall';

export interface RenumberResult {
  nodes: ReadonlyMap<number, number>;
  members: ReadonlyMap<number, number>;
  sections: ReadonlyMap<number, number>;
  materials: ReadonlyMap<number, number>;
  springs: ReadonlyMap<number, number>;
  walls: ReadonlyMap<number, number>;
}

export interface NodeMergeConflict {
  representativeNumber: number;
  mergedNumber: number;
  field: 'temperature' | 'intensityGroup';
  keptValue: number;
  discardedValue: number;
}

export interface MergeOverlappingNodesOptions {
  /** 統合後にI/J端が一致した部材を削除する。既定値はtrue。 */
  removeDegenerateMembers?: boolean;
}

export interface MergeOverlappingNodesResult {
  mergedNodeCount: number;
  representativeByNodeNumber: ReadonlyMap<number, number>;
  removedMemberNumbers: number[];
  degenerateWallNumbers: number[];
  conflicts: NodeMergeConflict[];
}

function cloneNodeLoad(source: NodeLoad): NodeLoad {
  return Object.assign(new NodeLoad(), source);
}

function cloneMemberLoad(source: MemberLoad): MemberLoad {
  return Object.assign(new MemberLoad(), source);
}

function cloneCMQLoad(source: CMQLoad): CMQLoad {
  return Object.assign(new CMQLoad(), source);
}

function nextStableId(prefix: string, existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  let serial = 1;
  while (used.has(`${prefix}${serial}`)) serial++;
  return `${prefix}${serial}`;
}

function makeNumberMap<T extends { number: number }>(
  items: readonly T[],
  start: number,
  label: string,
  reserved: ReadonlySet<number> = new Set(),
): Map<number, number> {
  const result = new Map<number, number>();
  let next = start;
  for (const item of items) {
    if (result.has(item.number)) {
      throw new Error(`Cannot renumber: duplicate ${label} number ${item.number}.`);
    }
    while (reserved.has(next)) next++;
    result.set(item.number, next++);
  }
  return result;
}

function remap(value: number, map?: ReadonlyMap<number, number>): number {
  return map?.get(value) ?? value;
}

export class FrameDocument {
  title: string = '';
  nodes: Node[] = [];
  members: Member[] = [];
  sections: Section[] = [];
  materials: Material[] = [];
  boundaries: BoundaryCondition[] = [];
  springs: Spring[] = [];
  walls: Wall[] = [];
  /** 旧UI互換用。loadCases.lengthと常に同期させるAPIを利用すること。 */
  loadCaseCount: number = 1;
  loadCaseIndex: number = 0;
  calcCaseMemo: string[] = [];
  loadCases: LoadCase[] = [new LoadCase('LC1', 'Load Case 1')];
  loadCombinations: LoadCombination[] = [];
  analysisMetadata: AnalysisMetadata | null = null;

  /** 変更通知コールバック */
  private changeListeners: Array<() => void> = [];

  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  removeChangeListener(listener: () => void): void {
    const idx = this.changeListeners.indexOf(listener);
    if (idx !== -1) this.changeListeners.splice(idx, 1);
  }

  notifyChange(): void {
    for (const listener of [...this.changeListeners]) listener();
  }

  /** ドキュメント初期化。荷重ケースは必ず1件残す。 */
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
    this.loadCases = [new LoadCase('LC1', 'Load Case 1')];
    this.loadCombinations = [];
    this.analysisMetadata = null;
    this.notifyChange();
  }

  /** リスナーを維持したまま、検証済み一時ドキュメントの内容へ原子的に置換する。 */
  replaceWith(source: FrameDocument, notify: boolean = true): void {
    this.title = source.title;
    this.nodes = source.nodes;
    this.members = source.members;
    this.sections = source.sections;
    this.materials = source.materials;
    this.boundaries = source.boundaries;
    this.springs = source.springs;
    this.walls = source.walls;
    this.loadCaseCount = Math.max(1, source.loadCaseCount);
    this.loadCaseIndex = Math.min(Math.max(0, source.loadCaseIndex), this.loadCaseCount - 1);
    this.calcCaseMemo = source.calcCaseMemo;
    this.loadCases = source.loadCases;
    this.loadCombinations = source.loadCombinations;
    this.analysisMetadata = source.analysisMetadata;
    this.ensureLoadCaseMetadata();
    this.synchronizeBoundaryConditions();
    if (notify) this.notifyChange();
  }

  /** 新しい節点番号を取得 */
  get newNodeNumber(): number {
    const reserved = this.getOrphanAnalysisTags('node');
    let number = this.nodes.reduce((max, node) => Math.max(max, node.number), 0) + 1;
    while (reserved.has(number)) number++;
    return number;
  }

  /** 新しい部材番号を取得 */
  get newMemberNumber(): number {
    const reserved = this.getOrphanAnalysisTags('member');
    let number = this.members.reduce((max, member) => Math.max(max, member.number), 0) + 1;
    while (reserved.has(number)) number++;
    return number;
  }

  /** 予約番号1,2を除いた新しいカスタムバネ番号を取得 */
  get newSpringNumber(): number {
    const used = new Set(this.springs.map(spring => spring.number));
    let number = Spring.DEFAULT_SPRING_COUNT;
    while (used.has(number)) number++;
    return number;
  }

  /** 現在の全荷重ケースを初期化済みの節点を作る（配列への追加は行わない）。 */
  createNode(x: number = 0, y: number = 0, z: number = 0): Node {
    const node = new Node(x, y, z, this.loadCaseCount);
    node.number = this.newNodeNumber;
    return node;
  }

  /** 現在の全荷重ケースを初期化済みの部材を作る（配列への追加は行わない）。 */
  createMember(iNodeNumber: number = 0, jNodeNumber: number = 0): Member {
    const member = new Member(this.loadCaseCount);
    member.number = this.newMemberNumber;
    member.iNodeNumber = iNodeNumber;
    member.jNodeNumber = jNodeNumber;
    return member;
  }

  createSpring(): Spring {
    const spring = new Spring();
    spring.number = this.newSpringNumber;
    return spring;
  }

  initializeNode(node: Node): Node {
    node.setLoadCaseCount(this.loadCaseCount);
    return node;
  }

  initializeMember(member: Member): Member {
    member.setLoadCaseCount(this.loadCaseCount);
    return member;
  }

  addNode(node: Node = this.createNode()): Node {
    this.initializeNode(node);
    if (node.number <= 0) node.number = this.newNodeNumber;
    this.nodes.push(node);
    this.notifyChange();
    return node;
  }

  addMember(member: Member = this.createMember()): Member {
    this.initializeMember(member);
    if (member.number <= 0) member.number = this.newMemberNumber;
    this.members.push(member);
    this.notifyChange();
    return member;
  }

  addSpring(spring: Spring = this.createSpring()): Spring {
    if (spring.number <= 0) spring.number = this.newSpringNumber;
    if (Spring.isReservedNumber(spring.number)) {
      throw new Error(`Spring numbers 1 and 2 are reserved; got ${spring.number}.`);
    }
    if (this.springs.some(existing => existing.number === spring.number)) {
      throw new Error(`Spring number ${spring.number} already exists.`);
    }
    this.springs.push(spring);
    this.notifyChange();
    return spring;
  }

  /** 番号から節点を検索 */
  findNodeByNumber(number: number): Node | undefined {
    return this.nodes.find(n => n.number === number);
  }

  /** 番号から部材を検索 */
  findMemberByNumber(number: number): Member | undefined {
    return this.members.find(member => member.number === number);
  }

  /** 番号からバネを検索 */
  findSpringByNumber(number: number): Spring | undefined {
    if (number === 0) return undefined;
    if (number === Spring.RIGID.number) return Spring.RIGID;
    if (number === Spring.PIN.number) return Spring.PIN;
    return this.springs.find(s => s.number === number);
  }

  findSectionByNumber(number: number): Section | undefined {
    return this.sections.find(s => s.number === number);
  }

  findMaterialByNumber(number: number): Material | undefined {
    return this.materials.find(m => m.number === number);
  }

  private remapReferences(maps: Partial<RenumberResult>): void {
    for (const member of this.members) {
      member.iNodeNumber = remap(member.iNodeNumber, maps.nodes);
      member.jNodeNumber = remap(member.jNodeNumber, maps.nodes);
      member.sectionNumber = remap(member.sectionNumber, maps.sections);
      member.ixSpring = remap(member.ixSpring, maps.springs);
      member.iySpring = remap(member.iySpring, maps.springs);
      member.izSpring = remap(member.izSpring, maps.springs);
      member.jxSpring = remap(member.jxSpring, maps.springs);
      member.jySpring = remap(member.jySpring, maps.springs);
      member.jzSpring = remap(member.jzSpring, maps.springs);
    }
    for (const boundary of this.boundaries) {
      boundary.nodeNumber = remap(boundary.nodeNumber, maps.nodes);
    }
    for (const wall of this.walls) {
      wall.leftBottomNode = remap(wall.leftBottomNode, maps.nodes);
      wall.rightBottomNode = remap(wall.rightBottomNode, maps.nodes);
      wall.leftTopNode = remap(wall.leftTopNode, maps.nodes);
      wall.rightTopNode = remap(wall.rightTopNode, maps.nodes);
      wall.materialNumber = remap(wall.materialNumber, maps.materials);
    }
    for (const section of this.sections) {
      section.materialNumber = remap(section.materialNumber, maps.materials);
    }

    const metadata = this.analysisMetadata;
    if (metadata) {
      for (const constraint of metadata.constraints) {
        constraint.retainedNode = remap(constraint.retainedNode, maps.nodes);
        constraint.constrainedNode = remap(constraint.constrainedNode, maps.nodes);
      }
      for (const mass of metadata.nodalMasses) mass.nodeTag = remap(mass.nodeTag, maps.nodes);
      for (const link of metadata.linkElements) {
        link.nodeI = remap(link.nodeI, maps.nodes);
        link.nodeJ = remap(link.nodeJ, maps.nodes);
        link.tag = remap(link.tag, maps.members);
      }
      if (maps.members) {
        const localAxes: AnalysisMetadata['localAxes'] = {};
        for (const [tag, axis] of Object.entries(metadata.localAxes)) {
          const numericTag = Number(tag);
          const nextTag = Number.isInteger(numericTag)
            ? String(remap(numericTag, maps.members))
            : tag;
          localAxes[nextTag] = axis;
        }
        metadata.localAxes = localAxes;
      }
      for (const group of metadata.groups) {
        group.nodeTags = group.nodeTags.map(number => remap(number, maps.nodes));
        group.elementTags = group.elementTags.map(number => remap(number, maps.members));
      }
    }
  }

  private cleanupAnalysisMetadataAfterNodeMerge(removedMemberNumbers: readonly number[]): void {
    const metadata = this.analysisMetadata;
    if (!metadata) return;

    metadata.constraints = metadata.constraints.filter(
      constraint => constraint.retainedNode !== constraint.constrainedNode,
    );

    const massesByNode = new Map<number, AnalysisMetadata['nodalMasses'][number]>();
    const nodalMasses: AnalysisMetadata['nodalMasses'] = [];
    for (const mass of metadata.nodalMasses) {
      const existing = massesByNode.get(mass.nodeTag);
      if (!existing) {
        massesByNode.set(mass.nodeTag, mass);
        nodalMasses.push(mass);
        continue;
      }
      const valueCount = Math.max(existing.values.length, mass.values.length);
      existing.values = Array.from(
        { length: valueCount },
        (_, index) => (existing.values[index] ?? 0) + (mass.values[index] ?? 0),
      );
    }
    metadata.nodalMasses = nodalMasses;

    const removedElementTags = new Set(removedMemberNumbers);
    metadata.linkElements = metadata.linkElements.filter(link => {
      const keep = link.nodeI !== link.nodeJ && !removedElementTags.has(link.tag);
      if (!keep) removedElementTags.add(link.tag);
      return keep;
    });
    for (const tag of removedElementTags) delete metadata.localAxes[String(tag)];

    for (const group of metadata.groups) {
      group.nodeTags = [...new Set(group.nodeTags)];
      group.elementTags = [
        ...new Set(group.elementTags.filter(tag => !removedElementTags.has(tag))),
      ];
    }
  }

  private getOrphanAnalysisTags(kind: 'node' | 'member'): Set<number> {
    const metadata = this.analysisMetadata;
    if (!metadata) return new Set();
    const referenced = new Set<number>();
    if (kind === 'node') {
      for (const constraint of metadata.constraints) {
        referenced.add(constraint.retainedNode);
        referenced.add(constraint.constrainedNode);
      }
      for (const mass of metadata.nodalMasses) referenced.add(mass.nodeTag);
      for (const link of metadata.linkElements) {
        referenced.add(link.nodeI);
        referenced.add(link.nodeJ);
      }
      for (const group of metadata.groups) {
        for (const tag of group.nodeTags) referenced.add(tag);
      }
      const owned = new Set(this.nodes.map(node => node.number));
      return new Set([...referenced].filter(tag => Number.isInteger(tag) && tag > 0 && !owned.has(tag)));
    }
    for (const link of metadata.linkElements) referenced.add(link.tag);
    for (const tag of Object.keys(metadata.localAxes).map(Number)) {
      if (Number.isInteger(tag)) referenced.add(tag);
    }
    for (const group of metadata.groups) {
      for (const tag of group.elementTags) referenced.add(tag);
    }
    const owned = new Set(this.members.map(member => member.number));
    return new Set([...referenced].filter(tag => Number.isInteger(tag) && tag > 0 && !owned.has(tag)));
  }

  /** 全エンティティを再採番し、外部参照を同一操作内で追従させる。 */
  assignNumbers(): RenumberResult {
    if (this.springs.some(spring => Spring.isReservedNumber(spring.number))) {
      throw new Error('Cannot renumber: a custom spring uses reserved number 1 or 2.');
    }

    const maps: RenumberResult = {
      nodes: makeNumberMap(this.nodes, 1, 'node', this.getOrphanAnalysisTags('node')),
      materials: makeNumberMap(this.materials, 1, 'material'),
      sections: makeNumberMap(this.sections, 1, 'section'),
      springs: makeNumberMap(this.springs, Spring.DEFAULT_SPRING_COUNT, 'spring'),
      members: makeNumberMap(this.members, 1, 'member', this.getOrphanAnalysisTags('member')),
      walls: makeNumberMap(this.walls, 1, 'wall'),
    };

    this.remapReferences(maps);
    for (const node of this.nodes) node.number = maps.nodes.get(node.number)!;
    for (const material of this.materials) material.number = maps.materials.get(material.number)!;
    for (const section of this.sections) section.number = maps.sections.get(section.number)!;
    for (const spring of this.springs) spring.number = maps.springs.get(spring.number)!;
    for (const member of this.members) member.number = maps.members.get(member.number)!;
    for (const wall of this.walls) wall.number = maps.walls.get(wall.number)!;
    this.synchronizeBoundaryConditions();
    this.notifyChange();
    return maps;
  }

  /** 単一番号を安全に変更し、関連する全参照を追従させる。 */
  changeEntityNumber(kind: NumberedEntityKind, oldNumber: number, newNumber: number): void {
    if (!Number.isInteger(newNumber) || newNumber <= 0) {
      throw new Error(`New ${kind} number must be a positive integer.`);
    }
    const collection: Array<{ number: number }> = kind === 'node' ? this.nodes
      : kind === 'member' ? this.members
      : kind === 'section' ? this.sections
      : kind === 'material' ? this.materials
      : kind === 'spring' ? this.springs
      : this.walls;
    const entity = collection.find(item => item.number === oldNumber);
    if (!entity) throw new Error(`${kind} number ${oldNumber} does not exist.`);
    if (oldNumber === newNumber) return;
    if (collection.some(item => item.number === newNumber)) {
      throw new Error(`${kind} number ${newNumber} already exists.`);
    }
    if (kind === 'spring' && Spring.isReservedNumber(newNumber)) {
      throw new Error(`Spring numbers 1 and 2 are reserved; got ${newNumber}.`);
    }
    if (
      (kind === 'node' || kind === 'member')
      && this.getOrphanAnalysisTags(kind).has(newNumber)
    ) {
      throw new Error(`${kind} number ${newNumber} is reserved by retained analysis metadata.`);
    }

    const map = new Map([[oldNumber, newNumber]]);
    this.remapReferences({ [`${kind}s`]: map } as Partial<RenumberResult>);
    entity.number = newNumber;
    this.synchronizeBoundaryConditions();
    this.notifyChange();
  }

  /** 節点・部材を表示順にソートする。番号と参照は変更しない。 */
  sort(): void {
    this.nodes.sort((a, b) => a.compareTo(b));
    const nodeMap = new Map(this.nodes.map(node => [node.number, node] as const));
    this.members.sort((a, b) => {
      const nodeA = nodeMap.get(a.iNodeNumber);
      const nodeB = nodeMap.get(b.iNodeNumber);
      if (!nodeA || !nodeB) return 0;
      if (nodeA.z !== nodeB.z) return nodeA.z - nodeB.z;
      return a.iNodeNumber - b.iNodeNumber;
    });
    this.notifyChange();
  }

  private ensureLoadCaseMetadata(): void {
    this.loadCaseCount = Math.max(1, Math.trunc(this.loadCaseCount));
    const used = new Set(this.loadCases.map(loadCase => loadCase.id));
    while (this.loadCases.length < this.loadCaseCount) {
      const id = nextStableId('LC', used);
      used.add(id);
      this.loadCases.push(new LoadCase(id, `Load Case ${this.loadCases.length + 1}`));
    }
    if (this.loadCases.length > this.loadCaseCount) this.loadCases.length = this.loadCaseCount;
    if (this.loadCases.length === 0) this.loadCases.push(new LoadCase('LC1', 'Load Case 1'));
    this.loadCaseCount = this.loadCases.length;
    this.loadCaseIndex = Math.min(Math.max(0, this.loadCaseIndex), this.loadCaseCount - 1);
    for (const node of this.nodes) node.setLoadCaseCount(this.loadCaseCount);
    for (const member of this.members) member.setLoadCaseCount(this.loadCaseCount);
  }

  setLoadCaseCount(count: number): void {
    const normalized = Math.max(1, Math.trunc(count));
    this.loadCaseCount = normalized;
    this.ensureLoadCaseMetadata();
    this.notifyChange();
  }

  /** 荷重定義を追加 */
  addLoadCase(values: Partial<Pick<LoadCase, 'id' | 'name' | 'type' | 'memo'>> = {}): LoadCase {
    this.ensureLoadCaseMetadata();
    const id = values.id?.trim() || nextStableId('LC', this.loadCases.map(loadCase => loadCase.id));
    if (this.loadCases.some(loadCase => loadCase.id === id)) {
      throw new Error(`Load case id "${id}" already exists.`);
    }
    const loadCase = new LoadCase(
      id,
      values.name?.trim() || `Load Case ${this.loadCases.length + 1}`,
      values.type || LoadCaseType.Other,
      values.memo || '',
    );
    this.loadCases.push(loadCase);
    this.loadCaseCount = this.loadCases.length;
    for (const node of this.nodes) node.setLoadCaseCount(this.loadCaseCount);
    for (const member of this.members) member.setLoadCaseCount(this.loadCaseCount);
    this.notifyChange();
    return loadCase;
  }

  /** 最低1件を保証して荷重定義を削除する。削除できた場合のみtrue。 */
  removeLoadCase(index: number): boolean {
    this.ensureLoadCaseMetadata();
    if (index < 0 || index >= this.loadCaseCount || this.loadCaseCount <= 1) return false;
    const [removed] = this.loadCases.splice(index, 1);
    for (const node of this.nodes) node.removeLoad(index);
    for (const member of this.members) member.removeLoad(index);
    for (const combination of this.loadCombinations) {
      combination.terms = combination.terms.filter(term => term.loadCaseId !== removed.id);
    }
    this.loadCaseCount = this.loadCases.length;
    if (this.loadCaseIndex > index) this.loadCaseIndex--;
    else if (this.loadCaseIndex >= this.loadCaseCount) this.loadCaseIndex = this.loadCaseCount - 1;
    this.notifyChange();
    return true;
  }

  duplicateLoadCase(index: number, name?: string): LoadCase {
    this.ensureLoadCaseMetadata();
    if (index < 0 || index >= this.loadCaseCount) throw new Error(`Load case index ${index} is out of range.`);
    const source = this.loadCases[index];
    const copy = new LoadCase(
      nextStableId('LC', this.loadCases.map(loadCase => loadCase.id)),
      name?.trim() || `${source.name} Copy`,
      source.type,
      source.memo,
    );
    this.loadCases.splice(index + 1, 0, copy);
    for (const node of this.nodes) node.loads.splice(index + 1, 0, cloneNodeLoad(node.loads[index]));
    for (const member of this.members) {
      member.memberLoads.splice(index + 1, 0, cloneMemberLoad(member.memberLoads[index]));
      member.cmqLoads.splice(index + 1, 0, cloneCMQLoad(member.cmqLoads[index]));
    }
    this.loadCaseCount = this.loadCases.length;
    this.notifyChange();
    return copy;
  }

  moveLoadCase(fromIndex: number, toIndex: number): void {
    this.ensureLoadCaseMetadata();
    if (fromIndex < 0 || fromIndex >= this.loadCaseCount || toIndex < 0 || toIndex >= this.loadCaseCount) {
      throw new Error('Load case move index is out of range.');
    }
    if (fromIndex === toIndex) return;
    const selectedId = this.loadCases[this.loadCaseIndex]?.id;
    const move = <T>(items: T[]): void => {
      const [item] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, item);
    };
    move(this.loadCases);
    for (const node of this.nodes) move(node.loads);
    for (const member of this.members) {
      move(member.memberLoads);
      move(member.cmqLoads);
    }
    this.loadCaseIndex = Math.max(0, this.loadCases.findIndex(loadCase => loadCase.id === selectedId));
    this.notifyChange();
  }

  addLoadCombination(
    name: string,
    terms: LoadCombinationTerm[] = [],
    id?: string,
    memo: string = '',
  ): LoadCombination {
    const combinationId = id?.trim() || nextStableId('COMB', this.loadCombinations.map(item => item.id));
    if (this.loadCombinations.some(item => item.id === combinationId)) {
      throw new Error(`Load combination id "${combinationId}" already exists.`);
    }
    const knownCases = new Set(this.loadCases.map(loadCase => loadCase.id));
    if (terms.some(term => !knownCases.has(term.loadCaseId) || !Number.isFinite(term.factor))) {
      throw new Error('Load combination contains an unknown load case or non-finite factor.');
    }
    const combination = new LoadCombination(combinationId, name, terms, memo);
    this.loadCombinations.push(combination);
    this.notifyChange();
    return combination;
  }

  /** boundariesを正とし、節点側参照を同期する。 */
  synchronizeBoundaryConditions(): void {
    for (const node of this.nodes) node.boundaryCondition = null;
    const nodeMap = new Map(this.nodes.map(node => [node.number, node] as const));
    for (const boundary of this.boundaries) {
      const node = nodeMap.get(boundary.nodeNumber);
      if (node && node.boundaryCondition === null) node.boundaryCondition = boundary;
    }
  }

  /**
   * 近接節点を推移的に統合する。
   * 荷重・重量・面積は加算、支持DOFは論理和、温度/強度グループ競合は代表値優先で報告する。
   */
  mergeOverlappingNodes(
    threshold: number,
    options: MergeOverlappingNodesOptions = {},
  ): MergeOverlappingNodesResult {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('Node merge threshold must be a finite non-negative number.');
    }
    const parent = this.nodes.map((_, index) => index);
    const find = (index: number): number => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
      }
      return index;
    };
    const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
    };

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const dx = this.nodes[i].x - this.nodes[j].x;
        const dy = this.nodes[i].y - this.nodes[j].y;
        const dz = this.nodes[i].z - this.nodes[j].z;
        if (Math.hypot(dx, dy, dz) <= threshold) union(i, j);
      }
    }

    const components = new Map<number, number[]>();
    for (let index = 0; index < this.nodes.length; index++) {
      const root = find(index);
      const component = components.get(root) ?? [];
      component.push(index);
      components.set(root, component);
    }

    const representativeByNodeNumber = new Map<number, number>();
    for (const indexes of components.values()) {
      const representativeNumber = this.nodes[indexes[0]].number;
      for (const index of indexes) {
        const nodeNumber = this.nodes[index].number;
        // Invalid external documents can contain duplicate numbers. References
        // are inherently ambiguous, so keep the first component as canonical
        // instead of throwing or allowing a later component to overwrite it.
        if (!representativeByNodeNumber.has(nodeNumber)) {
          representativeByNodeNumber.set(nodeNumber, representativeNumber);
        }
      }
    }
    const mergedNodeCount = this.nodes.length - components.size;
    if (mergedNodeCount === 0) {
      return {
        mergedNodeCount: 0,
        representativeByNodeNumber,
        removedMemberNumbers: [],
        degenerateWallNumbers: [],
        conflicts: [],
      };
    }

    const conflicts: NodeMergeConflict[] = [];
    const mergeScalar = (
      representative: Node,
      source: Node,
      field: 'temperature' | 'intensityGroup',
    ): void => {
      const kept = representative[field];
      const incoming = source[field];
      if (kept === 0) representative[field] = incoming;
      else if (incoming !== 0 && incoming !== kept) {
        conflicts.push({
          representativeNumber: representative.number,
          mergedNumber: source.number,
          field,
          keptValue: kept,
          discardedValue: incoming,
        });
      }
    };

    for (const indexes of components.values()) {
      const representative = this.nodes[indexes[0]];
      representative.setLoadCaseCount(this.loadCaseCount);
      for (const index of indexes.slice(1)) {
        const source = this.nodes[index];
        source.setLoadCaseCount(this.loadCaseCount);
        mergeScalar(representative, source, 'temperature');
        mergeScalar(representative, source, 'intensityGroup');
        representative.longWeight += source.longWeight;
        representative.forceWeight += source.forceWeight;
        representative.addForceWeight += source.addForceWeight;
        representative.area += source.area;
        representative.selected ||= source.selected;
        representative.isShown ||= source.isShown;
        for (let caseIndex = 0; caseIndex < this.loadCaseCount; caseIndex++) {
          const targetLoad = representative.loads[caseIndex];
          const sourceLoad = source.loads[caseIndex];
          targetLoad.p1 += sourceLoad.p1;
          targetLoad.p2 += sourceLoad.p2;
          targetLoad.p3 += sourceLoad.p3;
          targetLoad.m1 += sourceLoad.m1;
          targetLoad.m2 += sourceLoad.m2;
          targetLoad.m3 += sourceLoad.m3;
        }
      }
    }

    const boundarySources: BoundaryCondition[] = [...this.boundaries];
    for (const node of this.nodes) {
      if (node.boundaryCondition && !boundarySources.includes(node.boundaryCondition)) {
        boundarySources.push(node.boundaryCondition);
      }
    }
    const mergedBoundaries = new Map<number, BoundaryCondition>();
    for (const source of boundarySources) {
      const nodeNumber = representativeByNodeNumber.get(source.nodeNumber) ?? source.nodeNumber;
      let target = mergedBoundaries.get(nodeNumber);
      if (!target) {
        target = new BoundaryCondition();
        target.nodeNumber = nodeNumber;
        mergedBoundaries.set(nodeNumber, target);
      }
      target.deltaX = Math.max(target.deltaX, source.deltaX);
      target.deltaY = Math.max(target.deltaY, source.deltaY);
      target.deltaZ = Math.max(target.deltaZ, source.deltaZ);
      target.thetaX = Math.max(target.thetaX, source.thetaX);
      target.thetaY = Math.max(target.thetaY, source.thetaY);
      target.thetaZ = Math.max(target.thetaZ, source.thetaZ);
    }

    this.remapReferences({ nodes: representativeByNodeNumber });
    const removedMemberNumbers: number[] = [];
    if (options.removeDegenerateMembers !== false) {
      this.members = this.members.filter(member => {
        if (member.iNodeNumber !== member.jNodeNumber) return true;
        removedMemberNumbers.push(member.number);
        return false;
      });
    }
    this.cleanupAnalysisMetadataAfterNodeMerge(removedMemberNumbers);
    const degenerateWallNumbers = this.walls
      .filter(wall => new Set([
        wall.leftBottomNode,
        wall.rightBottomNode,
        wall.leftTopNode,
        wall.rightTopNode,
      ]).size < 4)
      .map(wall => wall.number);

    this.nodes = [...components.values()].map(indexes => this.nodes[indexes[0]]);
    this.boundaries = [...mergedBoundaries.values()];
    this.synchronizeBoundaryConditions();
    this.notifyChange();

    return {
      mergedNodeCount,
      representativeByNodeNumber,
      removedMemberNumbers,
      degenerateWallNumbers,
      conflicts,
    };
  }
}
