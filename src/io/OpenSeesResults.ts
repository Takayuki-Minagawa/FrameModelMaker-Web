import { parseAnalysisResult, type ResultForce6 } from '../models/AnalysisResult';
import { FrameDocument } from '../models/FrameDocument';
import { resolveLocalAxes } from '../services/LocalAxes';
import { modelFingerprint } from '../services/ModelFingerprint';
import { unitScales } from '../services/Units';

type Raw = Record<string, unknown>;
function object(value: unknown): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an OpenSees result object.');
  return value as Raw;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an OpenSees result array.');
  return value;
}
function vector(value: unknown, length: number): number[] {
  const numbers = array(value);
  if (
    numbers.length !== length ||
    !numbers.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
    throw new Error(`Expected ${length} finite values.`);
  return numbers as number[];
}
function positiveTag(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    throw new Error('Invalid solver/model tag.');
  return value;
}
function force(values: number[], forceScale: number, momentScale: number, sign = 1): ResultForce6 {
  return {
    axial: values[0] * forceScale * sign,
    shearY: values[1] * forceScale * sign,
    shearZ: values[2] * forceScale * sign,
    torsion: values[3] * momentScale * sign,
    momentY: values[4] * momentScale * sign,
    momentZ: values[5] * momentScale * sign,
  };
}

/** Explicit adapter for 3D elasticBeamColumn localForce, not arbitrary solver JSON. */
export async function convertOpenSeesResults(text: string, doc: FrameDocument) {
  const raw = object(JSON.parse(text));
  if (raw.format !== 'opensees-recorder-v1' || raw.forceConvention !== 'local-end-resisting')
    throw new Error('Unsupported OpenSees recorder contract.');
  const fingerprint = await modelFingerprint(doc);
  if (raw.modelFingerprint !== fingerprint)
    throw new Error('OpenSees results belong to a different model revision.');
  const units = object(raw.units);
  const {
    length: lengthScale,
    force: forceScale,
    moment: momentScale,
  } = unitScales(units.length, units.force);
  if (units.time !== 's') throw new Error('Unsupported recorder time units.');
  const nodeMap = new Map<number, number>();
  const usedNodes = new Set<number>();
  for (const value of array(raw.nodes)) {
    const item = object(value);
    const tag = positiveTag(item.tag);
    const number = positiveTag(item.nodeNumber);
    const node = doc.findNodeByNumber(number);
    const coordinates = vector(item.coordinates, 3);
    if (
      !node ||
      nodeMap.has(tag) ||
      usedNodes.has(number) ||
      [node.x, node.y, node.z].some(
        (n, i) => Math.abs(n - coordinates[i] * lengthScale) > 1e-7 * Math.max(1, Math.abs(n)),
      )
    )
      throw new Error('Node mapping or coordinates differ from the model.');
    nodeMap.set(tag, number);
    usedNodes.add(number);
  }
  const memberMap = new Map<number, number>();
  const usedMembers = new Set<number>();
  for (const value of array(raw.members)) {
    const item = object(value);
    const tag = positiveTag(item.tag);
    const number = positiveTag(item.memberNumber);
    const member = doc.findMemberByNumber(number);
    if (
      item.type !== 'elasticBeamColumn3D' ||
      !member ||
      memberMap.has(tag) ||
      usedMembers.has(number) ||
      member.iNodeNumber !== nodeMap.get(positiveTag(item.nodeI)) ||
      member.jNodeNumber !== nodeMap.get(positiveTag(item.nodeJ))
    )
      throw new Error('Unsupported element type or member mapping.');
    const axes = resolveLocalAxes(
      doc.findNodeByNumber(member.iNodeNumber)!,
      doc.findNodeByNumber(member.jNodeNumber)!,
      doc.analysisMetadata?.localAxes[String(number)],
    );
    const localY = vector(item.localY, 3);
    if (axes.y.some((n, i) => Math.abs(n - localY[i]) > 1e-7))
      throw new Error('OpenSees local axes differ from the model.');
    memberMap.set(tag, number);
    usedMembers.add(number);
  }
  const frames = array(raw.frames).map((value) => {
    const frame = object(value);
    if (typeof frame.time !== 'number' || !Number.isFinite(frame.time))
      throw new Error('Recorder time must be finite.');
    return {
      time: frame.time,
      nodes: array(frame.nodes).map((value) => {
        const node = object(value);
        const number = nodeMap.get(positiveTag(node.tag));
        if (!number) throw new Error('Unknown result node.');
        const displacement = vector(node.displacement, 6);
        const reaction = vector(node.reaction, 6);
        return {
          nodeNumber: number,
          displacement: displacement.slice(0, 3).map((value) => value * lengthScale),
          rotation: displacement.slice(3),
          reaction: force(reaction, forceScale, momentScale),
        };
      }),
      members: array(frame.members).map((value) => {
        const member = object(value);
        const number = memberMap.get(positiveTag(member.tag));
        if (!number) throw new Error('Unknown result member.');
        const values = vector(member.localForce, 12);
        // I-end resisting actions oppose the positive-x cut-face convention; J-end actions agree.
        const iEnd = force(values.slice(0, 6), forceScale, momentScale, -1);
        const jEnd = force(values.slice(6), forceScale, momentScale);
        const stations =
          member.stations == null
            ? undefined
            : array(member.stations).map((value) => {
                const station = object(value);
                return {
                  position: station.position,
                  ...force(vector(station.force, 6), forceScale, momentScale),
                };
              });
        return { memberNumber: number, iEnd, jEnd, ...(stations ? { stations } : {}) };
      }),
    };
  });
  return parseAnalysisResult(
    JSON.stringify({
      formatVersion: 1,
      title: raw.title ?? 'OpenSees',
      modelFingerprint: fingerprint,
      units: { length: 'cm', force: 'kN', moment: 'kN-cm', time: 's' },
      coordinateSystem: 'global-xyz',
      nodeReactionSystem: 'global-xyz',
      memberForceSystem: 'local-xyz',
      loadCaseId: raw.loadCaseId,
      frames,
      metadata: {
        solver: 'OpenSees',
        elementType: 'elasticBeamColumn3D',
        forceConvention: 'positive-x-cut-face',
      },
    }),
  );
}
