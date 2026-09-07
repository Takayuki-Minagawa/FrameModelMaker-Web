import { it, expect, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { FrameDocument } from '../../src/models/FrameDocument';
import { drawResultGeometry } from '../../src/viewer/ResultGeometry';
import { disposeObject3D } from '../../src/viewer/ViewerResources';
it('result geometry follows the same isolation and visibility rules as the model', () => {
  const doc = new FrameDocument();
  doc.addNode(doc.createNode(0, 0, 0));
  doc.addNode(doc.createNode(100, 0, 0));
  const member = doc.createMember();
  member.iNodeNumber = 1;
  member.jNodeNumber = 2;
  doc.addMember(member);
  const ctx: Parameters<typeof drawResultGeometry>[0] = {
    doc,
    analysisResults: {
      frames: [
        {
          nodes: [{ nodeNumber: 1, displacement: [0, 1, 0], reaction: [1, 0, 0] }],
          members: [
            {
              memberNumber: 1,
              stations: [
                { position: 0, momentZ: 1 },
                { position: 1, momentZ: 0 },
              ],
            },
          ],
        },
      ],
    },
    resultFrameIndex: 0,
    resultOptions: {
      showDeformation: true,
      showReactions: true,
      showUndeformed: true,
      deformationScale: 1,
      reactionScale: 1,
      sectionForce: 'momentZ',
      sectionForceScale: 1,
    },
    nodeIndex: new Map(doc.nodes.map((n) => [n.number, n])),
    memberIndex: new Map([[1, member]]),
    linkOrientationIndex: new Map(),
    resultGroup: new Group(),
    controls: { target: new Vector3() },
    isDark: false,
    resultLabels: [],
    getSymbolSize: () => 10,
    addScaledArrow: vi.fn(),
    drawMomentGlyph: vi.fn(),
    entityPassesIsolation: () => false,
  };
  drawResultGeometry(ctx);
  expect(ctx.resultGroup.children).toHaveLength(0);
  expect(ctx.addScaledArrow).not.toHaveBeenCalled();
  ctx.entityPassesIsolation = () => true;
  doc.nodes.forEach((n) => (n.isShown = false));
  member.isShown = false;
  drawResultGeometry(ctx);
  expect(ctx.resultGroup.children).toHaveLength(0);
  expect(ctx.addScaledArrow).not.toHaveBeenCalled();
  doc.nodes.forEach((n) => (n.isShown = true));
  member.isShown = true;
  drawResultGeometry(ctx);
  expect(ctx.resultGroup.children.length).toBeGreaterThan(0);
  expect(ctx.addScaledArrow).toHaveBeenCalledOnce();
  disposeObject3D(ctx.resultGroup);
});
