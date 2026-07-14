import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Member } from '../../src/models/Member';
import { Material } from '../../src/models/Material';
import { Section, SectionShape } from '../../src/models/Section';
import { calculateSectionProperties, applySectionProperties } from '../../src/services/SectionProperties';
import { calculateModelStatistics } from '../../src/services/ModelStatistics';
import { DocumentHistory } from '../../src/services/DocumentHistory';

describe('core services', () => {
  it('calculates and applies common section properties', () => {
    const rectangle = calculateSectionProperties({ shape: SectionShape.Rectangle, width: 10, height: 20 });
    expect(rectangle.area).toBe(200);
    expect(rectangle.inertiaY).toBeCloseTo(10 * 20 ** 3 / 12);
    const circle = calculateSectionProperties({ shape: SectionShape.Circle, diameter: 10 });
    expect(circle.torsionConstant).toBeCloseTo(Math.PI * 10 ** 4 / 32);
    const section = new Section();
    applySectionProperties(section, { shape: SectionShape.Box, outerWidth: 20, outerHeight: 30, thickness: 2 });
    expect(section.p1_A).toBeGreaterThan(0);
    expect(section.torsionConstant).toBe(section.p2_Ix);
  });

  it('reports geometry quantities and explicit unitLoad interpretation', () => {
    const doc = new FrameDocument();
    const a = new Node(0, 0, 0); a.number = 1;
    const b = new Node(3, 4, 0); b.number = 2;
    const isolated = new Node(10, 0, 0); isolated.number = 3;
    const material = new Material(); material.number = 1; material.unitLoad = 2;
    const section = new Section(); section.number = 1; section.materialNumber = 1; section.p1_A = 10;
    const member = new Member(); Object.assign(member, { number: 1, iNodeNumber: 1, jNodeNumber: 2, sectionNumber: 1 });
    doc.nodes = [a, b, isolated]; doc.materials = [material]; doc.sections = [section]; doc.members = [member];
    const stats = calculateModelStatistics(doc, { unitLoadInterpretation: 'weightPerVolume' });
    expect(stats.totalMemberLength).toBe(5);
    expect(stats.totalMemberVolume).toBe(50);
    expect(stats.materialQuantities[0].estimatedWeight).toBe(100);
    expect(stats.isolatedNodeNumbers).toEqual([3]);
  });

  it('supports dirty state, transactions, undo/redo and autosave restore', () => {
    const doc = new FrameDocument();
    const history = new DocumentHistory(doc);
    history.runTransaction('Rename', () => { doc.title = 'changed'; doc.notifyChange(); });
    expect(history.isDirty).toBe(true);
    expect(history.undo()).toBe(true);
    expect(doc.title).toBe('');
    expect(history.redo()).toBe(true);
    expect(doc.title).toBe('changed');
    const autosave = history.serializeAutosave();
    const recoveredDoc = new FrameDocument();
    const recovered = new DocumentHistory(recoveredDoc);
    recovered.restoreAutosave(autosave);
    expect(recoveredDoc.title).toBe('changed');
    history.dispose(); recovered.dispose();
  });
});
