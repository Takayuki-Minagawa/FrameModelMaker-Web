import { createButton, createElement, formatNumber, labelled, localText } from './UiHelpers';

import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import { calculateModelStatistics } from '../services/ModelStatistics';
import { ModelViewer, ViewerLayers } from '../viewer/ModelViewer';
import { downloadText, recordsToCsv, safeFilename } from './FileDownloads';
import { ToolPanel } from './ToolPanel';
export function createModelInfoPanel(context: {
  doc: FrameDocument;
  viewer: ModelViewer;
  toolPanel: ToolPanel;
  updateViewerToggleStates(): void;
  updateStatus(message: string): void;
}) {
  const { doc, viewer, toolPanel, updateViewerToggleStates, updateStatus } = context;
  function showModelInfoPanel(): void {
    const statistics = calculateModelStatistics(doc);
    const content = createElement('div');
    const table = createElement('table', 'panel-table');
    const rows: Array<[string, string | number]> = [
      [localText('節点', 'Nodes'), statistics.counts.nodes],
      [localText('部材', 'Members'), statistics.counts.members],
      [localText('壁', 'Walls'), statistics.counts.walls],
      [localText('材料', 'Materials'), statistics.counts.materials],
      [localText('断面', 'Sections'), statistics.counts.sections],
      [localText('荷重ケース', 'Load cases'), statistics.counts.loadCases],
      [localText('部材総延長', 'Total member length'), formatNumber(statistics.totalMemberLength)],
      [localText('部材総体積', 'Total member volume'), formatNumber(statistics.totalMemberVolume)],
      [localText('孤立節点', 'Isolated nodes'), statistics.isolatedNodeNumbers.join(', ') || '-'],
    ];
    for (const [label, value] of rows) {
      const row = table.insertRow();
      row.insertCell().textContent = label;
      row.insertCell().textContent = String(value);
    }
    content.appendChild(table);

    const form = createElement('div', 'panel-form');
    const labelDensity = createElement('select');
    const labelDensityLabels = {
      auto: localText('自動', 'Automatic'),
      all: localText('すべて', 'All'),
      'selected-only': localText('選択のみ', 'Selected only'),
    } as const;
    for (const mode of ['auto', 'all', 'selected-only'] as const) {
      const item = document.createElement('option');
      item.value = mode;
      item.textContent = labelDensityLabels[mode];
      item.selected = viewer.getLabelDensity().mode === mode;
      labelDensity.appendChild(item);
    }
    labelDensity.addEventListener('change', () =>
      viewer.setLabelDensity({ mode: labelDensity.value as 'auto' | 'all' | 'selected-only' }),
    );
    const colorMode = createElement('select');
    const colorModeLabels = {
      default: localText('標準', 'Default'),
      section: localText('断面別', 'By section'),
      material: localText('材料別', 'By material'),
      'element-type': localText('要素種別', 'By element type'),
    } as const;
    for (const mode of ['default', 'section', 'material', 'element-type'] as const) {
      const item = document.createElement('option');
      item.value = mode;
      item.textContent = colorModeLabels[mode];
      item.selected = viewer.getMemberColorMode() === mode;
      colorMode.appendChild(item);
    }
    const selectionMode = createElement('select');
    const selectionModeLabels = {
      normal: localText('通常', 'Normal'),
      'selected-only': localText('選択のみ表示', 'Selected only'),
      'dim-others': localText('選択以外を薄く表示', 'Dim others'),
    } as const;
    for (const mode of ['normal', 'selected-only', 'dim-others'] as const) {
      const item = document.createElement('option');
      item.value = mode;
      item.textContent = selectionModeLabels[mode];
      item.selected = viewer.getSelectionDisplayMode() === mode;
      selectionMode.appendChild(item);
    }
    selectionMode.addEventListener('change', () =>
      viewer.setSelectionDisplayMode(selectionMode.value as 'normal' | 'selected-only' | 'dim-others'),
    );
    const legend = createElement('div', 'color-legend');
    const renderLegend = (): void => {
      legend.replaceChildren();
      for (const entry of viewer.getColorLegend()) {
        const swatch = createElement('span', 'color-legend-swatch');
        swatch.style.backgroundColor = entry.color;
        const item = createElement('span', 'color-legend-item');
        item.append(swatch, document.createTextNode(entry.label));
        legend.appendChild(item);
      }
    };
    colorMode.addEventListener('change', () => {
      viewer.setMemberColorMode(colorMode.value as 'default' | 'section' | 'material' | 'element-type');
      renderLegend();
    });
    form.append(
      labelled(localText('ラベル密度', 'Label density'), labelDensity),
      labelled(localText('部材色分け', 'Member colors'), colorMode),
      labelled(localText('選択表示', 'Selection display'), selectionMode),
    );
    const layerFieldset = createElement('fieldset', 'panel-fieldset');
    layerFieldset.appendChild(
      createElement('legend', undefined, localText('表示レイヤー', 'Display layers')),
    );
    const layerLabels: Record<keyof ViewerLayers, [string, string]> = {
      grid: ['グリッド', 'Grid'],
      axes: ['座標軸', 'Axes'],
      nodes: ['節点', 'Nodes'],
      members: ['部材', 'Members'],
      walls: ['壁', 'Walls'],
      boundaries: ['境界条件', 'Boundaries'],
      loads: ['荷重', 'Loads'],
      results: ['解析結果', 'Results'],
      labels: ['番号ラベル', 'Labels'],
    };
    const layers = viewer.getLayerVisibility();
    for (const key of Object.keys(layerLabels) as Array<keyof ViewerLayers>) {
      const checkbox = createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = layers[key];
      checkbox.addEventListener('change', () => {
        viewer.setLayerVisibility({ [key]: checkbox.checked });
        if (key === 'loads') viewer.setLoadDisplay({ visible: checkbox.checked });
        updateViewerToggleStates();
      });
      const label = createElement('label', 'panel-checkbox');
      label.append(checkbox, document.createTextNode(localText(...layerLabels[key])));
      layerFieldset.appendChild(label);
    }
    form.append(
      layerFieldset,
      createButton(
        localText('選択要素へズーム', 'Zoom to selection'),
        () => {
          if (!viewer.zoomToSelection())
            updateStatus(localText('表示対象を選択してください。', 'Select an entity to zoom to.'));
        },
        'panel-action secondary',
      ),
      createButton(
        localText('表示設定をリセット', 'Reset display settings'),
        () => {
          viewer.resetDisplay();
          updateViewerToggleStates();
          showModelInfoPanel();
        },
        'panel-action secondary',
      ),
      legend,
    );
    renderLegend();
    content.appendChild(form);
    const metadata = doc.analysisMetadata;
    if (metadata) {
      content.appendChild(
        createElement(
          'p',
          undefined,
          localText(
            `解析メタデータ: 制約${metadata.constraints.length} / 質量${metadata.nodalMasses.length} / リンク${metadata.linkElements.length}`,
            `Analysis metadata: constraints ${metadata.constraints.length}, masses ${metadata.nodalMasses.length}, links ${metadata.linkElements.length}`,
          ),
        ),
      );
    }
    content.appendChild(
      createButton(localText('数量CSVを書き出す', 'Export quantities CSV'), () => {
        const records = statistics.sectionQuantities.map((quantity) => ({
          sectionNumber: quantity.sectionNumber,
          memberCount: quantity.memberCount,
          totalLength: quantity.totalLength,
          volume: quantity.volume,
        }));
        downloadText(
          recordsToCsv(records),
          `${safeFilename(doc.title || 'frame-model', 'frame-model')}-quantities.csv`,
          'text/csv;charset=utf-8',
        );
      }),
    );
    toolPanel.open(t('panel.modelInfo'), content);
  }

  return showModelInfoPanel;
}
