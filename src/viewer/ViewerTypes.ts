import type * as THREE from 'three';
import type { FrameDocument } from '../models/FrameDocument';

export type ViewerSelection =
  | { kind: 'none' }
  | { kind: 'node'; nodeNumber: number }
  | { kind: 'member'; memberNumber: number }
  | { kind: 'wall'; wallNumber: number; memberNumber?: never };

export type ProjectionMode = 'perspective' | 'orthographic';
export type StandardView = 'top' | 'front' | 'side' | 'isometric';

export interface ViewerCameraState {
  projection: ProjectionMode;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  zoom: number;
  /** Vertical world-space span before zoom; only used by orthographic cameras. */
  orthographicHeight?: number;
}

export interface ViewerLayers {
  grid: boolean;
  axes: boolean;
  nodes: boolean;
  members: boolean;
  walls: boolean;
  boundaries: boolean;
  loads: boolean;
  results: boolean;
  labels: boolean;
}

export type SelectionDisplayMode = 'normal' | 'selected-only' | 'dim-others';
export type MemberColorMode = 'default' | 'section' | 'material' | 'element-type';

export interface ColorLegendEntry {
  key: string;
  label: string;
  color: string;
}

export interface MemberColorContext {
  memberNumber: number;
  sectionNumber: number;
  materialNumber: number;
  elementType: number | null;
}

export type MemberColorResolver = (
  context: MemberColorContext,
  document: FrameDocument,
) => THREE.ColorRepresentation | null | undefined;

export type LabelDensityMode = 'all' | 'auto' | 'selected-only';

export interface LabelDensityOptions {
  mode: LabelDensityMode;
  /** Maximum labels rendered across every enabled entity kind. */
  maxLabels: number;
  /** Minimum screen-space distance between label anchors. */
  minSpacingPx: number;
}

export interface LoadDisplayOptions {
  visible: boolean;
  showValues: boolean;
  showForces: boolean;
  showMoments: boolean;
  /** World-space symbol length multiplier. Kept constant across load cases. */
  scale: number;
  forceColor: THREE.ColorRepresentation;
  momentColor: THREE.ColorRepresentation;
}

export type ViewerGlyph =
  | {
      kind: 'arrow';
      origin: [number, number, number];
      vector: [number, number, number];
      color?: THREE.ColorRepresentation;
      label?: string;
    }
  | {
      kind: 'polyline';
      points: Array<[number, number, number]>;
      color?: THREE.ColorRepresentation;
      closed?: boolean;
      label?: string;
    }
  | {
      kind: 'label';
      position: [number, number, number];
      text: string;
      color?: string;
    };

/**
 * Adapter point for member-load and CMQ visualization. Their direction, local
 * axes and sign conventions are intentionally left to the caller until the
 * structural model owns an unambiguous convention.
 */
export type LoadGlyphProvider = (
  document: FrameDocument,
  loadCaseIndex: number,
) => readonly ViewerGlyph[];

export type ViewMode =
  | { kind: '3d' }
  | { kind: 'plan'; elevation?: number }
  | { kind: 'elevation-x'; offset?: number }
  | { kind: 'elevation-y'; offset?: number };

export type DrawingMode = 'none' | 'node' | 'member' | 'move' | 'duplicate';

export type DrawingEvent =
  | {
      type: 'node-create';
      position: [number, number, number];
      existingNodeNumber?: number;
    }
  | {
      type: 'member-start';
      position: [number, number, number];
      nodeNumber?: number;
    }
  | {
      type: 'member-create';
      start: [number, number, number];
      end: [number, number, number];
      startNodeNumber?: number;
      endNodeNumber?: number;
    }
  | {
      type: 'selection-move';
      selection: Exclude<ViewerSelection, { kind: 'none' }>;
      target: [number, number, number];
      duplicate: boolean;
    }
  | { type: 'cancel' };

export interface DrawingOptions {
  gridSpacing: number;
  snapToGrid: boolean;
  snapToNodes: boolean;
  nodeSnapRadiusPx: number;
}

export type Vector3Tuple = [number, number, number];

export interface NodeAnalysisResult {
  nodeNumber: number;
  displacement?: Vector3Tuple;
  rotation?: Vector3Tuple;
  reaction?: Vector3Tuple;
  reactionMoment?: Vector3Tuple;
}

export interface MemberForceStation {
  /** Normalized member coordinate in the inclusive range 0..1. */
  position: number;
  axial?: number;
  shearY?: number;
  shearZ?: number;
  torsion?: number;
  momentY?: number;
  momentZ?: number;
}

export interface MemberAnalysisResult {
  memberNumber: number;
  stations?: MemberForceStation[];
}

export interface AnalysisResultFrame {
  time?: number;
  nodes: NodeAnalysisResult[];
  members?: MemberAnalysisResult[];
}

export interface AnalysisResultSet {
  id?: string;
  name?: string;
  loadCaseId?: string;
  combinationId?: string;
  units?: Partial<Record<'length' | 'force' | 'moment' | 'time', string>>;
  frames: AnalysisResultFrame[];
}

export type SectionForceComponent =
  | 'axial'
  | 'shearY'
  | 'shearZ'
  | 'torsion'
  | 'momentY'
  | 'momentZ';

export interface ResultDisplayOptions {
  showDeformation: boolean;
  showReactions: boolean;
  showUndeformed: boolean;
  deformationScale: number;
  reactionScale: number;
  sectionForce: SectionForceComponent | null;
  sectionForceScale: number;
}

export interface ResultAnimationOptions {
  fps?: number;
  loop?: boolean;
  onFrame?: (frameIndex: number, frame: AnalysisResultFrame) => void;
}
