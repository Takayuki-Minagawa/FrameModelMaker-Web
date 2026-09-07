import { FrameDocument } from '../models/FrameDocument';
import { LoadCase } from '../models/LoadCase';

import { CURRENT_FRAME_JSON_FORMAT_VERSION, FrameJsonDocument } from './FrameJsonTypes';
import { deepJsonClone } from './FrameJsonValues';

export function toFrameJson(document: FrameDocument): FrameJsonDocument {
  const loadCaseCount = Math.max(1, document.loadCaseCount, document.loadCases.length);
  const loadCases = Array.from({ length: loadCaseCount }, (_, index) => {
    const loadCase = document.loadCases[index] ?? new LoadCase(`LC${index + 1}`, `Load Case ${index + 1}`);
    return { id: loadCase.id, name: loadCase.name, type: loadCase.type, memo: loadCase.memo };
  });
  return {
    formatVersion: CURRENT_FRAME_JSON_FORMAT_VERSION,
    title: document.title,
    loadCaseCount,
    loadCaseIndex: Math.min(Math.max(0, document.loadCaseIndex), loadCaseCount - 1),
    calcCaseMemo: [...document.calcCaseMemo],
    loadCases,
    loadCombinations: document.loadCombinations.map((combination) => ({
      id: combination.id,
      name: combination.name,
      memo: combination.memo,
      terms: combination.terms.map((term) => ({ ...term })),
    })),
    analysisMetadata: document.analysisMetadata == null ? null : deepJsonClone(document.analysisMetadata),
    nodes: document.nodes.map((node) => ({
      number: node.number,
      x: node.x,
      y: node.y,
      z: node.z,
      temperature: node.temperature,
      intensityGroup: node.intensityGroup,
      longWeight: node.longWeight,
      forceWeight: node.forceWeight,
      addForceWeight: node.addForceWeight,
      area: node.area,
      isShown: node.isShown,
      loads: node.loads.map((load) => ({
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
        m1: load.m1,
        m2: load.m2,
        m3: load.m3,
      })),
    })),
    members: document.members.map((member) => ({
      number: member.number,
      iNodeNumber: member.iNodeNumber,
      jNodeNumber: member.jNodeNumber,
      ixSpring: member.ixSpring,
      iySpring: member.iySpring,
      izSpring: member.izSpring,
      jxSpring: member.jxSpring,
      jySpring: member.jySpring,
      jzSpring: member.jzSpring,
      sectionNumber: member.sectionNumber,
      p1: member.p1,
      p2: member.p2,
      p3: member.p3,
      isShown: member.isShown,
      memberLoads: member.memberLoads.map((load) => ({
        lengthMethod: load.lengthMethod,
        type: load.type,
        direction: load.direction,
        scale: load.scale,
        loadCode: load.loadCode,
        unitLoad: load.unitLoad,
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
      })),
      cmqLoads: member.cmqLoads.map((load) => ({
        moy: load.moy,
        moz: load.moz,
        iMy: load.iMy,
        iMz: load.iMz,
        iQx: load.iQx,
        iQy: load.iQy,
        iQz: load.iQz,
        jMy: load.jMy,
        jMz: load.jMz,
        jQx: load.jQx,
        jQy: load.jQy,
        jQz: load.jQz,
      })),
    })),
    sections: document.sections.map((section) => ({
      number: section.number,
      materialNumber: section.materialNumber,
      type: section.type,
      shape: section.shape,
      p1_A: section.p1_A,
      p2_Ix: section.p2_Ix,
      torsionConstant: section.torsionConstant,
      p3_Iy: section.p3_Iy,
      p4_Iz: section.p4_Iz,
      ky: section.ky,
      kz: section.kz,
      comment: section.comment,
    })),
    materials: document.materials.map((material) => ({
      number: material.number,
      young: material.young,
      shear: material.shear,
      expansion: material.expansion,
      poisson: material.poisson,
      unitLoad: material.unitLoad,
      name: material.name,
    })),
    boundaries: document.boundaries.map((boundary) => ({
      nodeNumber: boundary.nodeNumber,
      deltaX: boundary.deltaX,
      deltaY: boundary.deltaY,
      deltaZ: boundary.deltaZ,
      thetaX: boundary.thetaX,
      thetaY: boundary.thetaY,
      thetaZ: boundary.thetaZ,
    })),
    springs: document.springs.map((spring) => ({
      number: spring.number,
      method: spring.method,
      kTheta: spring.kTheta,
    })),
    walls: document.walls.map((wall) => ({
      number: wall.number,
      leftBottomNode: wall.leftBottomNode,
      rightBottomNode: wall.rightBottomNode,
      leftTopNode: wall.leftTopNode,
      rightTopNode: wall.rightTopNode,
      materialNumber: wall.materialNumber,
      method: wall.method,
      p1: wall.p1,
      p2: wall.p2,
      p3: wall.p3,
      p4: wall.p4,
      isShown: wall.isShown,
    })),
  };
}

export function writeFrameJson(document: FrameDocument): string {
  return JSON.stringify(toFrameJson(document), null, 2);
}
