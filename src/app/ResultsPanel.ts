import { convertOpenSeesResults } from '../io/OpenSeesResults';
import { resolveLocalAxes } from '../services/LocalAxes';
import { modelFingerprint } from '../services/ModelFingerprint';
import {
  frameExtremes,
  frameIndexForTime,
  memberResultRow,
  nodeResultRow,
  RESULT_UNITS,
  resultFrameToCsv,
  SECTION_FORCE_COMPONENTS,
  SECTION_FORCE_LABELS,
  sectionForceUnit,
} from '../services/ResultTables';
import { adaptAnalysisResult } from '../viewer/ResultsAdapter';
import {
  applyNumericConstraints,
  createButton,
  createElement,
  formatNumber,
  labelled,
  localText,
} from './UiHelpers';

import { t } from '../i18n';
import { parseAnalysisResult } from '../models/AnalysisResult';
import { FrameDocument } from '../models/FrameDocument';
import { validateFrameDocument } from '../validation/FrameValidator';
import { AnalysisResultSet, ModelViewer, ViewerSelection } from '../viewer/ModelViewer';
import { assertImportFileSize, downloadText, safeFilename } from './FileDownloads';
import { ToolPanel } from './ToolPanel';

export const RESULTS_PANEL_ID = 'results';

export function createResultsPanel(context: {
  doc: FrameDocument;
  viewer: ModelViewer;
  toolPanel: ToolPanel;
  updateViewerToggleStates(): void;
  updateStatus(message: string): void;
  reportError(error: unknown): void;
  getSelection?(): ViewerSelection;
}) {
  const { doc, viewer, toolPanel, updateViewerToggleStates, updateStatus, reportError } = context;
  const getSelection = context.getSelection ?? (() => viewer.getSelection());
  let requestId = 0;
  let resultSet: AnalysisResultSet | null = null;
  let loadedFileName = '';
  let playing = false;
  let playbackFps = 12;
  let playbackLoop = true;
  /** Re-renders the state/selection sections of the open panel, if any. */
  let syncOpenPanel: (() => void) | null = null;
  let syncOpenSelection: (() => void) | null = null;

  function invalidateAnalysisResults(): boolean {
    requestId++;
    if (!resultSet) return false;
    viewer.pauseResults();
    playing = false;
    resultSet = null;
    loadedFileName = '';
    viewer.setAnalysisResults(null);
    viewer.setLayerVisibility({ results: false });
    updateViewerToggleStates();
    syncOpenPanel?.();
    return true;
  }

  type SectionForceKey = 'axial' | 'shearY' | 'shearZ' | 'torsion' | 'momentY' | 'momentZ';

  function recommendedSectionForceScale(component: SectionForceKey): number {
    if (!resultSet) return 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const node of doc.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
      minZ = Math.min(minZ, node.z);
      maxZ = Math.max(maxZ, node.z);
    }
    const span = doc.nodes.length === 0 ? 100 : Math.max(maxX - minX, maxY - minY, maxZ - minZ, 100);
    let maximum = 0;
    for (const resultFrame of resultSet.frames) {
      for (const member of resultFrame.members ?? []) {
        for (const station of member.stations ?? [])
          maximum = Math.max(maximum, Math.abs(station[component] ?? 0));
      }
    }
    return maximum > 0 ? (span * 0.15) / maximum : 1;
  }

  function currentFrameIndex(): number {
    return resultSet ? Math.min(viewer.getResultFrameIndex(), resultSet.frames.length - 1) : 0;
  }

  function frameTime(index: number): number | undefined {
    return resultSet?.frames[index]?.time;
  }

  function showResultsPanel(): void {
    const content = createElement('div', 'panel-form');
    content.append(
      createButton(localText('解析用モデル対応情報を保存', 'Export analysis model binding'), async () => {
        const revision = doc.revision;
        const fingerprint = await modelFingerprint(doc);
        if (revision !== doc.revision) return;
        const binding = {
          format: 'framemodelmaker-binding-v1',
          modelFingerprint: fingerprint,
          units: { length: 'cm', force: 'kN', time: 's' },
          nodes: doc.nodes.map((node) => ({
            tag: node.number,
            nodeNumber: node.number,
            coordinates: [node.x, node.y, node.z],
          })),
          members: doc.members.map((member) => ({
            tag: member.number,
            memberNumber: member.number,
            nodeI: member.iNodeNumber,
            nodeJ: member.jNodeNumber,
            localY: resolveLocalAxes(
              doc.findNodeByNumber(member.iNodeNumber)!,
              doc.findNodeByNumber(member.jNodeNumber)!,
              doc.analysisMetadata?.localAxes[String(member.number)],
            ).y,
          })),
        };
        downloadText(JSON.stringify(binding, null, 2), 'analysis-binding.json', 'application/json');
        updateStatus(localText('解析用モデル対応情報を保存しました。', 'Analysis model binding exported.'));
      }),
    );

    content.appendChild(
      createElement(
        'p',
        'diagnostic-item warn',
        localText(
          '結果JSONは cm / kN / kN-cm、節点反力 global-xyz、部材力 local-xyz を使用します。OpenSees変換形式ではモデル指紋・局所軸を照合し、m・mm・Nから変換します。指紋のない旧結果はモデルの一致を保証できません。',
          'Result JSON uses cm / kN / kN-cm, global node reactions and local member forces. The OpenSees adapter verifies the model fingerprint and axes and converts m/mm/N. Legacy results without fingerprints cannot verify model identity.',
        ),
      ),
    );

    // --- State block (machine-readable, R14) ---
    const state = createElement('div', 'results-state');
    state.id = 'results-state';
    const stateTable = createElement('table', 'panel-table');
    state.appendChild(stateTable);
    content.appendChild(state);

    const input = createElement('input');
    input.type = 'file';
    input.name = 'results-file';
    input.accept = '.json,application/json';
    const frame = createElement('input');
    frame.type = 'range';
    frame.name = 'results-frame-range';
    frame.min = '0';
    const frameNumber = createElement('input');
    frameNumber.name = 'results-frame-number';
    applyNumericConstraints(frameNumber, { integer: true, min: 1 });
    const timeInput = createElement('input');
    timeInput.name = 'results-time';
    applyNumericConstraints(timeInput, {});
    const frameLabel = createElement('output');
    frameLabel.id = 'results-frame-label';
    const fps = createElement('input');
    fps.name = 'results-fps';
    applyNumericConstraints(fps, { min: 1, max: 120 });
    fps.value = String(playbackFps);
    const loop = createElement('input');
    loop.type = 'checkbox';
    loop.name = 'results-loop';
    loop.checked = playbackLoop;

    const deformationScale = createElement('input');
    deformationScale.name = 'results-deformation-scale';
    applyNumericConstraints(deformationScale, { min: 0 });
    const currentDisplay = viewer.getResultDisplay();
    deformationScale.value = String(currentDisplay.deformationScale);
    const showDeformation = createElement('input');
    showDeformation.type = 'checkbox';
    showDeformation.name = 'results-show-deformation';
    showDeformation.checked = currentDisplay.showDeformation;
    const showReactions = createElement('input');
    showReactions.type = 'checkbox';
    showReactions.name = 'results-show-reactions';
    showReactions.checked = resultSet ? currentDisplay.showReactions : true;
    const showUndeformed = createElement('input');
    showUndeformed.type = 'checkbox';
    showUndeformed.name = 'results-show-undeformed';
    showUndeformed.checked = currentDisplay.showUndeformed;
    const reactionScale = createElement('input');
    reactionScale.name = 'results-reaction-scale';
    applyNumericConstraints(reactionScale, { min: 0 });
    reactionScale.value = String(currentDisplay.reactionScale);
    const sectionForceScale = createElement('input');
    sectionForceScale.name = 'results-section-force-scale';
    applyNumericConstraints(sectionForceScale, { min: 0 });
    sectionForceScale.value = String(currentDisplay.sectionForceScale);
    const sectionForce = createElement('select');
    sectionForce.name = 'results-section-force';
    const sectionForceLabels: Record<string, [string, string]> = {
      '': ['なし', 'None'],
      axial: ['軸力 N', 'Axial N'],
      shearY: ['せん断力 Qy', 'Shear Qy'],
      shearZ: ['せん断力 Qz', 'Shear Qz'],
      torsion: ['ねじり Mx', 'Torsion Mx'],
      momentY: ['曲げモーメント My', 'Moment My'],
      momentZ: ['曲げモーメント Mz', 'Moment Mz'],
    };
    for (const value of ['', 'axial', 'shearY', 'shearZ', 'torsion', 'momentY', 'momentZ']) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = localText(...sectionForceLabels[value]);
      item.selected = currentDisplay.sectionForce === value;
      sectionForce.appendChild(item);
    }

    const selectionSection = createElement('div');
    selectionSection.id = 'results-selection';
    const extremesSection = createElement('div');
    extremesSection.id = 'results-extremes';

    const frameControls: HTMLElement[] = [];
    const renderState = (): void => {
      const count = resultSet?.frames.length ?? 0;
      const index = currentFrameIndex();
      const time = frameTime(index);
      state.dataset.loaded = String(resultSet !== null);
      state.dataset.playing = String(playing);
      state.dataset.frameCount = String(count);
      state.dataset.frameIndex = String(resultSet ? index + 1 : 0);
      stateTable.replaceChildren();
      const rows: Array<[string, string]> = resultSet
        ? [
            [localText('状態', 'State'), localText('結果読込済み', 'Results loaded')],
            [localText('ファイル名', 'File'), loadedFileName || '-'],
            [localText('結果名', 'Result title'), resultSet.name || '-'],
            [localText('荷重ケース / 組合せ', 'Load case / combination'), `${resultSet.loadCaseId ?? '-'} / ${resultSet.combinationId ?? '-'}`],
            [localText('再生状態', 'Playback'), playing ? localText('再生中', 'Playing') : localText('停止中', 'Stopped')],
            [localText('フレーム', 'Frame'), `${index + 1} / ${count}`],
            [localText('時刻', 'Time'), time === undefined ? '-' : `${formatNumber(time)} ${resultSet.units?.time ?? RESULT_UNITS.time}`],
          ]
        : [
            [localText('状態', 'State'), localText('結果未読込・0フレーム', 'No results loaded · 0 frames')],
            [localText('ファイル名', 'File'), '-'],
            [localText('再生状態', 'Playback'), localText('停止中', 'Stopped')],
            [localText('フレーム', 'Frame'), '0 / 0'],
            [localText('時刻', 'Time'), '-'],
          ];
      for (const [label, value] of rows) {
        const row = stateTable.insertRow();
        row.insertCell().textContent = label;
        row.insertCell().textContent = value;
      }
      frame.max = String(Math.max(0, count - 1));
      frame.value = String(index);
      frameNumber.max = String(Math.max(1, count));
      frameNumber.value = String(resultSet ? index + 1 : 0);
      timeInput.value = time === undefined ? '' : String(time);
      frameLabel.textContent = resultSet
        ? `${index + 1} / ${count}${time === undefined ? '' : ` (t=${formatNumber(time)} ${RESULT_UNITS.time})`}`
        : localText('結果未読込・0フレーム', 'No results · 0 frames');
      for (const control of frameControls) (control as HTMLInputElement | HTMLButtonElement).disabled = !resultSet;
      renderExtremes();
    };

    const renderSelection = (): void => {
      selectionSection.replaceChildren();
      selectionSection.append(createElement('h3', 'panel-subtitle', localText('選択要素の数値', 'Values for the selection')));
      const selection = getSelection();
      const frameData = resultSet?.frames[currentFrameIndex()];
      if (!resultSet || !frameData) {
        selectionSection.append(createElement('p', undefined, localText('結果未読込のため数値はありません。', 'No values: results are not loaded.')));
        return;
      }
      selectionSection.append(
        createElement(
          'p',
          'field-description',
          localText(
            `単位: 変位 ${RESULT_UNITS.displacement}、回転 ${RESULT_UNITS.rotation}、力 ${RESULT_UNITS.force}、モーメント ${RESULT_UNITS.moment}。節点は全体XYZ、部材端力は局所xyz（正の局所x面に作用する断面力）。`,
            `Units: displacement ${RESULT_UNITS.displacement}, rotation ${RESULT_UNITS.rotation}, force ${RESULT_UNITS.force}, moment ${RESULT_UNITS.moment}. Nodes use global XYZ; member forces use local xyz acting on the positive local-x face.`,
          ),
        ),
      );
      if (selection.kind === 'node') {
        const row = nodeResultRow(frameData, selection.nodeNumber);
        if (!row) {
          selectionSection.append(createElement('p', undefined, localText(`節点 ${selection.nodeNumber} の結果はありません。`, `No result for node ${selection.nodeNumber}.`)));
          return;
        }
        const table = createElement('table', 'panel-table');
        const entries: Array<[string, string]> = [
          [localText('節点', 'Node'), String(row.nodeNumber)],
          [`dx / dy / dz (${RESULT_UNITS.displacement})`, row.displacement.map(formatNumber).join(' / ')],
          [`rx / ry / rz (${RESULT_UNITS.rotation})`, row.rotation.map(formatNumber).join(' / ')],
          [`Rx / Ry / Rz (${RESULT_UNITS.force})`, row.reaction ? row.reaction.map(formatNumber).join(' / ') : '-'],
          [`RMx / RMy / RMz (${RESULT_UNITS.moment})`, row.reactionMoment ? row.reactionMoment.map(formatNumber).join(' / ') : '-'],
        ];
        for (const [label, value] of entries) {
          const tr = table.insertRow();
          tr.insertCell().textContent = label;
          tr.insertCell().textContent = value;
        }
        selectionSection.append(table);
      } else if (selection.kind === 'member') {
        const row = memberResultRow(frameData, selection.memberNumber);
        if (!row) {
          selectionSection.append(createElement('p', undefined, localText(`部材 ${selection.memberNumber} の結果はありません。`, `No result for member ${selection.memberNumber}.`)));
          return;
        }
        const table = createElement('table', 'panel-table');
        const head = table.createTHead().insertRow();
        for (const header of [localText('位置 (I=0, J=1)', 'Position (I=0, J=1)'), ...SECTION_FORCE_COMPONENTS.map((component) => `${SECTION_FORCE_LABELS[component]} (${sectionForceUnit(component)})`)]) {
          const cell = document.createElement('th');
          cell.textContent = header;
          head.appendChild(cell);
        }
        const body = table.createTBody();
        for (const station of row.stations) {
          const tr = body.insertRow();
          tr.insertCell().textContent = station.position === 0 ? 'I (0)' : station.position === 1 ? 'J (1)' : formatNumber(station.position);
          for (const component of SECTION_FORCE_COMPONENTS)
            tr.insertCell().textContent = station[component] === undefined ? '-' : formatNumber(station[component]!);
        }
        selectionSection.append(createElement('p', undefined, `${localText('部材', 'Member')} ${row.memberNumber}`), table);
      } else {
        selectionSection.append(createElement('p', undefined, localText('節点または部材を選択すると数値を表示します。', 'Select a node or member to show its values.')));
      }
    };

    const renderExtremes = (): void => {
      extremesSection.replaceChildren();
      extremesSection.append(createElement('h3', 'panel-subtitle', localText('最大・最小値（現在フレーム）', 'Extremes (current frame)')));
      const frameData = resultSet?.frames[currentFrameIndex()];
      if (!frameData) {
        extremesSection.append(createElement('p', undefined, localText('結果未読込。', 'No results loaded.')));
        return;
      }
      const table = createElement('table', 'panel-table');
      const head = table.createTHead().insertRow();
      for (const header of [localText('成分', 'Component'), localText('最大', 'Max'), localText('位置', 'At'), localText('最小', 'Min'), localText('位置', 'At')]) {
        const cell = document.createElement('th');
        cell.textContent = header;
        head.appendChild(cell);
      }
      const describe = (location: { nodeNumber?: number; memberNumber?: number; position?: number } | null): string =>
        !location
          ? '-'
          : location.nodeNumber !== undefined
            ? `${localText('節点', 'Node')} ${location.nodeNumber}`
            : `${localText('部材', 'Member')} ${location.memberNumber} @ ${formatNumber(location.position ?? 0)}`;
      const body = table.createTBody();
      for (const entry of frameExtremes(frameData)) {
        const tr = body.insertRow();
        tr.insertCell().textContent = `${entry.label} (${entry.unit})`;
        tr.insertCell().textContent = entry.max ? formatNumber(entry.max.value) : '-';
        tr.insertCell().textContent = describe(entry.max);
        tr.insertCell().textContent = entry.min ? formatNumber(entry.min.value) : '-';
        tr.insertCell().textContent = describe(entry.min);
      }
      extremesSection.append(table);
    };

    const setFrame = (index: number): void => {
      if (!resultSet) return;
      const clamped = Math.max(0, Math.min(resultSet.frames.length - 1, Math.trunc(index)));
      viewer.setResultFrame(clamped);
      renderState();
      renderSelection();
    };

    const loadResults = async (): Promise<void> => {
      const file = input.files?.[0];
      if (!file) return;
      assertImportFileSize(file);
      const currentValidation = validateFrameDocument(doc);
      if (currentValidation.errorCount > 0) {
        throw new Error(
          localText(
            `現在のモデルに検証エラーが${currentValidation.errorCount}件あるため、解析結果を表示できません。先にモデル健全性センターで修正してください。`,
            `Analysis results cannot be displayed while the model has ${currentValidation.errorCount} validation errors. Fix them in Model Health Center first.`,
          ),
        );
      }
      const request = ++requestId;
      const revision = doc.revision;
      const text = await file.text();
      const raw = JSON.parse(text);
      const parsed =
        raw.format === 'opensees-recorder-v1'
          ? await convertOpenSeesResults(text, doc)
          : parseAnalysisResult(text);
      if (revision !== doc.revision)
        throw new Error(localText('結果の読込中にモデルが変更されました。', 'Model changed while loading results.'));
      if (parsed.modelFingerprint && parsed.modelFingerprint !== (await modelFingerprint(doc)))
        throw new Error(localText('解析結果は別のモデル版に属しています。', 'Analysis results belong to another model revision.'));
      if (revision !== doc.revision)
        throw new Error(localText('結果の照合中にモデルが変更されました。', 'Model changed while checking results.'));
      if (request !== requestId || !input.isConnected) return;
      const knownNodes = new Set(doc.nodes.map((node) => node.number));
      const knownMembers = new Set(doc.members.map((member) => member.number));
      const unknownNodes = new Set<number>();
      const unknownMembers = new Set<number>();
      for (const resultFrame of parsed.frames) {
        for (const node of resultFrame.nodes) {
          if (!knownNodes.has(node.nodeNumber)) unknownNodes.add(node.nodeNumber);
        }
        for (const member of resultFrame.members) {
          if (!knownMembers.has(member.memberNumber)) unknownMembers.add(member.memberNumber);
        }
      }
      if (unknownNodes.size > 0 || unknownMembers.size > 0) {
        throw new Error(
          localText(
            `解析結果にモデル未登録の参照があります（節点: ${[...unknownNodes].join(', ') || '-'}、部材: ${[...unknownMembers].join(', ') || '-'}）。`,
            `Results reference entities outside the model (nodes: ${[...unknownNodes].join(', ') || '-'}; members: ${[...unknownMembers].join(', ') || '-'}).`,
          ),
        );
      }
      if (parsed.loadCaseId && !doc.loadCases.some((loadCase) => loadCase.id === parsed.loadCaseId)) {
        throw new Error(
          localText(
            `荷重ケースID「${parsed.loadCaseId}」は現在のモデルにありません。`,
            `Load case ID “${parsed.loadCaseId}” does not exist in the current model.`,
          ),
        );
      }
      if (
        parsed.combinationId &&
        !doc.loadCombinations.some((combination) => combination.id === parsed.combinationId)
      ) {
        throw new Error(
          localText(
            `荷重組合せID「${parsed.combinationId}」は現在のモデルにありません。`,
            `Load combination ID “${parsed.combinationId}” does not exist in the current model.`,
          ),
        );
      }
      resultSet = adaptAnalysisResult(parsed);
      loadedFileName = file.name;
      playing = false;
      viewer.setAnalysisResults(resultSet);
      viewer.setLayerVisibility({ results: true });
      if (sectionForce.value) {
        sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
      }
      updateDisplay();
      viewer.setResultFrame(0);
      renderState();
      renderSelection();
      updateViewerToggleStates();
      updateStatus(
        localText(
          `解析結果「${parsed.title || file.name}」を読み込みました（${resultSet.frames.length}フレーム）`,
          `Loaded results “${parsed.title || file.name}” (${resultSet.frames.length} frames)`,
        ),
      );
    };
    input.addEventListener('change', () => {
      void loadResults().catch(reportError);
    });
    frame.addEventListener('input', () => setFrame(Number(frame.value)));
    frameNumber.addEventListener('change', () => setFrame(Number(frameNumber.value) - 1));
    timeInput.addEventListener('change', () => {
      if (resultSet) setFrame(frameIndexForTime(resultSet, Number(timeInput.value)));
    });
    fps.addEventListener('change', () => {
      const value = Number(fps.value);
      if (Number.isFinite(value) && value >= 1) playbackFps = value;
    });
    loop.addEventListener('change', () => (playbackLoop = loop.checked));
    const nonNegativeValue = (control: HTMLInputElement, fallback: number): number => {
      const value = Number(control.value);
      return Number.isFinite(value) && value >= 0 ? value : fallback;
    };
    const updateDisplay = (): void =>
      viewer.setResultDisplay({
        showDeformation: showDeformation.checked,
        showReactions: showReactions.checked,
        showUndeformed: showUndeformed.checked,
        deformationScale: nonNegativeValue(deformationScale, 1),
        reactionScale: nonNegativeValue(reactionScale, 1),
        sectionForce: sectionForce.value ? (sectionForce.value as SectionForceKey) : null,
        sectionForceScale: nonNegativeValue(sectionForceScale, 1),
      });
    for (const control of [
      showDeformation,
      showReactions,
      showUndeformed,
      deformationScale,
      reactionScale,
      sectionForceScale,
    ]) {
      control.addEventListener('change', updateDisplay);
    }
    sectionForce.addEventListener('change', () => {
      if (sectionForce.value && resultSet) {
        sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
      }
      updateDisplay();
    });

    const stepButton = (label: string, step: (index: number, last: number) => number, id: string): HTMLButtonElement => {
      const button = createButton(label, () => setFrame(step(currentFrameIndex(), (resultSet?.frames.length ?? 1) - 1)), 'toolbar-btn secondary');
      button.id = id;
      frameControls.push(button);
      return button;
    };
    const stepper = createElement('div', 'panel-inline-actions');
    stepper.append(
      stepButton('|◀', () => 0, 'results-first'),
      stepButton('◀', (index) => index - 1, 'results-prev'),
      stepButton('▶', (index) => index + 1, 'results-next'),
      stepButton('▶|', (_, last) => last, 'results-last'),
    );
    const play = createButton(t('results.play'), () => {
      if (!resultSet) return;
      playing = viewer.playResults({
        fps: playbackFps,
        loop: playbackLoop,
        onFrame: () => {
          renderState();
          renderSelection();
          // Non-looping playback stops on the last frame; reflect that once the viewer has updated.
          window.setTimeout(() => {
            if (playing && !viewer.isResultAnimationPlaying()) {
              playing = false;
              renderState();
            }
          }, 0);
        },
      });
      renderState();
      updateStatus(playing ? localText('解析結果を再生中', 'Playing analysis results') : localText('再生できるフレームがありません。', 'No frames to play.'));
    });
    play.id = 'results-play';
    const pause = createButton(
      t('results.pause'),
      () => {
        viewer.pauseResults();
        playing = false;
        renderState();
        updateStatus(localText('再生を停止しました', 'Playback paused'));
      },
      'panel-action secondary',
    );
    pause.id = 'results-pause';
    const exportCsv = createButton(
      localText('現在フレームの数値をCSV出力', 'Export current frame as CSV'),
      () => {
        if (!resultSet) return;
        const index = currentFrameIndex();
        downloadText(
          resultFrameToCsv(resultSet, index),
          `${safeFilename(doc.title || 'frame-model', 'frame-model')}-results-frame${index + 1}.csv`,
          'text/csv;charset=utf-8',
        );
        updateStatus(localText(`結果CSVを書き出しました（フレーム ${index + 1}）`, `Results CSV exported (frame ${index + 1})`));
      },
      'panel-action secondary',
    );
    exportCsv.id = 'results-export-csv';
    const unload = createButton(
      localText('結果を閉じる', 'Unload results'),
      () => {
        const name = resultSet?.name || loadedFileName;
        invalidateAnalysisResults();
        renderState();
        renderSelection();
        updateStatus(localText(`解析結果「${name}」を閉じました`, `Unloaded results “${name}”`));
      },
      'panel-action secondary',
    );
    unload.id = 'results-unload';
    frameControls.push(frame, frameNumber, timeInput, play, pause, exportCsv, unload);

    content.append(
      labelled(t('results.load'), input),
      labelled(localText('フレーム', 'Frame'), frame),
      frameLabel,
      labelled(localText('フレーム番号（直接入力）', 'Frame number (direct input)'), frameNumber),
      labelled(localText(`時刻 (${RESULT_UNITS.time})`, `Time (${RESULT_UNITS.time})`), timeInput),
      stepper,
      labelled(localText('再生速度 (fps)', 'Playback speed (fps)'), fps),
      labelled(localText('ループ再生', 'Loop playback'), loop),
      play,
      pause,
      labelled(localText('変形を表示', 'Show deformation'), showDeformation),
      labelled(localText('未変形形を表示', 'Show undeformed'), showUndeformed),
      labelled(t('results.scale'), deformationScale),
      labelled(localText('反力を表示', 'Show reactions'), showReactions),
      labelled(localText('反力倍率', 'Reaction scale'), reactionScale),
      labelled(localText('断面力', 'Section force'), sectionForce),
      labelled(localText('断面力倍率', 'Section-force scale'), sectionForceScale),
      createButton(
        localText('断面力倍率を自動調整', 'Auto-scale section forces'),
        () => {
          if (!sectionForce.value) return;
          sectionForceScale.value = String(
            recommendedSectionForceScale(sectionForce.value as SectionForceKey),
          );
          updateDisplay();
        },
        'panel-action secondary',
      ),
      selectionSection,
      extremesSection,
      exportCsv,
      unload,
    );
    renderState();
    renderSelection();
    syncOpenPanel = () => {
      renderState();
      renderSelection();
    };
    syncOpenSelection = renderSelection;
    toolPanel.open(t('panel.results'), content, {
      id: RESULTS_PANEL_ID,
      onModelChanged: () => syncOpenPanel?.(),
      onClose: () => {
        syncOpenPanel = null;
        syncOpenSelection = null;
      },
    });
  }

  return {
    show: showResultsPanel,
    invalidate: invalidateAnalysisResults,
    /** Re-renders the selection values when the selection changes. */
    syncSelection: () => syncOpenSelection?.(),
    hasResults: () => resultSet !== null,
  };
}
