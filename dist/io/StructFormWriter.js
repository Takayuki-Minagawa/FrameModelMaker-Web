function pad(n, width) {
    return String(n).padStart(width, ' ');
}
function fmtExp(v) {
    if (v === 0)
        return '';
    return v.toExponential(3).toUpperCase().replace('+0', '+0').replace('-0', '-0');
}
function fmtFloat(v) {
    if (v === 0)
        return '';
    return v.toExponential(3).toUpperCase();
}
export function writeStructForm(doc) {
    const lines = [];
    // START
    lines.push('START                                                       Windows 8.00');
    // TITLE
    lines.push('TITLE');
    lines.push(`"${doc.title}"`);
    // CONTROL
    lines.push('CONTROL');
    lines.push('0,0,0, 5,, 5');
    // M-CONTROL
    lines.push('M-CONTROL');
    lines.push(' 1 , 1 , 0 , 0 , 0 , 0 ');
    lines.push(' 0 , 0 , 0 , 5 , 80 ');
    lines.push(' 1 ,2.0,1.1,60,');
    lines.push(' 1 ,2.0,1.1,2.0,0.2,60');
    lines.push(' 0 , 1 , 1 , 1 ,20,15, 1 ,,');
    lines.push(' 0 , 1 , 1 , 1 ,20,15,1.0,1.0');
    // NODE
    lines.push('NODE');
    for (const n of doc.nodes) {
        lines.push(`${pad(n.number, 5)},${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)},,    0,0.0,0.0,,0.0,`);
    }
    // BOUNDARY
    lines.push('BOUNDARY');
    lines.push('1,""');
    for (const b of doc.boundaries) {
        lines.push(`${pad(b.nodeNumber, 5)},${b.deltaX},${b.deltaY},${b.deltaZ},${b.thetaX},${b.thetaY},${b.thetaZ},,,,,,`);
    }
    // MATERIAL
    lines.push('MATERIAL');
    for (const m of doc.materials) {
        lines.push(`${pad(m.number, 2)},${m.young},${m.shear},${m.expansion},${m.poisson},${m.unitLoad},${m.name}`);
    }
    // M-MATERIAL
    lines.push('M-MATERIAL');
    lines.push(' 1 ,21, 4 , 13 , 4 , 10 , 4 , 13 , 4 , 10 , 4 ,1,1,1,1,15');
    // SECTION
    lines.push('SECTION');
    for (const s of doc.sections) {
        lines.push(`${s.number},${s.materialNumber},${s.type},${s.shape},${fmtExp(s.p1_A)},${fmtExp(s.p2_Ix)},${fmtExp(s.p3_Iy)},${fmtExp(s.p4_Iz)},,,${s.ky},${s.kz},,,,,0,0,,,,,${s.comment}`);
    }
    // MEM1-SPRING
    lines.push('MEM1-SPRING');
    for (const s of doc.springs) {
        lines.push(`${s.number},${s.method},${fmtExp(s.kTheta)}`);
    }
    // MEMBER
    lines.push('MEMBER');
    for (const m of doc.members) {
        lines.push(`${pad(m.number, 5)},${pad(m.iNodeNumber, 5)},${pad(m.jNodeNumber, 5)},${m.ixSpring},${m.iySpring},${m.izSpring},${m.jxSpring},${m.jySpring},${m.jzSpring},${m.sectionNumber},    0,5,${m.p1},${m.p2},${m.p3},,,,,,,,,,,,,,,`);
    }
    // WALL
    if (doc.walls.length > 0) {
        lines.push('WALL');
        for (const w of doc.walls) {
            lines.push(`${pad(w.number, 5)},${pad(w.leftBottomNode, 5)},${pad(w.rightBottomNode, 5)},${pad(w.leftTopNode, 5)},${pad(w.rightTopNode, 5)},${pad(w.materialNumber, 2)},${w.method},${w.p1},${w.p2},${w.p3},${w.p4},`);
        }
    }
    // AI-LOAD
    lines.push('AI-LOAD');
    lines.push('0,0,1.0,2,0.2,0.0,  0');
    // LOAD-DEFINITION
    for (let i = 0; i < doc.loadCaseCount; i++) {
        lines.push('LOAD-DEFINITION');
        lines.push(`${pad(i + 1, 2)},0,0,0,"",0`);
        // F-NODE
        lines.push('F-NODE');
        for (const n of doc.nodes) {
            if (n.loads.length > i) {
                const nl = n.loads[i];
                if (!nl.isZero) {
                    lines.push(`${pad(n.number, 5)},${fmtFloat(nl.p1)},${fmtFloat(nl.p2)},${fmtFloat(nl.p3)},${fmtFloat(nl.m1)},${fmtFloat(nl.m2)},${fmtFloat(nl.m3)}`);
                }
            }
        }
        // F-CMQ
        lines.push('F-CMQ');
        for (const m of doc.members) {
            if (m.cmqLoads.length > i) {
                const cl = m.cmqLoads[i];
                if (!cl.isZero) {
                    lines.push(`${pad(m.number, 5)},${fmtFloat(cl.moy)},${fmtFloat(cl.moz)},${fmtFloat(cl.iMy)},${fmtFloat(cl.iMz)},${fmtFloat(cl.iQx)},${fmtFloat(cl.iQy)},${fmtFloat(cl.iQz)},${fmtFloat(cl.jMy)},${fmtFloat(cl.jMz)},${fmtFloat(cl.jQx)},${fmtFloat(cl.jQy)},${fmtFloat(cl.jQz)}`);
                }
            }
        }
        // F-MEMBER
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
    // CALCULATION-CASE
    if (doc.calcCaseMemo.length > 0) {
        if (doc.calcCaseMemo[0].trim() !== 'CALCULATION-CASE') {
            lines.push('CALCULATION-CASE');
        }
        for (const s of doc.calcCaseMemo) {
            lines.push(s);
        }
    }
    // STOP
    lines.push('STOP');
    lines.push('');
    return lines.join('\r\n');
}
//# sourceMappingURL=StructFormWriter.js.map