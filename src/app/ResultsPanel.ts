import { convertOpenSeesResults } from '../io/OpenSeesResults';
import { resolveLocalAxes } from '../services/LocalAxes';
import { modelFingerprint } from '../services/ModelFingerprint';
import { adaptAnalysisResult } from '../viewer/ResultsAdapter';
import { createButton, createElement, labelled, localText } from './UiHelpers';

import { t } from '../i18n';
import { parseAnalysisResult } from '../models/AnalysisResult';
import { FrameDocument } from '../models/FrameDocument';
import { validateFrameDocument } from '../validation/FrameValidator';
import { AnalysisResultSet, ModelViewer } from '../viewer/ModelViewer';
import { assertImportFileSize, downloadText } from './FileDownloads';
import { ToolPanel } from './ToolPanel';
export function createResultsPanel(context: {
  doc: FrameDocument;
  viewer: ModelViewer;
  toolPanel: ToolPanel;
  updateViewerToggleStates(): void;
  updateStatus(message: string): void;
  reportError(error: unknown): void;
}) {
  const { doc, viewer, toolPanel, updateViewerToggleStates, updateStatus, reportError } = context;
  let requestId = 0;
  let resultSet: AnalysisResultSet | null = null;
  function invalidateAnalysisResults(): boolean {
    requestId++;
    if (!resultSet) return false;
    viewer.pauseResults();
    resultSet = null;
    viewer.setAnalysisResults(null);
    viewer.setLayerVisibility({ results: false });
    updateViewerToggleStates();
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
    const input = createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    const frame = createElement('input');
    frame.type = 'range';
    frame.min = '0';
    frame.max = String(Math.max(0, (resultSet?.frames.length ?? 1) - 1));
    frame.value = String(viewer.getResultFrameIndex());
    const frameLabel = createElement(
      'output',
      undefined,
      `${Number(frame.value) + 1} / ${resultSet?.frames.length ?? 0}`,
    );
    const deformationScale = createElement('input');
    deformationScale.type = 'number';
    deformationScale.min = '0';
    deformationScale.step = '0.1';
    const currentDisplay = viewer.getResultDisplay();
    deformationScale.value = String(currentDisplay.deformationScale);
    const showDeformation = createElement('input');
    showDeformation.type = 'checkbox';
    showDeformation.checked = currentDisplay.showDeformation;
    const showReactions = createElement('input');
    showReactions.type = 'checkbox';
    showReactions.checked = resultSet ? currentDisplay.showReactions : true;
    const showUndeformed = createElement('input');
    showUndeformed.type = 'checkbox';
    showUndeformed.checked = currentDisplay.showUndeformed;
    const reactionScale = createElement('input');
    reactionScale.type = 'number';
    reactionScale.min = '0';
    reactionScale.step = '0.1';
    reactionScale.value = String(currentDisplay.reactionScale);
    const sectionForceScale = createElement('input');
    sectionForceScale.type = 'number';
    sectionForceScale.min = '0';
    sectionForceScale.step = 'any';
    sectionForceScale.value = String(currentDisplay.sectionForceScale);
    const sectionForce = createElement('select');
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
      if (revision !== doc.revision) throw new Error('Model changed while loading results.');
      if (parsed.modelFingerprint && parsed.modelFingerprint !== (await modelFingerprint(doc)))
        throw new Error('Analysis results belong to another model revision.');
      if (revision !== doc.revision) throw new Error('Model changed while checking results.');
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
      viewer.setAnalysisResults(resultSet);
      viewer.setLayerVisibility({ results: true });
      if (sectionForce.value) {
        sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
      }
      updateDisplay();
      frame.max = String(resultSet.frames.length - 1);
      frame.value = '0';
      frameLabel.textContent = `1 / ${resultSet.frames.length}`;
      updateViewerToggleStates();
      updateStatus(
        localText(
          `解析結果「${parsed.title || file.name}」を読み込みました`,
          `Loaded results “${parsed.title || file.name}”`,
        ),
      );
    };
    input.addEventListener('change', () => {
      void loadResults().catch(reportError);
    });
    frame.addEventListener('input', () => {
      viewer.setResultFrame(Number(frame.value));
      frameLabel.textContent = `${Number(frame.value) + 1} / ${resultSet?.frames.length ?? 0}`;
    });
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
    content.append(
      labelled(t('results.load'), input),
      labelled(localText('フレーム', 'Frame'), frame),
      frameLabel,
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
      createButton(t('results.play'), () => {
        viewer.playResults({
          fps: 12,
          loop: true,
          onFrame: (index) => {
            frame.value = String(index);
            frameLabel.textContent = `${index + 1} / ${resultSet?.frames.length ?? 0}`;
          },
        });
      }),
      createButton(t('results.pause'), () => viewer.pauseResults(), 'panel-action secondary'),
      createButton(
        localText('結果を閉じる', 'Unload results'),
        () => {
          invalidateAnalysisResults();
          showResultsPanel();
        },
        'panel-action secondary',
      ),
    );
    toolPanel.open(t('panel.results'), content);
  }

  return { show: showResultsPanel, invalidate: invalidateAnalysisResults };
}
