// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { buildYamlExportSummary, renderYamlExportSummary } from '../../src/app/YamlExportSummary';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Section } from '../../src/models/Section';
import { Spring } from '../../src/models/Spring';
import { Wall } from '../../src/models/Wall';

function model() {
  const doc = new FrameDocument();
  const section = new Section();
  section.number = 1;
  doc.sections.push(section);
  const nodes = [
    doc.addNode(doc.createNode(0, 0, 0)),
    doc.addNode(doc.createNode(100, 0, 0)),
    doc.addNode(doc.createNode(100, 0, 100)),
    doc.addNode(doc.createNode(0, 0, 100)),
  ];
  const member = doc.createMember();
  member.iNodeNumber = nodes[0].number;
  member.jNodeNumber = nodes[1].number;
  member.sectionNumber = 1;
  member.ixSpring = 3;
  doc.addMember(member);
  const wall = new Wall();
  wall.number = 1;
  [wall.leftBottomNode, wall.rightBottomNode, wall.rightTopNode, wall.leftTopNode] = nodes.map((node) => node.number);
  doc.walls.push(wall);
  const spring = new Spring();
  spring.number = 3;
  doc.springs.push(spring);
  nodes[0].loads[0].p3 = -10;
  member.cmqLoads[0].moy = 5;
  return doc;
}

describe('YAML export summary (R19)', () => {
  it('counts exported and omitted items with units', () => {
    const rows = buildYamlExportSummary(model());
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(byKey.nodes).toMatchObject({ count: 4, unit: 'mm', exported: true });
    expect(byKey.sections.unit).toBe('mm², mm⁴');
    expect(byKey.walls).toMatchObject({ count: 1, exported: false });
    expect(byKey.springs).toMatchObject({ count: 1, exported: false });
    expect(byKey.springs.note).toContain('1');
    expect(byKey.nodeLoads).toMatchObject({ count: 1, exported: false });
    expect(byKey.memberLoads).toMatchObject({ count: 0, exported: true });
    expect(byKey.cmqLoads).toMatchObject({ count: 1, exported: false });
  });

  it('renders a table with omitted rows flagged and a summary line', () => {
    const element = renderYamlExportSummary(model());
    expect(element.querySelectorAll('tbody tr')).toHaveLength(13);
    expect(element.querySelector('tr[data-key="walls"]')!.classList.contains('omitted')).toBe(true);
    expect(element.querySelector('tr[data-key="walls"]')!.textContent).toContain('欠落');
    expect(element.querySelector('tr[data-key="nodes"]')!.textContent).toContain('出力');
    expect(element.querySelector('.diagnostic-item.warn')!.textContent).toContain('欠落項目 4件');
    const empty = renderYamlExportSummary(new FrameDocument());
    expect(empty.querySelector('.diagnostic-item.info')!.textContent).toContain('欠落項目はありません');
  });
});
