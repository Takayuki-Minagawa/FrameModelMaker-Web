export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface EqualDOFConstraintMetadata {
  type: 'equalDOF';
  retainedNode: number;
  constrainedNode: number;
  dofs: string[];
  tag?: number | string;
  raw?: { [key: string]: JsonValue };
}

export interface NodalMassMetadata {
  nodeTag: number;
  values: number[];
  raw?: { [key: string]: JsonValue };
}

export interface LocalAxisMetadata {
  x?: number[];
  y?: number[];
  vecxz?: number[];
}

export interface LinkElementMetadata {
  tag: number;
  nodeI: number;
  nodeJ: number;
  directions: string[];
  stiffness: number[];
  orientation?: LocalAxisMetadata;
  shearDistance?: number[];
  raw?: { [key: string]: JsonValue };
}

export interface AnalysisGroupMetadata {
  name: string;
  nodeTags: number[];
  elementTags: number[];
  raw?: JsonValue;
}

export interface SourceTraceabilityMetadata {
  source?: string;
  generatedBy?: string;
  generatedAt?: string;
  raw?: JsonValue;
}

/**
 * FrameModelMaker固有モデルへ完全には写像できない解析YAML情報の保存領域。
 * JSONへそのまま再出力できる値だけを保持する。
 */
export interface AnalysisMetadata {
  sourceFormat: 'analysis-yaml' | string;
  schemaVersion: string;
  units: Record<string, string>;
  ndm?: number;
  ndf?: number;
  constraints: EqualDOFConstraintMetadata[];
  nodalMasses: NodalMassMetadata[];
  linkElements: LinkElementMetadata[];
  localAxes: Record<string, LocalAxisMetadata>;
  groups: AnalysisGroupMetadata[];
  resultExtraction?: JsonValue;
  traceability?: SourceTraceabilityMetadata;
  extensions?: Record<string, JsonValue>;
}
