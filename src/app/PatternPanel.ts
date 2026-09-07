import type { FrameDocument } from '../models/FrameDocument';
import {
  generateFrame,
  replicatePattern,
  type Pattern,
  type PatternSelection,
} from '../services/ModelPatterns';
import type { DialogService } from './DialogService';
import { localText, requestFields } from './UiHelpers';

export async function showPatternDialog(
  doc: FrameDocument,
  selection: PatternSelection,
  dialog: DialogService,
  mutate: (label: string, action: () => void) => void,
): Promise<void> {
  const revision = doc.revision;
  const answer = await requestFields(
    dialog,
    localText('配列複製（共有節点を維持）', 'Pattern copy (preserve shared nodes)'),
    [
      {
        name: 'kind',
        label: localText('方法', 'Pattern'),
        type: 'select',
        options: [
          { value: 'linear', label: '直線 / Linear' },
          { value: 'radial', label: '回転 / Radial' },
          { value: 'mirror', label: '鏡映 / Mirror' },
        ],
      },
      { name: 'count', label: localText('複製数', 'Copies'), type: 'number', value: '1' },
      { name: 'x', label: 'ΔX / origin X (cm)', type: 'number', value: '100' },
      { name: 'y', label: 'ΔY / origin Y (cm)', type: 'number', value: '0' },
      { name: 'z', label: 'ΔZ / origin Z (cm)', type: 'number', value: '0' },
      {
        name: 'axis',
        label: localText('回転軸・鏡映面の法線', 'Rotation axis / mirror plane normal'),
        type: 'select',
        options: ['x', 'y', 'z'].map((value) => ({ value, label: value })),
      },
      {
        name: 'angle',
        label: localText('回転角（度）', 'Rotation angle (degrees)'),
        type: 'number',
        value: '90',
      },
      {
        name: 'offset',
        label: localText('鏡映面の座標 (cm)', 'Mirror plane coordinate (cm)'),
        type: 'number',
        value: '0',
      },
    ],
  );
  if (!answer || revision !== doc.revision) return;
  const xyz: [number, number, number] = [Number(answer.x), Number(answer.y), Number(answer.z)];
  const axis = answer.axis as 'x' | 'y' | 'z';
  const pattern: Pattern =
    answer.kind === 'linear'
      ? { kind: 'linear', count: Number(answer.count), delta: xyz }
      : answer.kind === 'radial'
        ? {
            kind: 'radial',
            count: Number(answer.count),
            axis,
            angleDegrees: Number(answer.angle),
            origin: xyz,
          }
        : { kind: 'mirror', axis, offset: Number(answer.offset) };
  mutate('Replicate pattern', () => {
    replicatePattern(doc, selection, pattern);
  });
}

export async function showFrameTemplateDialog(
  doc: FrameDocument,
  dialog: DialogService,
  mutate: (label: string, action: () => void) => void,
): Promise<void> {
  if (!doc.sections.length)
    throw new Error(localText('先に断面を作成してください', 'Create a section first.'));
  const revision = doc.revision;
  const answer = await requestFields(
    dialog,
    localText('骨組生成（支持・荷重は生成後に設定）', 'Generate frame (assign supports/loads afterwards)'),
    [
      {
        name: 'kind',
        label: localText('形状', 'Geometry'),
        type: 'select',
        options: [
          { value: 'frame', label: 'ラーメン形状 / Frame' },
          { value: 'truss', label: 'トラス形状 / Truss' },
        ],
      },
      { name: 'spans', label: localText('スパン数', 'Bays'), type: 'number', value: '3' },
      { name: 'stories', label: localText('層数', 'Stories'), type: 'number', value: '2' },
      { name: 'span', label: localText('スパン (cm)', 'Span (cm)'), type: 'number', value: '600' },
      { name: 'height', label: localText('階高 (cm)', 'Story height (cm)'), type: 'number', value: '300' },
      {
        name: 'section',
        label: localText('部材断面', 'Member section'),
        type: 'select',
        options: doc.sections.map((section) => ({
          value: String(section.number),
          label: `${section.number}: ${section.comment}`,
        })),
      },
    ],
  );
  if (!answer || revision !== doc.revision) return;
  mutate('Generate frame', () =>
    generateFrame(doc, {
      kind: answer.kind as 'frame' | 'truss',
      spans: Number(answer.spans),
      stories: Number(answer.stories),
      span: Number(answer.span),
      height: Number(answer.height),
      sectionNumber: Number(answer.section),
    }),
  );
}
