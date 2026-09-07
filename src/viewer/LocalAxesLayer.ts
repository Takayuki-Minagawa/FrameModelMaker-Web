import { ArrowHelper, Group, Vector3 } from 'three';
import type { FrameDocument } from '../models/FrameDocument';
import { resolveLocalAxes } from '../services/LocalAxes';

export function createLocalAxesLayer(doc: FrameDocument, size: number, selectedMember?: number): Group {
  const group = new Group();
  const nodes = new Map(doc.nodes.map((node) => [node.number, node]));
  for (const member of doc.members) {
    if (!member.isShown || (selectedMember != null && member.number !== selectedMember)) continue;
    const i = nodes.get(member.iNodeNumber);
    const j = nodes.get(member.jNodeNumber);
    if (!i || !j) continue;
    try {
      const axes = resolveLocalAxes(i, j, doc.analysisMetadata?.localAxes[String(member.number)]);
      const origin = new Vector3((i.x + j.x) / 2, (i.y + j.y) / 2, (i.z + j.z) / 2);
      (['x', 'y', 'z'] as const).forEach((key, index) => {
        const arrow = new ArrowHelper(
          new Vector3(...axes[key]),
          origin,
          size,
          [0xe53935, 0x43a047, 0x1e88e5][index],
        );
        arrow.userData = { memberNumber: member.number, axis: key, source: axes.source };
        group.add(arrow);
      });
    } catch {
      /* Invalid orientation is reported by the model validator, never silently drawn. */
    }
  }
  return group;
}
