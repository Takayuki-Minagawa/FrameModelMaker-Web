import { BoundaryCondition } from '../models/BoundaryCondition';
import { CMQLoad } from '../models/CMQLoad';
import { FrameDocument, type NumberedEntityKind } from '../models/FrameDocument';
import { Material } from '../models/Material';
import { Member } from '../models/Member';
import { MemberLoad } from '../models/MemberLoad';
import { Node } from '../models/Node';
import { NodeLoad } from '../models/NodeLoad';
import { Section, SectionShape, SectionType } from '../models/Section';
import { Spring } from '../models/Spring';
import { Wall } from '../models/Wall';
import type { DataGridChange } from '../ui/DataGrid';
import type { ViewerSelection } from '../viewer/ViewerTypes';
import { localText, nextNumber } from './UiHelpers';

export interface NodeLoadRow {
  nodeNumber: number;
  p1: number;
  p2: number;
  p3: number;
  m1: number;
  m2: number;
  m3: number;
}

export interface CMQLoadRow {
  memberNumber: number;
  moy: number;
  moz: number;
  iMy: number;
  iMz: number;
  iQx: number;
  iQy: number;
  iQz: number;
  jMy: number;
  jMz: number;
  jQx: number;
  jQy: number;
  jQz: number;
}

export interface MemberLoadRow {
  memberNumber: number;
  lengthMethod: number;
  type: number;
  direction: number;
  scale: number;
  loadCode: string;
  unitLoad: number;
  p1: number;
  p2: number;
  p3: number;
}

export interface TabRows {
  nodes: Node;
  members: Member;
  boundaries: BoundaryCondition;
  materials: Material;
  sections: Section;
  springs: Spring;
  walls: Wall;
  nodeloads: NodeLoadRow;
  memberloads: MemberLoadRow;
  cmqloads: CMQLoadRow;
}
export type TabId = keyof TabRows;
export interface TabProvider<T extends object> {
  rows(): T[];
  add?(): T | null;
  remove?(rows: T[]): string | null;
  duplicate?(rows: T[]): T[];
  applyChanges?(change: DataGridChange<T>): void;
  selectionForRow?(row: T): ViewerSelection;
  indexForSelection?(rows: T[], selection: ViewerSelection): number;
  numberKind?: NumberedEntityKind;
}
export type TabProviders = { [K in TabId]: TabProvider<TabRows[K]> };

export function createTabProviders(doc: FrameDocument) {
  function removeByIdentity<T>(list: T[], selected: ReadonlyArray<T>): void {
    const selectedSet = new Set(selected);
    for (let index = list.length - 1; index >= 0; index--) {
      if (selectedSet.has(list[index])) list.splice(index, 1);
    }
  }

  function ensureDefaultSection(): Section {
    const existing = doc.sections[0];
    if (existing) return existing;
    const section = new Section();
    section.number = 1;
    section.type = SectionType.Other;
    section.shape = SectionShape.DirectInput;
    section.p1_A = 1;
    section.p2_Ix = 1;
    section.torsionConstant = 1;
    section.p3_Iy = 1;
    section.p4_Iz = 1;
    section.ky = 1;
    section.kz = 1;
    section.comment = localText('仮断面（要編集）', 'Placeholder section (edit required)');
    doc.sections.push(section);
    return section;
  }

  function numberSelection(kind: 'node' | 'member' | 'wall', number: number): ViewerSelection {
    if (kind === 'node') return { kind, nodeNumber: number };
    if (kind === 'member') return { kind, memberNumber: number };
    return { kind, wallNumber: number };
  }

  function entityProvider<T extends { number: number }>(configuration: {
    list: () => T[];
    add: () => T | null;
    kind: 'node' | 'member' | 'wall' | null;
    numberKind: NumberedEntityKind;
    dependencyError?: (selected: T[]) => string | null;
    duplicate: (selected: T[]) => T[];
  }): TabProvider<T> {
    return {
      rows: configuration.list,
      add: configuration.add,
      remove: (rows) => {
        const selected = rows;
        const error = configuration.dependencyError?.(selected) ?? null;
        if (error) return error;
        removeByIdentity(configuration.list(), selected);
        return null;
      },
      duplicate: (rows) => configuration.duplicate(rows),
      numberKind: configuration.numberKind,
      selectionForRow: configuration.kind
        ? (row) => numberSelection(configuration.kind!, (row as T).number)
        : undefined,
      indexForSelection: configuration.kind
        ? (rows, selection) =>
            rows.findIndex((row) => {
              const item = row as T;
              return (
                selection.kind === configuration.kind &&
                item.number ===
                  (selection.kind === 'node'
                    ? selection.nodeNumber
                    : selection.kind === 'member'
                      ? selection.memberNumber
                      : selection.wallNumber)
              );
            })
        : undefined,
    };
  }

  function cloneNode(source: Node): Node {
    const clone = doc.createNode(source.x, source.y, source.z);
    Object.assign(clone, source);
    clone.number = doc.newNodeNumber;
    clone.loads = source.loads.map((load) => Object.assign(new NodeLoad(), load));
    clone.boundaryCondition = null;
    clone.selected = false;
    doc.addNode(clone);
    const metadata = doc.analysisMetadata;
    if (metadata) {
      for (const mass of metadata.nodalMasses.filter((item) => item.nodeTag === source.number)) {
        metadata.nodalMasses.push({ ...cloneJsonData(mass), nodeTag: clone.number });
      }
      for (const group of metadata.groups) {
        if (group.nodeTags.includes(source.number) && !group.nodeTags.includes(clone.number)) {
          group.nodeTags.push(clone.number);
        }
      }
    }
    return clone;
  }

  function cloneMember(source: Member): Member {
    const clone = doc.createMember();
    Object.assign(clone, source);
    clone.number = doc.newMemberNumber;
    const metadata = doc.analysisMetadata;
    if (metadata) {
      const reservedTags = new Set([
        ...metadata.linkElements.map((link) => link.tag),
        ...Object.keys(metadata.localAxes).map(Number).filter(Number.isFinite),
      ]);
      while (reservedTags.has(clone.number)) clone.number++;
    }
    clone.memberLoads = source.memberLoads.map((load) => Object.assign(new MemberLoad(), load));
    clone.cmqLoads = source.cmqLoads.map((load) => Object.assign(new CMQLoad(), load));
    clone.selected = false;
    doc.addMember(clone);
    if (metadata) {
      const axis = metadata.localAxes[String(source.number)];
      if (axis) metadata.localAxes[String(clone.number)] = cloneJsonData(axis);
      for (const link of metadata.linkElements.filter((item) => item.tag === source.number)) {
        metadata.linkElements.push({ ...cloneJsonData(link), tag: clone.number });
      }
      for (const group of metadata.groups) {
        if (group.elementTags.includes(source.number) && !group.elementTags.includes(clone.number)) {
          group.elementTags.push(clone.number);
        }
      }
    }
    return clone;
  }

  function cloneJsonData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function loadRows(): NodeLoadRow[] {
    return doc.nodes.map((node) => {
      const load = node.getLoad(doc.loadCaseIndex);
      return {
        nodeNumber: node.number,
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
        m1: load.m1,
        m2: load.m2,
        m3: load.m3,
      };
    });
  }

  function cmqRows(): CMQLoadRow[] {
    return doc.members.map((member) => {
      const load = member.getCMQLoad(doc.loadCaseIndex);
      return {
        memberNumber: member.number,
        moy: load.moy,
        moz: load.moz,
        iMy: load.iMy,
        iMz: load.iMz,
        iQx: load.iQx,
        iQy: load.iQy,
        iQz: load.iQz,
        jMy: load.jMy,
        jMz: load.jMz,
        jQx: load.jQx,
        jQy: load.jQy,
        jQz: load.jQz,
      };
    });
  }

  function memberLoadRows(): MemberLoadRow[] {
    return doc.members.map((member) => {
      const load = member.getMemberLoad(doc.loadCaseIndex);
      return {
        memberNumber: member.number,
        lengthMethod: load.lengthMethod,
        type: load.type,
        direction: load.direction,
        scale: load.scale,
        loadCode: load.loadCode,
        unitLoad: load.unitLoad,
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
      };
    });
  }

  function applyLoadChanges<T extends { nodeNumber?: number; memberNumber?: number }>(
    change: DataGridChange<T>,
    resolve: (row: T) => object | undefined,
  ): void {
    for (const cell of change.changes) {
      const row = cell.row;
      const target = resolve(row) as Record<string, unknown> | undefined;
      if (target) target[cell.columnKey as string] = cell.value;
    }
  }

  const tabProviders: TabProviders = {
    nodes: entityProvider<Node>({
      list: () => doc.nodes,
      add: () => doc.addNode(),
      kind: 'node',
      numberKind: 'node',
      dependencyError: (selected) => {
        const numbers = new Set(selected.map((node) => node.number));
        const member = doc.members.find(
          (item) => numbers.has(item.iNodeNumber) || numbers.has(item.jNodeNumber),
        );
        const wall = doc.walls.find((item) =>
          [item.leftBottomNode, item.rightBottomNode, item.leftTopNode, item.rightTopNode].some((number) =>
            numbers.has(number),
          ),
        );
        const boundary = doc.boundaries.find((item) => numbers.has(item.nodeNumber));
        const metadata = doc.analysisMetadata;
        const metadataReference =
          metadata &&
          (metadata.constraints.some(
            (item) => numbers.has(item.retainedNode) || numbers.has(item.constrainedNode),
          ) ||
            metadata.nodalMasses.some((item) => numbers.has(item.nodeTag)) ||
            metadata.linkElements.some((item) => numbers.has(item.nodeI) || numbers.has(item.nodeJ)) ||
            metadata.groups.some((item) => item.nodeTags.some((number) => numbers.has(number))));
        if (!member && !wall && !boundary && !metadataReference) return null;
        return localText(
          '部材・壁・境界条件・解析メタデータから参照されている節点は削除できません。先に参照元を削除してください。',
          'Referenced nodes cannot be deleted. Remove members, walls, boundaries, and analysis metadata first.',
        );
      },
      duplicate: (selected) => selected.map(cloneNode),
    }),
    boundaries: {
      rows: () => doc.boundaries,
      add: () => {
        const used = new Set(doc.boundaries.map((boundary) => boundary.nodeNumber));
        const node = doc.nodes.find((item) => !used.has(item.number));
        if (!node) return null;
        const boundary = new BoundaryCondition();
        boundary.nodeNumber = node.number;
        doc.boundaries.push(boundary);
        return boundary;
      },
      remove: (rows) => {
        removeByIdentity(doc.boundaries, rows as BoundaryCondition[]);
        return null;
      },
      duplicate: () => [],
      selectionForRow: (row) => ({ kind: 'node', nodeNumber: (row as BoundaryCondition).nodeNumber }),
      indexForSelection: (rows, selection) =>
        selection.kind === 'node'
          ? rows.findIndex((row) => (row as BoundaryCondition).nodeNumber === selection.nodeNumber)
          : -1,
    },
    materials: entityProvider<Material>({
      list: () => doc.materials,
      add: () => {
        const material = new Material();
        material.number = nextNumber(doc.materials);
        material.name = localText('新規材料', 'New material');
        doc.materials.push(material);
        return material;
      },
      kind: null,
      numberKind: 'material',
      dependencyError: (selected) => {
        const numbers = new Set(selected.map((item) => item.number));
        return doc.sections.some((section) => numbers.has(section.materialNumber)) ||
          doc.walls.some((wall) => numbers.has(wall.materialNumber))
          ? localText(
              '断面または壁から参照されている材料は削除できません。',
              'Materials referenced by sections or walls cannot be deleted.',
            )
          : null;
      },
      duplicate: (selected) =>
        selected.map((source) => {
          const clone = Object.assign(new Material(), source);
          clone.number = nextNumber(doc.materials);
          clone.name = `${source.name} Copy`;
          doc.materials.push(clone);
          return clone;
        }),
    }),
    sections: entityProvider<Section>({
      list: () => doc.sections,
      add: () => {
        if (doc.sections.length === 0) return ensureDefaultSection();
        const section = new Section();
        section.number = nextNumber(doc.sections);
        section.materialNumber = doc.materials[0]?.number ?? 0;
        if (section.materialNumber === 0) section.type = SectionType.Other;
        doc.sections.push(section);
        return section;
      },
      kind: null,
      numberKind: 'section',
      dependencyError: (selected) => {
        const numbers = new Set(selected.map((item) => item.number));
        return doc.members.some((member) => numbers.has(member.sectionNumber))
          ? localText(
              '部材から参照されている断面は削除できません。',
              'Sections referenced by members cannot be deleted.',
            )
          : null;
      },
      duplicate: (selected) =>
        selected.map((source) => {
          const clone = Object.assign(new Section(), source);
          clone.number = nextNumber(doc.sections);
          clone.comment = `${source.comment} Copy`.trim();
          doc.sections.push(clone);
          return clone;
        }),
    }),
    springs: entityProvider<Spring>({
      list: () => doc.springs,
      add: () => doc.addSpring(),
      kind: null,
      numberKind: 'spring',
      dependencyError: (selected) => {
        const numbers = new Set(selected.map((item) => item.number));
        return doc.members.some((member) =>
          [
            member.ixSpring,
            member.iySpring,
            member.izSpring,
            member.jxSpring,
            member.jySpring,
            member.jzSpring,
          ].some((number) => numbers.has(number)),
        )
          ? localText(
              '部材から参照されているバネは削除できません。',
              'Springs referenced by members cannot be deleted.',
            )
          : null;
      },
      duplicate: (selected) =>
        selected.map((source) => {
          const clone = Object.assign(doc.createSpring(), source);
          clone.number = doc.newSpringNumber;
          doc.addSpring(clone);
          return clone;
        }),
    }),
    members: entityProvider<Member>({
      list: () => doc.members,
      add: () => {
        if (doc.nodes.length < 2) return null;
        const member = doc.createMember();
        member.iNodeNumber = doc.nodes[0].number;
        member.jNodeNumber = doc.nodes[1].number;
        member.sectionNumber = ensureDefaultSection().number;
        return doc.addMember(member);
      },
      kind: 'member',
      numberKind: 'member',
      dependencyError: (selected) => {
        const numbers = new Set(selected.map((item) => item.number));
        const metadata = doc.analysisMetadata;
        return metadata &&
          (metadata.linkElements.some((item) => numbers.has(item.tag)) ||
            metadata.groups.some((item) => item.elementTags.some((number) => numbers.has(number))))
          ? localText(
              '解析メタデータから参照されている部材は削除できません。',
              'Members referenced by analysis metadata cannot be deleted.',
            )
          : null;
      },
      duplicate: (selected) => selected.map(cloneMember),
    }),
    walls: entityProvider<Wall>({
      list: () => doc.walls,
      add: () => {
        if (doc.nodes.length < 4) return null;
        const wall = new Wall();
        wall.number = nextNumber(doc.walls);
        [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode] = doc.nodes
          .slice(0, 4)
          .map((node) => node.number);
        wall.materialNumber = doc.materials[0]?.number ?? 0;
        doc.walls.push(wall);
        return wall;
      },
      kind: 'wall',
      numberKind: 'wall',
      duplicate: (selected) =>
        selected.map((source) => {
          const clone = Object.assign(new Wall(), source);
          clone.number = nextNumber(doc.walls);
          doc.walls.push(clone);
          return clone;
        }),
    }),
    nodeloads: {
      rows: loadRows,
      applyChanges: (change) =>
        applyLoadChanges<NodeLoadRow>(change, (row) =>
          doc.findNodeByNumber(row.nodeNumber)?.getLoad(doc.loadCaseIndex),
        ),
      selectionForRow: (row) => ({ kind: 'node', nodeNumber: (row as NodeLoadRow).nodeNumber }),
      indexForSelection: (rows, selection) =>
        selection.kind === 'node'
          ? rows.findIndex((row) => (row as NodeLoadRow).nodeNumber === selection.nodeNumber)
          : -1,
    },
    cmqloads: {
      rows: cmqRows,
      applyChanges: (change) =>
        applyLoadChanges<CMQLoadRow>(change, (row) =>
          doc.members.find((member) => member.number === row.memberNumber)?.getCMQLoad(doc.loadCaseIndex),
        ),
      selectionForRow: (row) => ({ kind: 'member', memberNumber: (row as CMQLoadRow).memberNumber }),
      indexForSelection: (rows, selection) =>
        selection.kind === 'member'
          ? rows.findIndex((row) => (row as CMQLoadRow).memberNumber === selection.memberNumber)
          : -1,
    },
    memberloads: {
      rows: memberLoadRows,
      applyChanges: (change) =>
        applyLoadChanges<MemberLoadRow>(change, (row) =>
          doc.members.find((member) => member.number === row.memberNumber)?.getMemberLoad(doc.loadCaseIndex),
        ),
      selectionForRow: (row) => ({ kind: 'member', memberNumber: (row as MemberLoadRow).memberNumber }),
      indexForSelection: (rows, selection) =>
        selection.kind === 'member'
          ? rows.findIndex((row) => (row as MemberLoadRow).memberNumber === selection.memberNumber)
          : -1,
    },
  };

  return { tabProviders, ensureDefaultSection, cloneNode, cloneMember };
}
