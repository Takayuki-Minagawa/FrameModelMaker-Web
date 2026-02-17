import { FrameDocument } from '../models/FrameDocument';
import { Node } from '../models/Node';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { Material } from '../models/Material';
import { Section, SectionType, SectionShape } from '../models/Section';
import { Spring } from '../models/Spring';
import { Member } from '../models/Member';
import { Wall } from '../models/Wall';

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

export function parseStructForm(text: string, doc: FrameDocument): void {
  doc.init();

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let cursor = 0;

  function nextLine(): string {
    if (cursor >= lines.length) return '';
    return lines[cursor++];
  }

  function peekLine(): string {
    if (cursor >= lines.length) return '';
    return lines[cursor];
  }

  // nodeDict: 番号 → Node オブジェクト
  const nodeDict = new Map<number, Node>();
  const matDict = new Map<number, Material>();
  const springDict = new Map<number, Spring>();
  const sectionDict = new Map<number, Section>();
  const memberDict = new Map<number, Member>();

  // デフォルトバネを辞書に追加
  springDict.set(Spring.RIGID.number, Spring.RIGID);
  springDict.set(Spring.PIN.number, Spring.PIN);

  // START
  const startLine = nextLine();
  if (!startLine.trim().startsWith('START')) {
    throw new Error('START error: ' + startLine);
  }

  // TITLE
  const titleHeader = nextLine();
  if (titleHeader.trim() !== 'TITLE') {
    throw new Error('TITLE error');
  }
  const titleLine = nextLine();
  doc.title = titleLine.replace(/^"/, '').replace(/"$/, '');

  // CONTROL
  const controlHeader = nextLine();
  if (controlHeader.trim() !== 'CONTROL') {
    throw new Error('CONTROL error');
  }
  nextLine(); // skip control data

  // M-CONTROL → NODE までスキップ
  while (cursor < lines.length) {
    const line = nextLine();
    if (line.trim() === 'NODE') break;
  }

  // NODE → BOUNDARY まで
  while (cursor < lines.length) {
    const line = nextLine();
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

  // BOUNDARY → 1行スキップ → MATERIAL まで
  nextLine(); // skip "1,"""
  while (cursor < lines.length) {
    const line = nextLine();
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

  // MATERIAL → M-MATERIAL まで
  while (cursor < lines.length) {
    const line = nextLine();
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
    matDict.set(mat.number, mat);
  }

  // M-MATERIAL → SECTION までスキップ
  while (cursor < lines.length) {
    const line = nextLine();
    if (line.trim() === 'SECTION') break;
  }

  // SECTION → MEM1-SPRING または MEMBER まで
  let gotMember = false;
  while (cursor < lines.length) {
    const line = nextLine();
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
    sectionDict.set(sec.number, sec);
  }

  // MEM1-SPRING → MEMBER まで（存在しない場合はスキップ済み）
  if (!gotMember) {
    while (cursor < lines.length) {
      const line = nextLine();
      if (line.trim() === 'MEMBER') break;

      const split = line.split(',');
      if (split.length < 3) continue;

      const spring = new Spring();
      spring.number = parseInt_(split[0]);
      spring.method = parseInt_(split[1]);
      spring.kTheta = parseFloat_(split[2]);

      doc.springs.push(spring);
      springDict.set(spring.number, spring);
    }
  }

  // MEMBER → WALL または AI-LOAD まで
  while (cursor < lines.length) {
    const line = nextLine();
    const trimmed = line.trim();
    if (trimmed === 'WALL') break;
    if (trimmed === 'AI-LOAD') { /* skip to LOAD-DEFINITION */ break; }
    if (trimmed === 'CALCULATION-CASE' || trimmed === 'STOP') break;

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

  // 直前のセクションが WALL だった場合 → AI-LOAD まで
  const prevTrimmed = lines[cursor - 1]?.trim();
  if (prevTrimmed === 'WALL') {
    while (cursor < lines.length) {
      const line = nextLine();
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

  // AI-LOAD → LOAD-DEFINITION まで
  if (prevTrimmed === 'AI-LOAD' || lines[cursor - 1]?.trim() === 'AI-LOAD') {
    while (cursor < lines.length) {
      const line = nextLine();
      if (line.trim() === 'LOAD-DEFINITION') break;
    }
  } else {
    // AI-LOADまでスキップ
    while (cursor < lines.length) {
      const line = peekLine();
      if (line.trim() === 'LOAD-DEFINITION') { nextLine(); break; }
      if (line.trim() === 'CALCULATION-CASE' || line.trim() === 'STOP') break;
      nextLine();
    }
  }

  // LOAD-DEFINITION の繰り返しパース
  let caseIndex = 0;
  while (cursor < lines.length) {
    // 荷重定義ヘッダ行を読む
    const headerLine = nextLine();
    if (headerLine.trim() === 'CALCULATION-CASE' || headerLine.trim() === 'STOP') break;

    // caseIndex を更新
    doc.loadCaseCount = caseIndex + 1;

    // F-NODE / F-CMQ / F-MEMBER を読む
    while (cursor < lines.length) {
      const line = nextLine();
      const trimmed = line.trim();

      if (trimmed === 'LOAD-DEFINITION') {
        caseIndex++;
        break;
      }
      if (trimmed === 'CALCULATION-CASE' || trimmed === 'STOP') {
        // 戻して外のループで処理
        cursor--;
        break;
      }
      if (trimmed === 'F-NODE' || trimmed === 'F-CMQ' || trimmed === 'F-MEMBER') {
        // セクションヘッダ → 以降のデータを読む
        const loadType = trimmed;
        while (cursor < lines.length) {
          const dataLine = peekLine();
          const dt = dataLine.trim();
          if (dt === 'F-NODE' || dt === 'F-CMQ' || dt === 'F-MEMBER' ||
              dt === 'LOAD-DEFINITION' || dt === 'CALCULATION-CASE' || dt === 'STOP') {
            break;
          }
          nextLine();
          const split = dataLine.split(',');
          if (split.length < 2) continue;

          switch (loadType) {
            case 'F-NODE': {
              const nodeNum = parseInt_(split[0]);
              const node = nodeDict.get(nodeNum);
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
              const memNum = parseInt_(split[0]);
              const mem = memberDict.get(memNum);
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
              const memNum = parseInt_(split[0]);
              const mem = memberDict.get(memNum);
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
        continue;
      }
      // それ以外のデータ行（荷重定義の番号行など）はスキップ
    }

    if (cursor < lines.length) {
      const check = lines[cursor]?.trim();
      if (check === 'CALCULATION-CASE' || check === 'STOP') break;
    }
  }

  // CALCULATION-CASE → STOP まで
  while (cursor < lines.length) {
    const line = nextLine();
    if (line.trim() === 'STOP') break;
    doc.calcCaseMemo.push(line);
  }

  doc.notifyChange();
}
