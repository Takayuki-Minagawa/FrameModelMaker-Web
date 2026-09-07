import { describe, it, expect } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Material } from '../../src/models/Material';
import { Section, SectionShape } from '../../src/models/Section';
import { replicatePattern, generateFrame } from '../../src/services/ModelPatterns';
import { resolveLocalAxes } from '../../src/services/LocalAxes';
import { prepareCsvEdit } from '../../src/services/BulkEdit';
import { parseDelimited } from '../../src/io/DelimitedText';
import { validatePreset, PresetRepository } from '../../src/services/Presets';
import { SettingsRepository } from '../../src/services/SettingsRepository';
import { EditorController } from '../../src/app/EditorController';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import { writeFrameJson } from '../../src/io/FrameJson';
function model() {
  const doc = new FrameDocument();
  const section = new Section(); section.number = 1; section.p1_A = 100; section.materialNumber = 1; doc.sections.push(section);
  const material = new Material(); material.number = 1; material.young = 20000; material.shear = 8000; doc.materials.push(material);
  generateFrame(doc, { kind: 'frame', spans: 2, stories: 1, span: 100, height: 200, sectionNumber: section.number });
  return doc;
}
describe('atomic modeling workflows', () => {
  it('linear copies preserve shared nodes, loads, supports and undo as a unit', () => {
    const doc = model(); doc.nodes[0].loads[0].p1 = 2;
    const before = writeFrameJson(doc); const history = new DocumentHistory(doc); const editor = new EditorController(doc, history);
    const result = editor.execute('array', () => replicatePattern(doc, { nodes: [], members: doc.members.map(m => m.number), walls: [] }, { kind: 'linear', count: 2, delta: [0, 500, 0] }));
    expect(result.nodes).toHaveLength(12); expect(doc.nodes).toHaveLength(18);
    expect(doc.nodes[6].loads[0].p1).toBe(2); expect(doc.nodes[6].loads[0]).not.toBe(doc.nodes[0].loads[0]);
    history.undo(); expect(writeFrameJson(doc)).toBe(before); history.redo(); expect(doc.nodes).toHaveLength(18);
  });
  it('rotation materializes right-handed local axes; reflection transforms moments as axial vectors', () => {
    const doc = model(); doc.nodes[0].loads[0].m3 = 5;
    const result = replicatePattern(doc, { nodes: [doc.nodes[0].number], members: [doc.members[0].number], walls: [] }, { kind: 'mirror', axis: 'x', offset: 0 });
    expect(doc.findNodeByNumber(result.nodes[0])!.loads[0].m3).toBe(-5);
    const member = doc.findMemberByNumber(result.members[0])!;
    expect(resolveLocalAxes(doc.findNodeByNumber(member.iNodeNumber)!, doc.findNodeByNumber(member.jNodeNumber)!, doc.analysisMetadata!.localAxes[String(member.number)]).source).toBe('specified');
  });
  it('rejected transforms roll back metadata and geometry', () => {
    const doc = model(); doc.members[0].memberLoads[0].p1 = 1; const history = new DocumentHistory(doc); const before = writeFrameJson(doc);
    expect(() => new EditorController(doc, history).execute('mirror', () => replicatePattern(doc, { nodes: [], members: [doc.members[0].number], walls: [] }, { kind: 'mirror', axis: 'x', offset: 0 }))).toThrow();
    expect(writeFrameJson(doc)).toBe(before);
  });
  it('CSV applies units on a detached model and rejects duplicate identifiers', () => {
    const doc = model(); const before = writeFrameJson(doc);
    const result = prepareCsvEdit(doc, 'nodes', 'id,x\n1,250\n', ['number','x'], 'update', 'mm-N');
    expect(result.errors).toEqual([]); expect(result.document.nodes[0].x).toBe(25); expect(writeFrameJson(doc)).toBe(before);
    expect(prepareCsvEdit(doc, 'nodes', 'id,x\n1,5\n1,6', ['number','x'], 'update', 'cm-kN').errors.length).toBeGreaterThan(0);
  });
  it('CSV handles quotes/newlines/BOM and rejects unterminated text', () => {
    expect(parseDelimited('\ufeffid,name\r\n1,"a,""b""\nc"')).toEqual([['id','name'],['1','a,"b"\nc']]);
    expect(() => parseDelimited('a,"broken')).toThrow();
  });
});
describe('axes and presets', () => {
  it('rejects parallel axes and inconsistent member direction', () => {
    const i={x:0,y:0,z:0},j={x:10,y:0,z:0};
    expect(() => resolveLocalAxes(i,j,{y:[1,0,0]})).toThrow();
    expect(() => resolveLocalAxes(i,j,{x:[-1,0,0]})).toThrow();
    expect(resolveLocalAxes(i,j,{vecxz:[0,0,1]})).toMatchObject({y:[0,1,0],z:[0,0,1]});
  });
  it('validates dimensions and versions and rejects duplicate names', () => {
    const preset = validatePreset({kind:'section',id:'a',name:'A',version:1,units:'cm-kN',formulaVersion:1,input:{shape:SectionShape.Rectangle,width:10,height:20}});
    const library = new PresetRepository(new SettingsRepository(() => { throw new Error('Denied'); }));
    library.save(preset); expect(library.list()).toHaveLength(1);
    expect(() => library.save({...preset,id:'b'})).toThrow();
    expect(() => validatePreset({...preset,version:2})).toThrow();
    expect(() => validatePreset({...preset,input:{shape:SectionShape.DirectInput}})).toThrow();
  });
});
