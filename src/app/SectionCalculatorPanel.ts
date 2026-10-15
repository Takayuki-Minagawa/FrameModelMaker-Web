import { PresetPanel } from './PresetPanel';
import {
  applyNumericConstraints,
  createButton,
  createElement,
  formatNumber,
  labelled,
  localText,
} from './UiHelpers';

import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import { Section, SectionShape } from '../models/Section';
import {
  applySectionProperties,
  calculateSectionProperties,
  SectionProperties,
  SectionPropertyInput,
} from '../services/SectionProperties';
import { ToolPanel } from './ToolPanel';

export const SECTION_CALCULATOR_PANEL_ID = 'section-calculator';

export type SectionResultState = 'none' | 'calculated' | 'stale' | 'error';

const DIMENSION_LABELS: Record<string, [string, string]> = {
  width: ['幅', 'width'],
  height: ['高さ', 'height'],
  diameter: ['直径', 'diameter'],
  outerWidth: ['外幅', 'outer width'],
  outerHeight: ['外高さ', 'outer height'],
  thickness: ['厚さ', 'thickness'],
  overallHeight: ['全高', 'overall height'],
  flangeWidth: ['フランジ幅', 'flange width'],
  webThickness: ['ウェブ厚', 'web thickness'],
  flangeThickness: ['フランジ厚', 'flange thickness'],
};

/** Translates the service-level (English) validation messages for the UI. */
export function localizeSectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const positive = /^(\w+) must be a finite positive number\.$/.exec(message);
  if (positive) {
    const [ja, en] = DIMENSION_LABELS[positive[1]] ?? [positive[1], positive[1]];
    return localText(`${ja}は正の有限値を入力してください。`, `${en} must be a finite positive number.`);
  }
  const known: Record<string, [string, string]> = {
    'thickness leaves no hollow core.': [
      '厚さが大きすぎて中空部がありません。2×厚さを外幅・外高さより小さくしてください。',
      'The thickness leaves no hollow core; 2 × thickness must be smaller than the outer width and height.',
    ],
    'flangeThickness leaves no web height.': [
      'フランジ厚が大きすぎてウェブ高さがありません。2×フランジ厚を全高より小さくしてください。',
      'The flange thickness leaves no web height; 2 × flange thickness must be smaller than the overall height.',
    ],
    'webThickness must be smaller than flangeWidth.': [
      'ウェブ厚はフランジ幅より小さくしてください。',
      'The web thickness must be smaller than the flange width.',
    ],
  };
  const localized = known[message];
  return localized ? localText(...localized) : message;
}

export function sectionResultRows(properties: SectionProperties): Array<[string, string]> {
  return [
    ['A (cm²)', formatNumber(properties.area)],
    ['J (cm⁴)', formatNumber(properties.torsionConstant)],
    ['Iy (cm⁴)', formatNumber(properties.inertiaY)],
    ['Iz (cm⁴)', formatNumber(properties.inertiaZ)],
    ['ky', formatNumber(properties.shearCoefficientY)],
    ['kz', formatNumber(properties.shearCoefficientZ)],
  ];
}

export function createSectionCalculator(context: {
  doc: FrameDocument;
  toolPanel: ToolPanel;
  presets: PresetPanel;
  ensureDefaultSection(): Section;
  mutateDocument<T>(label: string, action: () => T): T;
  notify?(kind: 'info' | 'success' | 'error' | 'cancel', message: string): void;
}) {
  const { doc, toolPanel, presets, mutateDocument } = context;
  const notify = context.notify ?? (() => undefined);

  function showSectionCalculator(): void {
    const content = createElement('div', 'panel-form');
    const sectionSelect = createElement('select');
    sectionSelect.id = 'section-calculator-target';
    sectionSelect.name = 'target-section';
    const shape = createElement('select');
    shape.name = 'shape';
    const shapes = [
      [SectionShape.Rectangle, localText('矩形', 'Rectangle')],
      [SectionShape.Circle, localText('円形', 'Circle')],
      [SectionShape.Box, localText('箱形', 'Box')],
      [SectionShape.H_Steel, 'H'],
    ] as const;
    for (const [value, label] of shapes) {
      const item = document.createElement('option');
      item.value = String(value);
      item.textContent = label;
      shape.appendChild(item);
    }
    const dimensions = [1, 2, 3, 4].map((index) => {
      const input = createElement('input');
      input.name = `dimension-${index}`;
      applyNumericConstraints(input, { min: 0 });
      input.value = index <= 2 ? '10' : '1';
      return input;
    });
    const labels = dimensions.map((input, index) => labelled(`D${index + 1}`, input));
    const result = createElement('div', 'section-result');
    result.id = 'section-calculator-result';
    const resultState = createElement('p', 'panel-subtitle');
    resultState.id = 'section-calculator-state';
    const resultTable = createElement('div');
    const errorBox = createElement('p', 'diagnostic-item error hidden');
    errorBox.id = 'section-calculator-error';
    errorBox.setAttribute('role', 'alert');
    result.append(resultState, errorBox, resultTable);

    const shapeLabel = (): string => shapes.find(([value]) => String(value) === shape.value)?.[1] ?? '';
    const labelSets: Record<number, Array<[string, string]>> = {
      [SectionShape.Rectangle]: [['幅 (cm)', 'Width (cm)'], ['高さ (cm)', 'Height (cm)']],
      [SectionShape.Circle]: [['直径 (cm)', 'Diameter (cm)']],
      [SectionShape.Box]: [
        ['外幅 (cm)', 'Outer width (cm)'],
        ['外高さ (cm)', 'Outer height (cm)'],
        ['厚さ (cm)', 'Thickness (cm)'],
      ],
      [SectionShape.H_Steel]: [
        ['全高 (cm)', 'Overall height (cm)'],
        ['フランジ幅 (cm)', 'Flange width (cm)'],
        ['ウェブ厚 (cm)', 'Web thickness (cm)'],
        ['フランジ厚 (cm)', 'Flange thickness (cm)'],
      ],
    };
    const dimensionSummary = (): string => {
      const current = labelSets[Number(shape.value)] ?? [];
      return current
        .map(([ja, en], index) => `${localText(ja, en).replace(/ \(cm\)$/, '')}=${dimensions[index].value}`)
        .join(', ');
    };

    const setState = (state: SectionResultState, message?: string): void => {
      result.dataset.state = state;
      const texts: Record<SectionResultState, [string, string]> = {
        none: ['結果: 未計算', 'Result: not calculated'],
        calculated: ['結果: 計算済み（現在の入力）', 'Result: calculated for the current inputs'],
        stale: ['結果: 前回計算値（入力変更済み・再計算が必要）', 'Result: previous values (inputs changed, recalculate)'],
        error: ['結果: エラー（前回値は破棄）', 'Result: error (previous values discarded)'],
      };
      resultState.textContent = localText(...texts[state]);
      errorBox.classList.toggle('hidden', state !== 'error');
      errorBox.textContent = state === 'error' ? message ?? '' : '';
      resultTable.classList.toggle('stale', state === 'stale');
      if (state === 'error' || state === 'none') resultTable.replaceChildren();
    };

    const renderResult = (properties: SectionProperties, context: { shape: string; dimensions: string }): void => {
      const table = createElement('table', 'panel-table');
      const rows: Array<[string, string]> = [
        [localText('形状', 'Shape'), context.shape],
        [localText('寸法 (cm)', 'Dimensions (cm)'), context.dimensions],
        ...sectionResultRows(properties),
        [
          localText('局所軸', 'Local axes'),
          localText(
            'Iy は局所y軸回り（高さは局所z方向）、Iz は局所z軸回り（幅は局所y方向）。J は近似式。',
            'Iy about local y (height along local z); Iz about local z (width along local y). J uses an approximation.',
          ),
        ],
      ];
      for (const [label, value] of rows) {
        const row = table.insertRow();
        row.insertCell().textContent = label;
        row.insertCell().textContent = value;
      }
      resultTable.replaceChildren(table);
      setState('calculated');
    };

    const updateLabels = (): void => {
      const current = labelSets[Number(shape.value)] ?? [];
      labels.forEach((label, index) => {
        label.classList.toggle('hidden', index >= current.length);
        dimensions[index].disabled = index >= current.length;
        const span = label.querySelector('span');
        if (span) span.textContent = current[index] ? localText(...current[index]) : '';
      });
    };
    const markStale = (): void => {
      if (result.dataset.state === 'calculated') setState('stale');
    };
    shape.addEventListener('change', () => {
      updateLabels();
      markStale();
    });
    for (const input of dimensions) input.addEventListener('input', markStale);
    updateLabels();
    setState('none');

    const calculateInput = (): SectionPropertyInput => {
      const values = dimensions.map((input) => Number(input.value));
      const selectedShape = Number(shape.value);
      if (selectedShape === SectionShape.Rectangle)
        return { shape: SectionShape.Rectangle, width: values[0], height: values[1] };
      if (selectedShape === SectionShape.Circle) return { shape: SectionShape.Circle, diameter: values[0] };
      if (selectedShape === SectionShape.Box)
        return {
          shape: SectionShape.Box,
          outerWidth: values[0],
          outerHeight: values[1],
          thickness: values[2],
        };
      return {
        shape: SectionShape.H_Steel,
        overallHeight: values[0],
        flangeWidth: values[1],
        webThickness: values[2],
        flangeThickness: values[3],
      };
    };

    const applyButton = createButton(localText('計算して断面へ適用', 'Calculate and apply'), () => {
      const section = doc.findSectionByNumber(Number(sectionSelect.value));
      if (!sectionSelect.value || !section) {
        notify('error', localText('適用先の断面を選択してください。', 'Choose a target section first.'));
        return;
      }
      const summary = { shape: shapeLabel(), dimensions: dimensionSummary() };
      let properties: SectionProperties;
      try {
        properties = calculateSectionProperties(calculateInput());
      } catch (error) {
        setState('error', localizeSectionError(error));
        notify('error', localizeSectionError(error));
        return;
      }
      mutateDocument('Calculate section properties', () => applySectionProperties(section, calculateInput()));
      renderResult(properties, summary);
      const message = localText(
        `断面 ${section.number}${section.comment ? ` (${section.comment})` : ''} へ適用: ${summary.shape} ${summary.dimensions} → A=${formatNumber(properties.area)} cm², J=${formatNumber(properties.torsionConstant)} cm⁴, Iy=${formatNumber(properties.inertiaY)} cm⁴, Iz=${formatNumber(properties.inertiaZ)} cm⁴`,
        `Applied to section ${section.number}${section.comment ? ` (${section.comment})` : ''}: ${summary.shape} ${summary.dimensions} → A=${formatNumber(properties.area)} cm², J=${formatNumber(properties.torsionConstant)} cm⁴, Iy=${formatNumber(properties.inertiaY)} cm⁴, Iz=${formatNumber(properties.inertiaZ)} cm⁴`,
      );
      notify('success', message);
    });
    applyButton.id = 'section-calculator-apply';

    const refreshTargets = (): void => {
      const previous = sectionSelect.value;
      sectionSelect.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = localText('— 適用先を選択 —', '— choose a target —');
      sectionSelect.appendChild(placeholder);
      for (const section of doc.sections) {
        const item = document.createElement('option');
        item.value = String(section.number);
        item.textContent = `${section.number}: ${section.comment || '-'}`;
        sectionSelect.appendChild(item);
      }
      sectionSelect.value = doc.sections.some((section) => String(section.number) === previous) ? previous : '';
      applyButton.disabled = sectionSelect.value === '';
      sectionSelect.dataset.count = String(doc.sections.length);
    };
    sectionSelect.addEventListener('change', () => {
      applyButton.disabled = sectionSelect.value === '';
    });
    refreshTargets();

    content.append(
      labelled(
        localText('適用先断面', 'Target section'),
        sectionSelect,
        localText('断面タブで追加・削除・番号変更すると一覧が更新されます。', 'Follows additions, deletions and renumbering in the Sections tab.'),
      ),
      labelled(localText('形状', 'Shape'), shape),
      ...labels,
      createButton(localText('計算', 'Calculate'), () => {
        const summary = { shape: shapeLabel(), dimensions: dimensionSummary() };
        try {
          renderResult(calculateSectionProperties(calculateInput()), summary);
          notify('success', localText(`断面計算が完了しました: ${summary.shape} ${summary.dimensions}`, `Section calculated: ${summary.shape} ${summary.dimensions}`));
        } catch (error) {
          setState('error', localizeSectionError(error));
          notify('error', localizeSectionError(error));
        }
      }),
      createButton(localText('テンプレートとして保存', 'Save as preset'), () =>
        presets.saveSection(
          calculateInput(),
          doc.findSectionByNumber(Number(sectionSelect.value))?.materialNumber,
        ),
      ),
      applyButton,
      result,
    );
    toolPanel.open(t('panel.sectionCalculator'), content, {
      id: SECTION_CALCULATOR_PANEL_ID,
      onModelChanged: refreshTargets,
    });
  }

  return showSectionCalculator;
}
