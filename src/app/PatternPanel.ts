import type { FrameDocument } from '../models/FrameDocument';
import {
  generateFrame,
  previewPattern,
  replicatePattern,
  type Pattern,
  type PatternSelection,
} from '../services/ModelPatterns';
import type { DialogService } from './DialogService';
import { createElement, formatNumber, localText, requestFields } from './UiHelpers';

export type PatternNotify = (kind: 'info' | 'success' | 'error' | 'cancel', message: string) => void;

export function patternFromAnswer(answer: Record<string, string>): Pattern {
  const xyz: [number, number, number] = [Number(answer.x), Number(answer.y), Number(answer.z)];
  const axis = answer.axis as 'x' | 'y' | 'z';
  return answer.kind === 'linear'
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
}

function formatPoint(position: [number, number, number]): string {
  return `(${position.map((value) => formatNumber(value)).join(', ')})`;
}

/** Renders the affected entities, counts and the first copy's coordinates before anything changes. */
export function renderPatternPreview(
  doc: FrameDocument,
  selection: PatternSelection,
  answer: Record<string, string>,
): HTMLElement {
  const container = createElement('div', 'pattern-preview');
  container.id = 'pattern-preview';
  try {
    const preview = previewPattern(doc, selection, patternFromAnswer(answer));
    const list = (numbers: number[]): string => (numbers.length ? numbers.slice(0, 20).join(', ') + (numbers.length > 20 ? ', …' : '') : '-');
    container.append(
      createElement(
        'p',
        undefined,
        localText(
          `対象: 節点 ${preview.sourceNodeNumbers.length}件 [${list(preview.sourceNodeNumbers)}] / 部材 ${preview.sourceMemberNumbers.length}件 [${list(preview.sourceMemberNumbers)}] / 壁 ${preview.sourceWallNumbers.length}件 [${list(preview.sourceWallNumbers)}]`,
          `Sources: nodes ${preview.sourceNodeNumbers.length} [${list(preview.sourceNodeNumbers)}] / members ${preview.sourceMemberNumbers.length} [${list(preview.sourceMemberNumbers)}] / walls ${preview.sourceWallNumbers.length} [${list(preview.sourceWallNumbers)}]`,
        ),
      ),
      createElement(
        'p',
        undefined,
        localText(
          `追加: 節点 ${preview.addedNodeCount} / 部材 ${preview.addedMemberCount} / 壁 ${preview.addedWallCount}（複製 ${preview.copies}回）`,
          `Added: nodes ${preview.addedNodeCount} / members ${preview.addedMemberCount} / walls ${preview.addedWallCount} (${preview.copies} copies)`,
        ),
      ),
    );
    const positions = createElement('ul', 'pattern-preview-positions');
    for (const item of preview.firstCopyPositions.slice(0, 8)) {
      const node = doc.findNodeByNumber(item.sourceNodeNumber)!;
      positions.append(
        createElement(
          'li',
          undefined,
          `${localText('節点', 'Node')} ${item.sourceNodeNumber} ${formatPoint([node.x, node.y, node.z])} → ${formatPoint(item.position)} cm`,
        ),
      );
    }
    if (preview.firstCopyPositions.length > 8)
      positions.append(createElement('li', undefined, localText('…（最初の8節点のみ表示）', '… (first 8 nodes shown)')));
    container.append(positions);
    container.dataset.valid = 'true';
  } catch (error) {
    container.dataset.valid = 'false';
    container.append(createElement('p', 'diagnostic-item error', error instanceof Error ? error.message : String(error)));
  }
  return container;
}

export async function showPatternDialog(
  doc: FrameDocument,
  selection: PatternSelection,
  dialog: DialogService,
  mutate: <T>(label: string, action: () => T) => T,
  notify: PatternNotify = () => undefined,
): Promise<void> {
  const revision = doc.revision;
  const isLinear = (values: Record<string, string>) => values.kind === 'linear';
  const isRadial = (values: Record<string, string>) => values.kind === 'radial';
  const isMirror = (values: Record<string, string>) => values.kind === 'mirror';
  const answer = await requestFields(
    dialog,
    localText('配列複製（共有節点を維持）', 'Pattern copy (preserve shared nodes)'),
    [
      {
        name: 'kind',
        label: localText('方法', 'Pattern'),
        type: 'select',
        options: [
          { value: 'linear', label: localText('直線', 'Linear') },
          { value: 'radial', label: localText('回転', 'Radial') },
          { value: 'mirror', label: localText('鏡映', 'Mirror') },
        ],
      },
      {
        name: 'count',
        label: localText('複製数', 'Copies'),
        type: 'number',
        value: '1',
        integer: true,
        min: 1,
        max: 1000,
        visibleWhen: (values) => !isMirror(values),
        description: localText('1〜1000の整数', 'Integer 1–1000'),
      },
      {
        name: 'x',
        label: localText('ΔX (cm)', 'ΔX (cm)'),
        type: 'number',
        value: '100',
        visibleWhen: isLinear,
        description: localText('X方向の複製間隔。小数可（例: 12.5）', 'Spacing along X; decimals allowed (e.g. 12.5)'),
      },
      { name: 'y', label: 'ΔY (cm)', type: 'number', value: '0', visibleWhen: isLinear },
      { name: 'z', label: 'ΔZ (cm)', type: 'number', value: '0', visibleWhen: isLinear },
      {
        name: 'ox',
        label: localText('回転中心 X (cm)', 'Origin X (cm)'),
        type: 'number',
        value: '0',
        visibleWhen: isRadial,
      },
      { name: 'oy', label: localText('回転中心 Y (cm)', 'Origin Y (cm)'), type: 'number', value: '0', visibleWhen: isRadial },
      { name: 'oz', label: localText('回転中心 Z (cm)', 'Origin Z (cm)'), type: 'number', value: '0', visibleWhen: isRadial },
      {
        name: 'axis',
        label: localText('回転軸 / 鏡映面の法線', 'Rotation axis / mirror plane normal'),
        type: 'select',
        value: 'z',
        options: ['x', 'y', 'z'].map((value) => ({ value, label: value.toUpperCase() })),
        visibleWhen: (values) => !isLinear(values),
      },
      {
        name: 'angle',
        label: localText('回転角（度）', 'Rotation angle (degrees)'),
        type: 'number',
        value: '90',
        visibleWhen: isRadial,
        description: localText('右ねじ正。小数可（例: 0.5）', 'Right-hand positive; decimals allowed (e.g. 0.5)'),
      },
      {
        name: 'offset',
        label: localText('鏡映面の座標 (cm)', 'Mirror plane coordinate (cm)'),
        type: 'number',
        value: '0',
        visibleWhen: isMirror,
      },
    ],
    {
      preview: (values) =>
        renderPatternPreview(doc, selection, {
          ...values,
          x: values.kind === 'radial' ? values.ox : values.x,
          y: values.kind === 'radial' ? values.oy : values.y,
          z: values.kind === 'radial' ? values.oz : values.z,
        }),
    },
  );
  if (!answer) {
    notify('cancel', localText('配列複製を取り消しました。', 'Pattern copy cancelled.'));
    return;
  }
  if (revision !== doc.revision) {
    notify('cancel', localText('モデルが変更されたため配列複製を中止しました。', 'Pattern copy aborted because the model changed.'));
    return;
  }
  const pattern = patternFromAnswer({
    ...answer,
    x: answer.kind === 'radial' ? answer.ox : answer.x,
    y: answer.kind === 'radial' ? answer.oy : answer.y,
    z: answer.kind === 'radial' ? answer.oz : answer.z,
  });
  const result = mutate('Replicate pattern', () => replicatePattern(doc, selection, pattern));
  notify(
    'success',
    localText(
      `配列複製を実行しました: 節点 ${result.nodes.length} / 部材 ${result.members.length} / 壁 ${result.walls.length} を追加`,
      `Pattern copy completed: added nodes ${result.nodes.length} / members ${result.members.length} / walls ${result.walls.length}`,
    ),
  );
}

export async function showFrameTemplateDialog(
  doc: FrameDocument,
  dialog: DialogService,
  mutate: <T>(label: string, action: () => T) => T,
  notify: PatternNotify = () => undefined,
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
          { value: 'frame', label: localText('ラーメン形状', 'Frame') },
          { value: 'truss', label: localText('トラス形状', 'Truss') },
        ],
      },
      { name: 'spans', label: localText('スパン数', 'Bays'), type: 'number', value: '3', integer: true, min: 1, max: 100 },
      { name: 'stories', label: localText('層数', 'Stories'), type: 'number', value: '2', integer: true, min: 1, max: 100 },
      {
        name: 'span',
        label: localText('スパン (cm)', 'Span (cm)'),
        type: 'number',
        value: '600',
        min: 0,
        description: localText('小数可（例: 600.5）', 'Decimals allowed (e.g. 600.5)'),
      },
      { name: 'height', label: localText('階高 (cm)', 'Story height (cm)'), type: 'number', value: '300', min: 0 },
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
  if (!answer) {
    notify('cancel', localText('骨組生成を取り消しました。', 'Frame generation cancelled.'));
    return;
  }
  if (revision !== doc.revision) {
    notify('cancel', localText('モデルが変更されたため骨組生成を中止しました。', 'Frame generation aborted because the model changed.'));
    return;
  }
  const before = { nodes: doc.nodes.length, members: doc.members.length };
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
  notify(
    'success',
    localText(
      `骨組を生成しました: 節点 ${doc.nodes.length - before.nodes} / 部材 ${doc.members.length - before.members} を追加（${answer.spans}スパン × ${answer.stories}層、断面 ${answer.section}）`,
      `Frame generated: added nodes ${doc.nodes.length - before.nodes} / members ${doc.members.length - before.members} (${answer.spans} bays × ${answer.stories} stories, section ${answer.section})`,
    ),
  );
}
