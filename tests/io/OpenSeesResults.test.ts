import { it, expect } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { modelFingerprint } from '../../src/services/ModelFingerprint';
import { convertOpenSeesResults } from '../../src/io/OpenSeesResults';
import { adaptAnalysisResult } from '../../src/viewer/ResultsAdapter';
async function beam() {
  const doc = new FrameDocument(); doc.addNode(doc.createNode(0,0,0)); doc.addNode(doc.createNode(100,0,0));
  const member = doc.createMember(); member.iNodeNumber=1; member.jNodeNumber=2; doc.addMember(member);
  // Analytic cantilever: L=1m, transverse tip force -1kN, EI=100kN m².
  // dy=-PL³/(3EI), rz=-PL²/(2EI); root reactions +1kN,+1kN m.
  const raw = {format:'opensees-recorder-v1',forceConvention:'local-end-resisting',modelFingerprint:await modelFingerprint(doc),units:{length:'m',force:'kN',time:'s'},
    nodes:[{tag:11,nodeNumber:1,coordinates:[0,0,0]},{tag:12,nodeNumber:2,coordinates:[1,0,0]}],
    members:[{tag:21,memberNumber:1,type:'elasticBeamColumn3D',nodeI:11,nodeJ:12,localY:[0,1,0]}],
    frames:[{time:0,nodes:[{tag:11,displacement:[0,0,0,0,0,0],reaction:[0,1,0,0,0,1]}, {tag:12,displacement:[0,-1/300,0,0,0,-1/200],reaction:[0,0,0,0,0,0]}],
      members:[{tag:21,localForce:[0,1,0,0,0,1,0,-1,0,0,0,0], stations:[{position:0,force:[0,-1,0,0,0,-1]},{position:.5,force:[0,-1,0,0,0,-.5]},{position:1,force:[0,-1,0,0,0,0]}]}]}]};
  return {doc,raw};
}
it('cantilever conversion preserves displacement, reaction balance, local force signs and intermediate station', async () => {
  const {doc,raw}=await beam();const result=await convertOpenSeesResults(JSON.stringify(raw),doc);const frame=result.frames[0];
  expect(frame.nodes[1].displacement.y).toBeCloseTo(-1/3,12);expect(frame.nodes[1].rotation.z).toBe(-.005);
  expect(frame.nodes[0].reaction!.shearY-1).toBe(0);expect(frame.nodes[0].reaction!.momentZ-100).toBe(0);
  expect(frame.members[0].iEnd.momentZ).toBe(-100);expect(frame.members[0].jEnd.shearY).toBe(-1);
  expect(adaptAnalysisResult(result).frames[0].members![0].stations![1].momentZ).toBe(-50);
});
it('rejects changed model, reversed connectivity, foreign local axis, wrong units and unsupported element', async () => {
  const {doc,raw}=await beam();
  for (const change of [ (v:typeof raw)=>{v.units.force='kg';},(v:typeof raw)=>{v.members[0].localY=[0,0,1];},(v:typeof raw)=>{v.members[0].nodeI=12;},(v:typeof raw)=>{v.members[0].type='truss';}]) {
    const copy=structuredClone(raw);change(copy);await expect(convertOpenSeesResults(JSON.stringify(copy),doc)).rejects.toThrow();
  }
  doc.nodes[1].x=200;await expect(convertOpenSeesResults(JSON.stringify(raw),doc)).rejects.toThrow(/revision/);
});
it('fingerprint ignores title/visibility but includes loads and section data', async () => {
  const {doc}=await beam();const hash=await modelFingerprint(doc);doc.title='renamed';doc.nodes[0].isShown=false;expect(await modelFingerprint(doc)).toBe(hash);
  doc.nodes[0].loads[0].p1=1;expect(await modelFingerprint(doc)).not.toBe(hash);
});

it('converts the recorded output of the independently executed OpenSees cantilever', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseFrameJson } = await import('../../src/io/FrameJson');
  const doc = new FrameDocument(); parseFrameJson(readFileSync('public/samples/contracts/frame-v2.json','utf8'),doc);
  const result = await convertOpenSeesResults(readFileSync('tests/fixtures/opensees-cantilever.json','utf8'),doc);
  expect(result.frames[0].nodes[1].displacement.y).toBeCloseTo(-1/3,10);
  expect(result.frames[0].nodes[0].reaction!.momentZ).toBeCloseTo(100,10);
  expect(result.frames[0].members[0].iEnd.momentZ).toBeCloseTo(-100,10);
});

it('rejects stations inconsistent with the separately declared end actions', async () => {
  const {doc,raw}=await beam();raw.frames[0].members[0].stations[0].force[5]=123;
  await expect(convertOpenSeesResults(JSON.stringify(raw),doc)).rejects.toThrow(/endpoint/);
});
