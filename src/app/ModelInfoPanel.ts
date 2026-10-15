import { createButton, createElement, formatNumber, labelled, localText } from './UiHelpers';

import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import { calculateModelStatistics, type ModelStatistics } from '../services/ModelStatistics';
import { ModelViewer, ViewerLayers } from '../viewer/ModelViewer';
import { downloadText, recordsToCsv, safeFilename } from './FileDownloads';
import { ToolPanel } from './ToolPanel';

export const MODEL_INFO_PANEL_ID = 'model-info';

/** Above this many entities the panel waits for an explicit refresh instead of recalculating on every edit. */
export const LIVE_STATISTICS_ENTITY_LIMIT = 20000;

/** Quantity CSV rows carry explicit units (lengths in cm, volumes in cm³). */
export function quantityCsvRecords(statistics: ModelStatistics): Array<Record<string, unknown>> {
  return statistics.sectionQuantities.map((quantity) => ({
    sectionNumber: quantity.sectionNumber,
    memberCount: quantity.memberCount,
    totalLength_cm: quantity.totalLength,
    volume_cm3: quantity.volume,
  }));
}

export function createModelInfoPanel(context: {
  doc: FrameDocument;
  viewer: ModelViewer;
  toolPanel: ToolPanel;
  updateViewerToggleStates(): void;
  updateStatus(message: string): void;
}) {
  const { doc, viewer, toolPanel, updateViewerToggleStates, updateStatus } = context;

  function entityCount(): number {
    return doc.nodes.length + doc.members.length + doc.walls.length;
  }

  function showModelInfoPanel(): void {
    const content = createElement('div');
    const statisticsSection = createElement('div');
    statisticsSection.id = 'model-info-statistics';

    const renderStatistics = (): void => {
      const statistics = calculateModelStatistics(doc);
      statisticsSection.replaceChildren();
      statisticsSection.dataset.state = 'current';
      statisticsSection.dataset.revision = String(doc.revision);
      const table = createElement('table', 'panel-table');
      const rows: Array<[string, string | number]> = [
        [localText('節点', 'Nodes'), statistics.counts.nodes],
        [localText('部材', 'Members'), statistics.counts.members],
        [localText('壁', 'Walls'), statistics.counts.walls],
        [localText('材料', 'Materials'), statistics.counts.materials],
        [localText('断面', 'Sections'), statistics.counts.sections],
        [localText('境界条件', 'Boundaries'), statistics.counts.boundaries],
        [localText('バネ', 'Springs'), statistics.counts.springs],
        [localText('荷重ケース', 'Load cases'), statistics.counts.loadCases],
        [localText('荷重組合せ', 'Load combinations'), statistics.counts.loadCombinations],
        [localText('部材総延長 (cm)', 'Total member length (cm)'), formatNumber(statistics.totalMemberLength)],
        [localText('部材総体積 (cm³)', 'Total member volume (cm³)'), formatNumber(statistics.totalMemberVolume)],
        [localText('孤立節点', 'Isolated nodes'), statistics.isolatedNodeNumbers.join(', ') || '-'],
      ];
      for (const [label, value] of rows) {
        const row = table.insertRow();
        row.insertCell().textContent = label;
        row.insertCell().textContent = String(value);
      }
      statisticsSection.appendChild(table);
    };

    const markStale = (): void => {
      statisticsSection.dataset.state = 'stale';
      let banner = statisticsSection.querySelector<HTMLElement>('.stale-banner');
      if (!banner) {
        banner = createElement('div', 'diagnostic-item warn stale-banner');
        banner.append(
          createElement(
            'span',
            undefined,
            localText(
              '更新待ち: モデルが変更されました。大きなモデルのため手動で再集計します。',
              'Pending update: the model changed. Large models are recalculated on demand.',
            ),
          ),
          createButton(localText('再集計', 'Recalculate'), renderStatistics, 'toolbar-btn secondary'),
        );
        statisticsSection.prepend(banner);
      }
    };

    renderStatistics();
    content.appendChild(statisticsSection);

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
    legend.id = 'color-legend';
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
      checkbox.name = `layer-${key}`;
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
          if (viewer.zoomToSelection())
            updateStatus(localText('選択要素へズームしました。', 'Zoomed to the selected entity.'));
          else updateStatus(localText('表示対象を選択してください。', 'Select an entity to zoom to.'));
        },
        'panel-action secondary',
      ),
      createButton(
        localText('表示設定をリセット', 'Reset display settings'),
        () => {
          viewer.resetDisplay();
          updateViewerToggleStates();
          showModelInfoPanel();
          updateStatus(localText('表示設定をリセットしました。', 'Display settings were reset.'));
        },
        'panel-action secondary',
      ),
      legend,
    );
    renderLegend();
    content.appendChild(form);
    const metadataSection = createElement('p');
    metadataSection.id = 'model-info-metadata';
    const renderMetadata = (): void => {
      const metadata = doc.analysisMetadata;
      metadataSection.classList.toggle('hidden', !metadata);
      metadataSection.textContent = metadata
        ? localText(
            `解析メタデータ: 制約${metadata.constraints.length} / 質量${metadata.nodalMasses.length} / リンク${metadata.linkElements.length}`,
            `Analysis metadata: constraints ${metadata.constraints.length}, masses ${metadata.nodalMasses.length}, links ${metadata.linkElements.length}`,
          )
        : '';
    };
    renderMetadata();
    content.appendChild(metadataSection);
    content.appendChild(
      createButton(localText('数量CSVを書き出す（cm / cm³）', 'Export quantities CSV (cm / cm³)'), () => {
        // Always recalculate from the current model so the CSV never reflects a stale panel.
        const statistics = calculateModelStatistics(doc);
        downloadText(
          recordsToCsv(quantityCsvRecords(statistics), ['sectionNumber', 'memberCount', 'totalLength_cm', 'volume_cm3']),
          `${safeFilename(doc.title || 'frame-model', 'frame-model')}-quantities.csv`,
          'text/csv;charset=utf-8',
        );
        updateStatus(
          localText(
            `数量CSVを書き出しました（断面 ${statistics.sectionQuantities.length}件、部材総延長 ${formatNumber(statistics.totalMemberLength)} cm）`,
            `Quantities CSV exported (${statistics.sectionQuantities.length} sections, total length ${formatNumber(statistics.totalMemberLength)} cm)`,
          ),
        );
      }),
    );
    toolPanel.open(t('panel.modelInfo'), content, {
      id: MODEL_INFO_PANEL_ID,
      onModelChanged: () => {
        renderMetadata();
        if (entityCount() > LIVE_STATISTICS_ENTITY_LIMIT) markStale();
        else renderStatistics();
      },
    });
  }

  return showModelInfoPanel;
}
