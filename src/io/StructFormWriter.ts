import { FrameDocument } from '../models/FrameDocument';

function pad(n: number, width: number): string {
  return String(n).padStart(width, ' ');
}

function fmtExp(v: number): string {
  if (v === 0) return '';
  return v.toExponential(3).toUpperCase();
}

function fmtFloat(v: number): string {
  if (v === 0) return '';
  return v.toExponential(3).toUpperCase();
}

// ===== セクション別書出関数 =====

function writeHeader(lines: string[], doc: FrameDocument): void {
  lines.push('START                                                       Windows 8.00');
  lines.push('TITLE');
  lines.push(`"${doc.title}"`);
  lines.push('CONTROL');
  lines.push('0,0,0, 5,, 5');
  lines.push('M-CONTROL');
  lines.push(' 1 , 1 , 0 , 0 , 0 , 0 ');
  lines.push(' 0 , 0 , 0 , 5 , 80 ');
  lines.push(' 1 ,2.0,1.1,60,');
  lines.push(' 1 ,2.0,1.1,2.0,0.2,60');
  lines.push(' 0 , 1 , 1 , 1 ,20,15, 1 ,,');
  lines.push(' 0 , 1 , 1 , 1 ,20,15,1.0,1.0');
}

function writeNodes(lines: string[], doc: FrameDocument): void {
  lines.push('NODE');
  for (const n of doc.nodes) {
    lines.push(`${pad(n.number, 5)},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)},,    0,0.0,0.0,,0.0,`);
  }
}

function writeBoundaries(lines: string[], doc: FrameDocument): void {
  lines.push('BOUNDARY');
  lines.push('1,""');
  for (const b of doc.boundaries) {
    lines.push(`${pad(b.nodeNumber, 5)},${b.deltaX},${b.deltaY},${b.deltaZ},${b.thetaX},${b.thetaY},${b.thetaZ},,,,,,`);
  }
}

function writeMaterials(lines: string[], doc: FrameDocument): void {
  lines.push('MATERIAL');
  for (const m of doc.materials) {
    lines.push(`${pad(m.number, 2)},${m.young},${m.shear},${m.expansion},${m.poisson},${m.unitLoad},${m.name}`);
  }
  lines.push('M-MATERIAL');
  lines.push(' 1 ,21, 4 , 13 , 4 , 10 , 4 , 13 , 4 , 10 , 4 ,1,1,1,1,15');
}

function writeSections(lines: string[], doc: FrameDocument): void {
  lines.push('SECTION');
  for (const s of doc.sections) {
    lines.push(`${s.number},${s.materialNumber},${s.type},${s.shape},${fmtExp(s.p1_A)},${fmtExp(s.p2_Ix)},${fmtExp(s.p3_Iy)},${fmtExp(s.p4_Iz)},,,${s.ky},${s.kz},,,,,0,0,,,,,${s.comment}`);
  }
}

function writeSprings(lines: string[], doc: FrameDocument): void {
  lines.push('MEM1-SPRING');
  for (const s of doc.springs) {
    lines.push(`${s.number},${s.method},${fmtExp(s.kTheta)}`);
  }
}

function writeMembers(lines: string[], doc: FrameDocument): void {
  lines.push('MEMBER');
  for (const m of doc.members) {
    lines.push(`${pad(m.number, 5)},${pad(m.iNodeNumber, 5)},${pad(m.jNodeNumber, 5)},${m.ixSpring},${m.iySpring},${m.izSpring},${m.jxSpring},${m.jySpring},${m.jzSpring},${m.sectionNumber},    0,5,${m.p1},${m.p2},${m.p3},,,,,,,,,,,,,,,`);
  }
}

function writeWalls(lines: string[], doc: FrameDocument): void {
  if (doc.walls.length === 0) return;
  lines.push('WALL');
  for (const w of doc.walls) {
    lines.push(`${pad(w.number, 5)},${pad(w.leftBottomNode, 5)},${pad(w.rightBottomNode, 5)},${pad(w.leftTopNode, 5)},${pad(w.rightTopNode, 5)},${pad(w.materialNumber, 2)},${w.method},${w.p1},${w.p2},${w.p3},${w.p4},`);
  }
}

function writeLoadDefinitions(lines: string[], doc: FrameDocument): void {
  lines.push('AI-LOAD');
  lines.push('0,0,1.0,2,0.2,0.0,  0');

  for (let i = 0; i < doc.loadCaseCount; i++) {
    lines.push('LOAD-DEFINITION');
    lines.push(`${pad(i + 1, 2)},0,0,0,"",0`);

    lines.push('F-NODE');
    for (const n of doc.nodes) {
      if (n.loads.length > i) {
        const nl = n.loads[i];
        if (!nl.isZero) {
          lines.push(`${pad(n.number, 5)},${fmtFloat(nl.p1)},${fmtFloat(nl.p2)},${fmtFloat(nl.p3)},${fmtFloat(nl.m1)},${fmtFloat(nl.m2)},${fmtFloat(nl.m3)}`);
        }
      }
    }

    lines.push('F-CMQ');
    for (const m of doc.members) {
      if (m.cmqLoads.length > i) {
        const cl = m.cmqLoads[i];
        if (!cl.isZero) {
          lines.push(`${pad(m.number, 5)},${fmtFloat(cl.moy)},${fmtFloat(cl.moz)},${fmtFloat(cl.iMy)},${fmtFloat(cl.iMz)},${fmtFloat(cl.iQx)},${fmtFloat(cl.iQy)},${fmtFloat(cl.iQz)},${fmtFloat(cl.jMy)},${fmtFloat(cl.jMz)},${fmtFloat(cl.jQx)},${fmtFloat(cl.jQy)},${fmtFloat(cl.jQz)}`);
        }
      }
    }

    lines.push('F-MEMBER');
    for (const m of doc.members) {
      if (m.memberLoads.length > i) {
        const ml = m.memberLoads[i];
        if (!ml.isZero) {
          lines.push(`${pad(m.number, 5)},${ml.lengthMethod},${ml.type},${ml.direction},${ml.scale},${ml.loadCode},${ml.unitLoad},${fmtFloat(ml.p1)},${fmtFloat(ml.p2)},${fmtFloat(ml.p3)},,,,,`);
        }
      }
    }
  }
}

function writeCalcCase(lines: string[], doc: FrameDocument): void {
  if (doc.calcCaseMemo.length > 0) {
    if (doc.calcCaseMemo[0].trim() !== 'CALCULATION-CASE') {
      lines.push('CALCULATION-CASE');
    }
    for (const s of doc.calcCaseMemo) {
      lines.push(s);
    }
  }
}

// ===== エントリポイント =====

export function writeStructForm(doc: FrameDocument): string {
  const lines: string[] = [];

  writeHeader(lines, doc);
  writeNodes(lines, doc);
  writeBoundaries(lines, doc);
  writeMaterials(lines, doc);
  writeSections(lines, doc);
  writeSprings(lines, doc);
  writeMembers(lines, doc);
  writeWalls(lines, doc);
  writeLoadDefinitions(lines, doc);
  writeCalcCase(lines, doc);

  lines.push('STOP');
  lines.push('');

  return lines.join('\r\n');
}
