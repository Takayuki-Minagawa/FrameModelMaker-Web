import { PresetPanel } from './PresetPanel';
import { createButton, createElement, labelled, localText } from './UiHelpers';

import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import { Section, SectionShape } from '../models/Section';
import {
  applySectionProperties,
  calculateSectionProperties,
  SectionPropertyInput,
} from '../services/SectionProperties';
import { ToolPanel } from './ToolPanel';
export function createSectionCalculator(context: {
  doc: FrameDocument;
  toolPanel: ToolPanel;
  presets: PresetPanel;
  ensureDefaultSection(): Section;
  mutateDocument<T>(label: string, action: () => T): T;
}) {
  const { doc, toolPanel, presets, ensureDefaultSection, mutateDocument } = context;
  function showSectionCalculator(): void {
    const content = createElement('div', 'panel-form');
    const sectionSelect = createElement('select');
    for (const section of doc.sections) {
      const item = document.createElement('option');
      item.value = String(section.number);
      item.textContent = `${section.number}: ${section.comment || '-'}`;
      sectionSelect.appendChild(item);
    }
    const shape = createElement('select');
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
      input.type = 'number';
      input.min = '0';
      input.step = 'any';
      input.value = index <= 2 ? '10' : '1';
      return input;
    });
    const labels = dimensions.map((input, index) => labelled(`D${index + 1}`, input));
    const result = createElement('pre');
    const updateLabels = (): void => {
      const labelSets: Record<number, string[]> = {
        [SectionShape.Rectangle]: [localText('幅', 'Width'), localText('高さ', 'Height')],
        [SectionShape.Circle]: [localText('直径', 'Diameter')],
        [SectionShape.Box]: [
          localText('外幅', 'Outer width'),
          localText('外高さ', 'Outer height'),
          localText('厚さ', 'Thickness'),
        ],
        [SectionShape.H_Steel]: [
          localText('全高', 'Overall height'),
          localText('フランジ幅', 'Flange width'),
          localText('ウェブ厚', 'Web thickness'),
          localText('フランジ厚', 'Flange thickness'),
        ],
      };
      const current = labelSets[Number(shape.value)] ?? [];
      labels.forEach((label, index) => {
        label.classList.toggle('hidden', index >= current.length);
        const span = label.querySelector('span');
        if (span) span.textContent = current[index] ?? '';
      });
    };
    shape.addEventListener('change', updateLabels);
    updateLabels();
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
    content.append(
      labelled(localText('適用先断面', 'Target section'), sectionSelect),
      labelled(localText('形状', 'Shape'), shape),
      ...labels,
      createButton(localText('計算', 'Calculate'), () => {
        result.textContent = JSON.stringify(calculateSectionProperties(calculateInput()), null, 2);
      }),
      createButton(localText('テンプレートとして保存', 'Save as preset'), () =>
        presets.saveSection(
          calculateInput(),
          doc.findSectionByNumber(Number(sectionSelect.value))?.materialNumber,
        ),
      ),
      createButton(localText('計算して断面へ適用', 'Calculate and apply'), () => {
        const properties = mutateDocument('Calculate section properties', () => {
          const section = doc.findSectionByNumber(Number(sectionSelect.value)) ?? ensureDefaultSection();
          return applySectionProperties(section, calculateInput());
        });
        result.textContent = JSON.stringify(properties, null, 2);
      }),
      result,
    );
    toolPanel.open(t('panel.sectionCalculator'), content);
  }

  return showSectionCalculator;
}
