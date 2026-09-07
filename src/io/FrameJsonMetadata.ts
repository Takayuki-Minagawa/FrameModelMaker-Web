import { AnalysisMetadata, LocalAxisMetadata } from '../models/AnalysisMetadata';

import { ParseContext } from './FrameJsonTypes';
import {
  cloneJsonObject,
  cloneJsonValue,
  hasOwn,
  invalidValue,
  readArray,
  readIntegerArray,
  readNumberArray,
  readNumberOrString,
  readObject,
  readRequiredObject,
  readStringArray,
  toInt,
  toString_,
} from './FrameJsonValues';

export function parseLocalAxisMetadata(
  value: unknown,
  path: string,
  context: ParseContext,
): LocalAxisMetadata {
  const object = readRequiredObject(value, path, context);
  const result: LocalAxisMetadata = {};
  if (object.x != null) result.x = readNumberArray(object.x, `${path}.x`, context);
  if (object.y != null) result.y = readNumberArray(object.y, `${path}.y`, context);
  if (object.vecxz != null) result.vecxz = readNumberArray(object.vecxz, `${path}.vecxz`, context);
  return result;
}

export function parseAnalysisMetadata(value: unknown, context: ParseContext): AnalysisMetadata {
  const path = '$.analysisMetadata';
  const object = readRequiredObject(value, path, context);
  const unitsObject = readObject(object.units, `${path}.units`, context);
  const units: Record<string, string> = {};
  for (const [key, item] of Object.entries(unitsObject)) {
    units[key] = toString_(item, `${path}.units.${key}`, context);
  }

  const constraints = readArray(object.constraints, `${path}.constraints`, context).map(
    (item, index): AnalysisMetadata['constraints'][number] => {
      const itemPath = `${path}.constraints[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const type = toString_(raw.type, `${itemPath}.type`, context, 'equalDOF');
      if (type !== 'equalDOF') invalidValue(context, `${itemPath}.type`, '"equalDOF"', type);
      const constraint: AnalysisMetadata['constraints'][number] = {
        type: 'equalDOF',
        retainedNode: toInt(raw.retainedNode, `${itemPath}.retainedNode`, context),
        constrainedNode: toInt(raw.constrainedNode, `${itemPath}.constrainedNode`, context),
        dofs: readStringArray(raw.dofs, `${itemPath}.dofs`, context),
      };
      const tag = readNumberOrString(raw.tag, `${itemPath}.tag`, context);
      if (tag !== undefined) constraint.tag = tag;
      if (raw.raw != null) constraint.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return constraint;
    },
  );

  const nodalMasses = readArray(object.nodalMasses, `${path}.nodalMasses`, context).map(
    (item, index): AnalysisMetadata['nodalMasses'][number] => {
      const itemPath = `${path}.nodalMasses[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const mass: AnalysisMetadata['nodalMasses'][number] = {
        nodeTag: toInt(raw.nodeTag, `${itemPath}.nodeTag`, context),
        values: readNumberArray(raw.values, `${itemPath}.values`, context),
      };
      if (raw.raw != null) mass.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return mass;
    },
  );

  const linkElements = readArray(object.linkElements, `${path}.linkElements`, context).map(
    (item, index): AnalysisMetadata['linkElements'][number] => {
      const itemPath = `${path}.linkElements[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const link: AnalysisMetadata['linkElements'][number] = {
        tag: toInt(raw.tag, `${itemPath}.tag`, context),
        nodeI: toInt(raw.nodeI, `${itemPath}.nodeI`, context),
        nodeJ: toInt(raw.nodeJ, `${itemPath}.nodeJ`, context),
        directions: readStringArray(raw.directions, `${itemPath}.directions`, context),
        stiffness: readNumberArray(raw.stiffness, `${itemPath}.stiffness`, context),
      };
      if (raw.orientation != null) {
        link.orientation = parseLocalAxisMetadata(raw.orientation, `${itemPath}.orientation`, context);
      }
      if (raw.shearDistance != null) {
        link.shearDistance = readNumberArray(raw.shearDistance, `${itemPath}.shearDistance`, context);
      }
      if (raw.raw != null) link.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return link;
    },
  );

  const localAxesObject = readObject(object.localAxes, `${path}.localAxes`, context);
  const localAxes: Record<string, LocalAxisMetadata> = {};
  for (const [tag, axis] of Object.entries(localAxesObject)) {
    localAxes[tag] = parseLocalAxisMetadata(axis, `${path}.localAxes.${tag}`, context);
  }

  const groups = readArray(object.groups, `${path}.groups`, context).map(
    (item, index): AnalysisMetadata['groups'][number] => {
      const itemPath = `${path}.groups[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const group: AnalysisMetadata['groups'][number] = {
        name: toString_(raw.name, `${itemPath}.name`, context),
        nodeTags: readIntegerArray(raw.nodeTags, `${itemPath}.nodeTags`, context),
        elementTags: readIntegerArray(raw.elementTags, `${itemPath}.elementTags`, context),
      };
      if (hasOwn(raw, 'raw')) group.raw = cloneJsonValue(raw.raw, `${itemPath}.raw`, context);
      return group;
    },
  );

  const metadata: AnalysisMetadata = {
    sourceFormat: toString_(object.sourceFormat, `${path}.sourceFormat`, context),
    schemaVersion: toString_(object.schemaVersion, `${path}.schemaVersion`, context),
    units,
    constraints,
    nodalMasses,
    linkElements,
    localAxes,
    groups,
  };
  if (object.ndm != null) metadata.ndm = toInt(object.ndm, `${path}.ndm`, context);
  if (object.ndf != null) metadata.ndf = toInt(object.ndf, `${path}.ndf`, context);
  if (hasOwn(object, 'resultExtraction')) {
    metadata.resultExtraction = cloneJsonValue(object.resultExtraction, `${path}.resultExtraction`, context);
  }
  if (object.traceability != null) {
    const tracePath = `${path}.traceability`;
    const raw = readRequiredObject(object.traceability, tracePath, context);
    const traceability: NonNullable<AnalysisMetadata['traceability']> = {};
    if (raw.source != null) {
      traceability.source = toString_(raw.source, `${tracePath}.source`, context);
    }
    if (raw.generatedBy != null) {
      traceability.generatedBy = toString_(raw.generatedBy, `${tracePath}.generatedBy`, context);
    }
    if (raw.generatedAt != null) {
      traceability.generatedAt = toString_(raw.generatedAt, `${tracePath}.generatedAt`, context);
    }
    if (hasOwn(raw, 'raw')) traceability.raw = cloneJsonValue(raw.raw, `${tracePath}.raw`, context);
    metadata.traceability = traceability;
  }
  if (object.extensions != null) {
    metadata.extensions = cloneJsonObject(object.extensions, `${path}.extensions`, context);
  }
  return metadata;
}

/** JSONを一時ドキュメントへ読み、成功時だけ対象を置換する。 */
