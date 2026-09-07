import type { AnalysisResult } from '../models/AnalysisResult';
import type { AnalysisResultSet } from './ViewerTypes';

export function adaptAnalysisResult(result: AnalysisResult): AnalysisResultSet {
  return {
    id: result.title,
    name: result.title,
    loadCaseId: result.loadCaseId,
    combinationId: result.combinationId,
    units: result.units,
    frames: result.frames.map((frame) => ({
      time: frame.time,
      nodes: frame.nodes.map((node) => ({
        nodeNumber: node.nodeNumber,
        displacement: [node.displacement.x, node.displacement.y, node.displacement.z],
        rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
        reaction: node.reaction
          ? [node.reaction.axial, node.reaction.shearY, node.reaction.shearZ]
          : undefined,
        reactionMoment: node.reaction
          ? [node.reaction.torsion, node.reaction.momentY, node.reaction.momentZ]
          : undefined,
      })),
      members: frame.members.map((member) => ({
        memberNumber: member.memberNumber,
        stations: member.stations ?? [
          { position: 0, ...member.iEnd },
          { position: 1, ...member.jEnd },
        ],
      })),
    })),
  };
}
