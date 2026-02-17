import { FrameDocument } from '../models/FrameDocument';
import { Node } from '../models/Node';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { Material } from '../models/Material';
import { Section, SectionType, SectionShape } from '../models/Section';
import { Spring } from '../models/Spring';
import { Member } from '../models/Member';
import { Wall } from '../models/Wall';

/** パースエラー（行番号・セクション情報付き） */
export class ParseError extends Error {
  constructor(
    public readonly section: string,
    public readonly lineNumber: number,
    message: string,
  ) {
    super(`[${section}] 行${lineNumber}: ${message}`);
    this.name = 'ParseError';
  }
}

/** パース用カーソル（参照渡しで行位置を共有するため） */
class Cursor {
  pos = 0;
  constructor(private lines: string[]) {}

  /** 現在の行番号（1始まり） */
  get lineNumber(): number {
    return this.pos;
  }

  nextLine(): string {
    if (this.pos >= this.lines.length) return '';
    return this.lines[this.pos++];
  }

  peekLine(): string {
    if (this.pos >= this.lines.length) return '';
    return this.lines[this.pos];
  }

  get hasMore(): boolean {
    return this.pos < this.lines.length;
  }

  get prevLineTrimmed(): string {
    return this.lines[this.pos - 1]?.trim() ?? '';
  }

  get currentLineTrimmed(): string {
    return this.lines[this.pos]?.trim() ?? '';
  }
}

function parseFloat_(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '') return 0;
  const val = parseFloat(trimmed);
  return isNaN(val) ? 0 : val;
}

function parseInt_(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '') return 0;
  const val = parseInt(trimmed, 10);
  return isNaN(val) ? 0 : val;
}

// ===== セクション別パース関数 =====

function parseHeader(cursor: Cursor, doc: FrameDocument): void {
  const startLine = cursor.nextLine();
  if (!startLine.trim().startsWith('START')) {
    throw new ParseError('START', cursor.lineNumber, `"START" が必要ですが "${startLine.trim()}" が見つかりました`);
  }

  const titleHeader = cursor.nextLine();
  if (titleHeader.trim() !== 'TITLE') {
    throw new ParseError('TITLE', cursor.lineNumber, `"TITLE" が必要ですが "${titleHeader.trim()}" が見つかりました`);
  }
  const titleLine = cursor.nextLine();
  doc.title = titleLine.replace(/^"/, '').replace(/"$/, '');

  const controlHeader = cursor.nextLine();
  if (controlHeader.trim() !== 'CONTROL') {
    throw new ParseError('CONTROL', cursor.lineNumber, `"CONTROL" が必要ですが "${controlHeader.trim()}" が見つかりました`);
  }
  cursor.nextLine(); // skip control data

  // M-CONTROL → NODE までスキップ
  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'NODE') break;
  }
}

function parseNodes(cursor: Cursor, doc: FrameDocument): Map<number, Node> {
  const nodeDict = new Map<number, Node>();

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'BOUNDARY') break;

    const split = line.split(',');
    if (split.length < 4) continue;

    const number = parseInt_(split[0]);
    const x = parseFloat_(split[1]);
    const y = parseFloat_(split[2]);
    const z = parseFloat_(split[3]);

    const node = new Node(x, y, z);
    node.number = number;
    doc.nodes.push(node);
    nodeDict.set(number, node);
  }

  return nodeDict;
}

function parseBoundaries(cursor: Cursor, doc: FrameDocument, nodeDict: Map<number, Node>): void {
  cursor.nextLine(); // skip "1,"""

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'MATERIAL') break;

    const split = line.split(',');
    if (split.length < 7) continue;

    const nodeNum = parseInt_(split[0]);
    const bound = new BoundaryCondition();
    bound.nodeNumber = nodeNum;
    bound.deltaX = parseInt_(split[1]);
    bound.deltaY = parseInt_(split[2]);
    bound.deltaZ = parseInt_(split[3]);
    bound.thetaX = parseInt_(split[4]);
    bound.thetaY = parseInt_(split[5]);
    bound.thetaZ = parseInt_(split[6]);

    doc.boundaries.push(bound);

    const node = nodeDict.get(nodeNum);
    if (node) node.boundaryCondition = bound;
  }
}

function parseMaterials(cursor: Cursor, doc: FrameDocument): void {
  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'M-MATERIAL') break;

    const split = line.split(',');
    if (split.length < 6) continue;

    const mat = new Material();
    mat.number = parseInt_(split[0]);
    mat.young = parseFloat_(split[1]);
    mat.shear = parseFloat_(split[2]);
    mat.expansion = parseFloat_(split[3]);
    mat.poisson = parseFloat_(split[4]);
    mat.unitLoad = parseFloat_(split[5]);
    mat.name = split.length > 6 ? split[6].trim() : '';

    doc.materials.push(mat);
  }

  // M-MATERIAL → SECTION までスキップ
  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'SECTION') break;
  }
}

function parseSections(cursor: Cursor, doc: FrameDocument): boolean {
  let gotMember = false;

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'MEM1-SPRING') break;
    if (line.trim() === 'MEMBER') { gotMember = true; break; }

    const split = line.split(',');
    if (split.length < 12) continue;

    const sec = new Section();
    sec.number = parseInt_(split[0]);
    sec.materialNumber = parseInt_(split[1]);
    sec.type = parseInt_(split[2]) as SectionType;
    sec.shape = parseInt_(split[3]) as SectionShape;
    sec.p1_A = parseFloat_(split[4]);
    sec.p2_Ix = parseFloat_(split[5]);
    sec.p3_Iy = parseFloat_(split[6]);
    sec.p4_Iz = parseFloat_(split[7]);
    sec.ky = parseFloat_(split[10]);
    sec.kz = parseFloat_(split[11]);
    sec.comment = split.length > 22 ? split[22].trim() : '';

    doc.sections.push(sec);
  }

  return gotMember;
}

function parseSprings(cursor: Cursor, doc: FrameDocument, gotMember: boolean): void {
  if (gotMember) return;

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'MEMBER') break;

    const split = line.split(',');
    if (split.length < 3) continue;

    const spring = new Spring();
    spring.number = parseInt_(split[0]);
    spring.method = parseInt_(split[1]);
    spring.kTheta = parseFloat_(split[2]);

    doc.springs.push(spring);
  }
}

function parseMembers(cursor: Cursor, doc: FrameDocument): Map<number, Member> {
  const memberDict = new Map<number, Member>();

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    const trimmed = line.trim();
    if (trimmed === 'WALL' || trimmed === 'AI-LOAD' ||
        trimmed === 'CALCULATION-CASE' || trimmed === 'STOP') break;

    const split = line.split(',');
    if (split.length < 10) continue;

    const mem = new Member();
    mem.number = parseInt_(split[0]);
    mem.iNodeNumber = parseInt_(split[1]);
    mem.jNodeNumber = parseInt_(split[2]);
    mem.ixSpring = parseInt_(split[3]);
    mem.iySpring = parseInt_(split[4]);
    mem.izSpring = parseInt_(split[5]);
    mem.jxSpring = parseInt_(split[6]);
    mem.jySpring = parseInt_(split[7]);
    mem.jzSpring = parseInt_(split[8]);
    mem.sectionNumber = parseInt_(split[9]);
    mem.p1 = split.length > 12 ? parseFloat_(split[12]) : 0;
    mem.p2 = split.length > 13 ? parseFloat_(split[13]) : 0;
    mem.p3 = split.length > 14 ? parseFloat_(split[14]) : 0;

    doc.members.push(mem);
    memberDict.set(mem.number, mem);
  }

  return memberDict;
}

function parseWalls(cursor: Cursor, doc: FrameDocument): void {
  if (cursor.prevLineTrimmed !== 'WALL') return;

  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'AI-LOAD') break;

    const split = line.split(',');
    if (split.length < 11) continue;

    const wall = new Wall();
    wall.number = parseInt_(split[0]);
    wall.leftBottomNode = parseInt_(split[1]);
    wall.rightBottomNode = parseInt_(split[2]);
    wall.leftTopNode = parseInt_(split[3]);
    wall.rightTopNode = parseInt_(split[4]);
    wall.materialNumber = parseInt_(split[5]);
    wall.method = parseInt_(split[6]);
    wall.p1 = parseFloat_(split[7]);
    wall.p2 = parseFloat_(split[8]);
    wall.p3 = parseFloat_(split[9]);
    wall.p4 = parseFloat_(split[10]);

    doc.walls.push(wall);
  }
}

function skipToLoadDefinition(cursor: Cursor): void {
  if (cursor.prevLineTrimmed === 'AI-LOAD') {
    while (cursor.hasMore) {
      const line = cursor.nextLine();
      if (line.trim() === 'LOAD-DEFINITION') break;
    }
  } else {
    while (cursor.hasMore) {
      const line = cursor.peekLine();
      if (line.trim() === 'LOAD-DEFINITION') { cursor.nextLine(); break; }
      if (line.trim() === 'CALCULATION-CASE' || line.trim() === 'STOP') break;
      cursor.nextLine();
    }
  }
}

function parseLoadDefinitions(
  cursor: Cursor, doc: FrameDocument,
  nodeDict: Map<number, Node>, memberDict: Map<number, Member>
): void {
  let caseIndex = 0;

  while (cursor.hasMore) {
    const headerLine = cursor.nextLine();
    if (headerLine.trim() === 'CALCULATION-CASE' || headerLine.trim() === 'STOP') break;

    doc.loadCaseCount = caseIndex + 1;

    while (cursor.hasMore) {
      const line = cursor.nextLine();
      const trimmed = line.trim();

      if (trimmed === 'LOAD-DEFINITION') { caseIndex++; break; }
      if (trimmed === 'CALCULATION-CASE' || trimmed === 'STOP') { cursor.pos--; break; }

      if (trimmed === 'F-NODE' || trimmed === 'F-CMQ' || trimmed === 'F-MEMBER') {
        parseLoadSection(cursor, trimmed, caseIndex, nodeDict, memberDict);
        continue;
      }
    }

    if (cursor.hasMore) {
      const check = cursor.currentLineTrimmed;
      if (check === 'CALCULATION-CASE' || check === 'STOP') break;
    }
  }
}

function parseLoadSection(
  cursor: Cursor, loadType: string, caseIndex: number,
  nodeDict: Map<number, Node>, memberDict: Map<number, Member>
): void {
  while (cursor.hasMore) {
    const dataLine = cursor.peekLine();
    const dt = dataLine.trim();
    if (dt === 'F-NODE' || dt === 'F-CMQ' || dt === 'F-MEMBER' ||
        dt === 'LOAD-DEFINITION' || dt === 'CALCULATION-CASE' || dt === 'STOP') break;

    cursor.nextLine();
    const split = dataLine.split(',');
    if (split.length < 2) continue;

    switch (loadType) {
      case 'F-NODE': {
        const node = nodeDict.get(parseInt_(split[0]));
        if (node) {
          const load = node.getLoad(caseIndex);
          load.p1 = parseFloat_(split[1]);
          load.p2 = split.length > 2 ? parseFloat_(split[2]) : 0;
          load.p3 = split.length > 3 ? parseFloat_(split[3]) : 0;
          load.m1 = split.length > 4 ? parseFloat_(split[4]) : 0;
          load.m2 = split.length > 5 ? parseFloat_(split[5]) : 0;
          load.m3 = split.length > 6 ? parseFloat_(split[6]) : 0;
        }
        break;
      }
      case 'F-CMQ': {
        const mem = memberDict.get(parseInt_(split[0]));
        if (mem) {
          const load = mem.getCMQLoad(caseIndex);
          load.moy = parseFloat_(split[1]);
          load.moz = split.length > 2 ? parseFloat_(split[2]) : 0;
          load.iMy = split.length > 3 ? parseFloat_(split[3]) : 0;
          load.iMz = split.length > 4 ? parseFloat_(split[4]) : 0;
          load.iQx = split.length > 5 ? parseFloat_(split[5]) : 0;
          load.iQy = split.length > 6 ? parseFloat_(split[6]) : 0;
          load.iQz = split.length > 7 ? parseFloat_(split[7]) : 0;
          load.jMy = split.length > 8 ? parseFloat_(split[8]) : 0;
          load.jMz = split.length > 9 ? parseFloat_(split[9]) : 0;
          load.jQx = split.length > 10 ? parseFloat_(split[10]) : 0;
          load.jQy = split.length > 11 ? parseFloat_(split[11]) : 0;
          load.jQz = split.length > 12 ? parseFloat_(split[12]) : 0;
        }
        break;
      }
      case 'F-MEMBER': {
        const mem = memberDict.get(parseInt_(split[0]));
        if (mem) {
          const load = mem.getMemberLoad(caseIndex);
          load.lengthMethod = parseInt_(split[1]);
          load.type = split.length > 2 ? parseInt_(split[2]) : 0;
          load.direction = split.length > 3 ? parseInt_(split[3]) : 0;
          load.scale = split.length > 4 ? parseFloat_(split[4]) : 0;
          load.loadCode = split.length > 5 ? split[5].trim() : '';
          load.unitLoad = split.length > 6 ? parseFloat_(split[6]) : 0;
          load.p1 = split.length > 7 ? parseFloat_(split[7]) : 0;
          load.p2 = split.length > 8 ? parseFloat_(split[8]) : 0;
          load.p3 = split.length > 9 ? parseFloat_(split[9]) : 0;
        }
        break;
      }
    }
  }
}

function parseCalcCase(cursor: Cursor, doc: FrameDocument): void {
  while (cursor.hasMore) {
    const line = cursor.nextLine();
    if (line.trim() === 'STOP') break;
    doc.calcCaseMemo.push(line);
  }
}

// ===== エントリポイント =====

export function parseStructForm(text: string, doc: FrameDocument): void {
  doc.init();

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cursor = new Cursor(lines);

  parseHeader(cursor, doc);
  const nodeDict = parseNodes(cursor, doc);
  parseBoundaries(cursor, doc, nodeDict);
  parseMaterials(cursor, doc);
  const gotMember = parseSections(cursor, doc);
  parseSprings(cursor, doc, gotMember);
  const memberDict = parseMembers(cursor, doc);
  parseWalls(cursor, doc);
  skipToLoadDefinition(cursor);
  parseLoadDefinitions(cursor, doc, nodeDict, memberDict);
  parseCalcCase(cursor, doc);

  doc.notifyChange();
}
