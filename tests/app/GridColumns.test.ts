// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createGridColumns } from '../../src/app/GridColumns';
import { FrameDocument } from '../../src/models/FrameDocument';
import { DataGrid } from '../../src/ui/DataGrid';

describe('GridColumns descriptions (R12)', () => {
  it('describes codes, units and sign conventions for load and section columns', () => {
    const columns = createGridColumns(new FrameDocument());
    const memberLoads = columns<Record<string, unknown>>('memberloads');
    const lengthMethod = memberLoads.find((column) => column.key === 'lengthMethod')!;
    expect(lengthMethod.description).toContain('0〜3');
    expect((lengthMethod.enumOptions ?? []).map((option) => (option as { label: string }).label)).toEqual([
      '0 (長さ方式 0)',
      '1 (長さ方式 1)',
      '2 (長さ方式 2)',
      '3 (長さ方式 3)',
    ]);
    const nodeLoads = columns<Record<string, unknown>>('nodeloads');
    expect(nodeLoads.find((column) => column.key === 'p3')!.description).toContain('+Z');
    expect(nodeLoads.find((column) => column.key === 'm1')!.description).toContain('kN·cm');
    const sections = columns<Record<string, unknown>>('sections');
    expect(sections.find((column) => column.key === 'p2_Ix')!.description).toContain('J');
    expect(sections.find((column) => column.key === 'torsionConstant')!.description).toContain('cm⁴');
    const springs = columns<Record<string, unknown>>('springs');
    expect(springs.find((column) => column.key === 'method')!.description).toContain('0');
    const cmq = columns<Record<string, unknown>>('cmqloads');
    expect(cmq.find((column) => column.key === 'moy')!.description).toContain('M0y');
  });

  it('exposes descriptions as header tooltips and aria-descriptions in the grid', () => {
    const doc = new FrameDocument();
    doc.addNode();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const columns = createGridColumns(doc)<Record<string, unknown>>('nodes');
    new DataGrid(container, columns, doc.nodes as unknown as Record<string, unknown>[]);
    const header = container.querySelector<HTMLElement>('th[data-column-key="z"]')!;
    expect(header.title).toContain('Z');
    expect(header.getAttribute('aria-description')).toContain('cm');
    const cell = container.querySelector<HTMLInputElement>('.data-grid-editor[data-column-key="z"]')!;
    expect(cell.title).toContain('cm');
  });
});
