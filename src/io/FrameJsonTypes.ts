import { AnalysisMetadata } from '../models/AnalysisMetadata';
import { SectionShape, SectionType } from '../models/Section';

export type JsonObject = Record<string, unknown>;

export const CURRENT_FRAME_JSON_FORMAT_VERSION = 2 as const;
export type FrameJsonReadMode = 'strict' | 'lenient';

export interface FrameJsonReadOptions {
  /** strictは不正な型/数値を拒否し、lenientは既定値へ補正して診断を返す。 */
  mode?: FrameJsonReadMode;
}

export interface FrameJsonDiagnostic {
  level: 'warning' | 'info';
  code: string;
  path: string;
  message: string;
}

export interface FrameJsonParseResult {
  formatVersion: typeof CURRENT_FRAME_JSON_FORMAT_VERSION;
  migratedFrom?: number;
  diagnostics: FrameJsonDiagnostic[];
}

export interface FrameJsonDocument {
  formatVersion: typeof CURRENT_FRAME_JSON_FORMAT_VERSION;
  title: string;
  loadCaseCount: number;
  loadCaseIndex: number;
  calcCaseMemo: string[];
  loadCases: Array<{ id: string; name: string; type: string; memo: string }>;
  loadCombinations: Array<{
    id: string;
    name: string;
    memo: string;
    terms: Array<{ loadCaseId: string; factor: number }>;
  }>;
  analysisMetadata: AnalysisMetadata | null;
  nodes: Array<{
    number: number;
    x: number;
    y: number;
    z: number;
    temperature: number;
    intensityGroup: number;
    longWeight: number;
    forceWeight: number;
    addForceWeight: number;
    area: number;
    isShown: boolean;
    loads: Array<{ p1: number; p2: number; p3: number; m1: number; m2: number; m3: number }>;
  }>;
  members: Array<{
    number: number;
    iNodeNumber: number;
    jNodeNumber: number;
    ixSpring: number;
    iySpring: number;
    izSpring: number;
    jxSpring: number;
    jySpring: number;
    jzSpring: number;
    sectionNumber: number;
    p1: number;
    p2: number;
    p3: number;
    isShown: boolean;
    memberLoads: Array<{
      lengthMethod: number;
      type: number;
      direction: number;
      scale: number;
      loadCode: string;
      unitLoad: number;
      p1: number;
      p2: number;
      p3: number;
    }>;
    cmqLoads: Array<{
      moy: number;
      moz: number;
      iMy: number;
      iMz: number;
      iQx: number;
      iQy: number;
      iQz: number;
      jMy: number;
      jMz: number;
      jQx: number;
      jQy: number;
      jQz: number;
    }>;
  }>;
  sections: Array<{
    number: number;
    materialNumber: number;
    type: SectionType;
    shape: SectionShape;
    p1_A: number;
    /** 旧UI互換フィールド。新規処理ではtorsionConstantを使用する。 */
    p2_Ix: number;
    torsionConstant: number;
    p3_Iy: number;
    p4_Iz: number;
    ky: number;
    kz: number;
    comment: string;
  }>;
  materials: Array<{
    number: number;
    young: number;
    shear: number;
    expansion: number;
    poisson: number;
    unitLoad: number;
    name: string;
  }>;
  boundaries: Array<{
    nodeNumber: number;
    deltaX: number;
    deltaY: number;
    deltaZ: number;
    thetaX: number;
    thetaY: number;
    thetaZ: number;
  }>;
  springs: Array<{ number: number; method: number; kTheta: number }>;
  walls: Array<{
    number: number;
    leftBottomNode: number;
    rightBottomNode: number;
    leftTopNode: number;
    rightTopNode: number;
    materialNumber: number;
    method: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    isShown: boolean;
  }>;
}

export interface ParseContext {
  mode: FrameJsonReadMode;
  diagnostics: FrameJsonDiagnostic[];
}
