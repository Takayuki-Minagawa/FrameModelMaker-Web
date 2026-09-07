import * as THREE from 'three';
import type { FrameDocument } from '../models/FrameDocument';
import { resolveLocalAxes } from '../services/LocalAxes';
import { hasDrawableMemberSpan } from './ViewerInput';
import type { AnalysisResultSet, ResultDisplayOptions } from './ViewerTypes';

interface ResultGeometryContext {
  doc: FrameDocument;
  analysisResults: AnalysisResultSet | null;
  resultFrameIndex: number;
  resultOptions: ResultDisplayOptions;
  nodeIndex: Map<number, FrameDocument['nodes'][number]>;
  memberIndex: Map<number, FrameDocument['members'][number]>;
  linkOrientationIndex: Map<number, { y?: number[]; vecxz?: number[] }>;
  resultGroup: THREE.Group;
  controls: { target: THREE.Vector3 };
  isDark: boolean;
  resultLabels: { position: THREE.Vector3; text: string; color: string; priority: number }[];
  entityPassesIsolation(kind: 'node' | 'member', number: number): boolean;
  getSymbolSize(): number;
  addScaledArrow(
    origin: THREE.Vector3,
    vector: THREE.Vector3,
    symbolSize: number,
    scale: number,
    color: THREE.ColorRepresentation,
    group: THREE.Group,
  ): void;
  drawMomentGlyph(
    origin: THREE.Vector3,
    vector: THREE.Vector3,
    size: number,
    color: THREE.ColorRepresentation,
    group: THREE.Group,
  ): void;
}
const COLORS = { result: 0xeb2f96, resultForce: 0xff9800 };
const NODE_POINT_SIZE = 8;
export function drawResultGeometry(ctx: ResultGeometryContext): void {
  const frame = ctx.analysisResults?.frames[ctx.resultFrameIndex];
  if (!frame) return;
  const nodeResults = new Map(frame.nodes.map((result) => [result.nodeNumber, result] as const));
  const deformedPosition = (nodeNumber: number): THREE.Vector3 | null => {
    const node = ctx.nodeIndex.get(nodeNumber);
    if (!node) return null;
    const displacement = nodeResults.get(nodeNumber)?.displacement ?? [0, 0, 0];
    return new THREE.Vector3(node.x, node.y, node.z).addScaledVector(
      new THREE.Vector3(...displacement),
      ctx.resultOptions.deformationScale,
    );
  };

  if (ctx.resultOptions.showDeformation) {
    const positions: number[] = [];
    const nodePositions: number[] = [];
    for (const node of ctx.doc.nodes) {
      if (!node.isShown || !ctx.entityPassesIsolation('node', node.number)) continue;
      const position = deformedPosition(node.number);
      if (position) nodePositions.push(...position.toArray());
    }
    for (const member of ctx.doc.members) {
      if (!member.isShown || !ctx.entityPassesIsolation('member', member.number)) continue;
      const i = deformedPosition(member.iNodeNumber);
      const j = deformedPosition(member.jNodeNumber);
      if (!i || !j) continue;
      positions.push(...i.toArray(), ...j.toArray());
    }
    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      ctx.resultGroup.add(
        new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: COLORS.result })),
      );
    }
    if (nodePositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
      ctx.resultGroup.add(
        new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ color: COLORS.result, size: NODE_POINT_SIZE, sizeAttenuation: false }),
        ),
      );
    }
  }

  if (ctx.resultOptions.showReactions) {
    const symbolSize = ctx.getSymbolSize();
    for (const result of frame.nodes) {
      const node = ctx.nodeIndex.get(result.nodeNumber);
      if (!node || !node.isShown || !ctx.entityPassesIsolation('node', node.number)) continue;
      const origin = new THREE.Vector3(node.x, node.y, node.z);
      if (result.reaction) {
        const reaction = new THREE.Vector3(...result.reaction);
        if (reaction.lengthSq() > 0) {
          ctx.addScaledArrow(
            origin,
            reaction,
            symbolSize,
            ctx.resultOptions.reactionScale,
            COLORS.resultForce,
            ctx.resultGroup,
          );
        }
      }
      if (result.reactionMoment) {
        const moment = new THREE.Vector3(...result.reactionMoment);
        if (moment.lengthSq() > 0) {
          ctx.drawMomentGlyph(
            origin,
            moment,
            symbolSize * Math.max(ctx.resultOptions.reactionScale, 0.01),
            COLORS.resultForce,
            ctx.resultGroup,
          );
        }
      }
    }
  }

  const forceComponent = ctx.resultOptions.sectionForce;
  if (forceComponent) {
    for (const result of frame.members ?? []) {
      const member = ctx.memberIndex.get(result.memberNumber);
      if (!member || !member.isShown || !ctx.entityPassesIsolation('member', member.number)) continue;
      const iNode = member ? ctx.nodeIndex.get(member.iNodeNumber) : undefined;
      const jNode = member ? ctx.nodeIndex.get(member.jNodeNumber) : undefined;
      if (!iNode || !jNode || !result.stations || result.stations.length === 0) continue;
      if (!hasDrawableMemberSpan(iNode, jNode)) continue;
      const i = new THREE.Vector3(iNode.x, iNode.y, iNode.z);
      const j = new THREE.Vector3(jNode.x, jNode.y, jNode.z);
      let axes;
      try {
        axes = resolveLocalAxes(
          iNode,
          jNode,
          ctx.doc.analysisMetadata?.localAxes[String(result.memberNumber)] ??
            ctx.linkOrientationIndex.get(result.memberNumber),
        );
      } catch {
        continue;
      }
      const localY = new THREE.Vector3(...axes.y);
      const localZ = new THREE.Vector3(...axes.z);
      const diagramAxis = forceComponent === 'shearZ' || forceComponent === 'momentY' ? localZ : localY;
      const points: THREE.Vector3[] = [];
      const stems: number[] = [];
      for (const station of result.stations) {
        const t = THREE.MathUtils.clamp(station.position, 0, 1);
        const base = i.clone().lerp(j, t);
        const value = station[forceComponent] ?? 0;
        const offset = diagramAxis.clone().multiplyScalar(value * ctx.resultOptions.sectionForceScale);
        const tip = base.clone().add(offset);
        points.push(tip);
        stems.push(...base.toArray(), ...tip.toArray());
      }
      if (points.length > 1) {
        ctx.resultGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: COLORS.resultForce }),
          ),
        );
      }
      if (stems.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(stems, 3));
        ctx.resultGroup.add(
          new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({ color: COLORS.resultForce, transparent: true, opacity: 0.6 }),
          ),
        );
      }
    }
  }

  if (frame.time !== undefined) {
    ctx.resultLabels.push({
      position: ctx.controls.target.clone(),
      text: `t = ${frame.time}${ctx.analysisResults?.units?.time ? ` ${ctx.analysisResults.units.time}` : ''}`,
      color: ctx.isDark ? '#ff9ad5' : '#a00064',
      priority: 100,
    });
  }
}
