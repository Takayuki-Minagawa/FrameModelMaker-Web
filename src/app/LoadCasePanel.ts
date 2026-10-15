import { t } from '../i18n';
import type { FrameDocument } from '../models/FrameDocument';
import { LoadCaseType } from '../models/LoadCase';
import type { LoadCombination, LoadCombinationTerm } from '../models/LoadCombination';
import type { DialogService } from './DialogService';
import type { ToolPanel } from './ToolPanel';
import { applyNumericConstraints, createButton, createElement, labelled, localText } from './UiHelpers';

export type NotifyKind = 'info' | 'success' | 'error' | 'cancel';

export interface LoadCasePanelContext {
  doc: FrameDocument;
  dialogService: DialogService;
  toolPanel: ToolPanel;
  mutateDocument<T>(label: string, action: () => T): T;
  /** Switches the active (displayed) load case without recording history. */
  setActiveLoadCaseIndex(index: number): void;
  notify(kind: NotifyKind, message: string): void;
}

export const LOAD_CASE_PANEL_ID = 'load-cases';

/** Label used for a load case everywhere in the panel: display order, name and stable ID. */
export function describeLoadCase(doc: FrameDocument, id: string): string {
  const index = doc.loadCases.findIndex((loadCase) => loadCase.id === id);
  const loadCase = doc.loadCases[index];
  if (!loadCase) return id;
  return `${index + 1}: ${loadCase.name} (${loadCase.id})`;
}

/**
 * Load case metadata editor plus load combination editor. The editor always
 * targets the case identified by `editingCaseId`, which is shown in the panel,
 * and follows the "current load case" selector unless unsaved edits exist.
 */
export function createLoadCasePanel(context: LoadCasePanelContext) {
  const { doc, dialogService, toolPanel, mutateDocument, setActiveLoadCaseIndex, notify } = context;
  let editingCaseId: string | null = null;
  let caseForm: {
    target: HTMLElement;
    name: HTMLInputElement;
    type: HTMLSelectElement;
    memo: HTMLTextAreaElement;
    dirtyBadge: HTMLElement;
  } | null = null;
  /** Values last written into the form; "unsaved edits" are user changes relative to these. */
  let filledValues: { name: string; type: string; memo: string } | null = null;
  let combinationSection: HTMLElement | null = null;
  let editingCombinationId: string | null = null;
  let combinationDraft: { name: string; memo: string; terms: LoadCombinationTerm[] } | null = null;
  let switching = false;

  function editingCase() {
    return doc.loadCases.find((loadCase) => loadCase.id === editingCaseId) ?? null;
  }

  function isCaseFormDirty(): boolean {
    if (!caseForm || !filledValues || !editingCase()) return false;
    return (
      caseForm.name.value !== filledValues.name ||
      caseForm.type.value !== filledValues.type ||
      caseForm.memo.value !== filledValues.memo
    );
  }

  function fillCaseForm(): void {
    const loadCase = editingCase();
    if (!caseForm) return;
    if (!loadCase) {
      caseForm.target.textContent = localText('編集対象: なし', 'Editing: none');
      return;
    }
    caseForm.target.textContent = `${localText('編集対象', 'Editing')}: ${describeLoadCase(doc, loadCase.id)}`;
    caseForm.target.dataset.loadCaseId = loadCase.id;
    caseForm.name.value = loadCase.name;
    caseForm.type.value = loadCase.type;
    caseForm.memo.value = loadCase.memo;
    filledValues = { name: loadCase.name, type: loadCase.type, memo: loadCase.memo };
    updateDirtyBadge();
  }

  function updateDirtyBadge(): void {
    if (!caseForm) return;
    const dirty = isCaseFormDirty();
    caseForm.dirtyBadge.classList.toggle('hidden', !dirty);
    caseForm.target.dataset.dirty = String(dirty);
  }

  function applyCaseEdit(): void {
    const loadCase = editingCase();
    if (!caseForm || !loadCase) {
      notify('error', localText('編集対象の荷重ケースがありません。', 'No load case is being edited.'));
      return;
    }
    const form = caseForm;
    const nextName = form.name.value.trim() || loadCase.name;
    const label = describeLoadCase(doc, loadCase.id);
    mutateDocument('Edit load case metadata', () => {
      loadCase.name = nextName;
      loadCase.type = form.type.value;
      loadCase.memo = form.memo.value;
    });
    fillCaseForm();
    notify(
      'success',
      localText(
        `荷重ケース ${label} を更新しました → ${describeLoadCase(doc, loadCase.id)}`,
        `Updated load case ${label} → ${describeLoadCase(doc, loadCase.id)}`,
      ),
    );
  }

  /**
   * Called when the "current load case" selector changes. Unsaved edits can be
   * saved, discarded, or the switch can be cancelled (the selector is reverted).
   */
  async function onActiveCaseChanged(): Promise<void> {
    const current = doc.loadCases[doc.loadCaseIndex];
    if (!toolPanel.isOpen || toolPanel.currentId !== LOAD_CASE_PANEL_ID || !current) return;
    if (current.id === editingCaseId || switching) return;
    if (isCaseFormDirty()) {
      switching = true;
      try {
        const previousId = editingCaseId!;
        const choice = await dialogService.choose({
          title: localText('未確定のケース編集があります', 'Unsaved load case edits'),
          body: localText(
            `${describeLoadCase(doc, previousId)} の名前・種別・メモに未確定の編集があります。`,
            `Load case ${describeLoadCase(doc, previousId)} has unsaved name/type/memo edits.`,
          ),
          choices: [
            { value: 'save', label: localText('保存して切替', 'Save and switch') },
            { value: 'discard', label: localText('破棄して切替', 'Discard and switch'), destructive: true },
          ],
          cancelLabel: localText('切替を取消', 'Cancel switch'),
        });
        if (choice === null) {
          const previousIndex = doc.loadCases.findIndex((loadCase) => loadCase.id === previousId);
          if (previousIndex >= 0) setActiveLoadCaseIndex(previousIndex);
          notify('cancel', localText('荷重ケースの切替を取り消しました。', 'Load case switch cancelled.'));
          return;
        }
        if (choice === 'save') applyCaseEdit();
      } finally {
        switching = false;
      }
    }
    editingCaseId = doc.loadCases[doc.loadCaseIndex]?.id ?? null;
    fillCaseForm();
  }

  function syncFromModel(): void {
    if (!caseForm) return;
    if (!editingCase()) {
      // The edited case was removed (or undone away): re-target the current case and drop stale inputs.
      editingCaseId = doc.loadCases[doc.loadCaseIndex]?.id ?? null;
      fillCaseForm();
    } else if (!isCaseFormDirty()) fillCaseForm();
    else updateDirtyBadge();
    renderCombinations();
  }

  function caseOptions(select: HTMLSelectElement, selectedId: string): void {
    select.replaceChildren();
    for (const loadCase of doc.loadCases) {
      const item = document.createElement('option');
      item.value = loadCase.id;
      item.textContent = describeLoadCase(doc, loadCase.id);
      item.selected = loadCase.id === selectedId;
      select.appendChild(item);
    }
  }

  function describeTerms(terms: LoadCombinationTerm[]): string {
    return terms.map((term) => `${describeLoadCase(doc, term.loadCaseId)} × ${term.factor}`).join(' + ') || '-';
  }

  function renderCombinations(): void {
    if (!combinationSection) return;
    const section = combinationSection;
    section.replaceChildren();
    section.append(
      createElement('h3', 'panel-subtitle', t('loadcase.combinations')),
      createElement(
        'p',
        'field-description',
        localText(
          '表示番号「1/2」は並び順、「LC1/LC2」は固定IDです。組合せは固定IDで荷重ケースを参照します。',
          'Display numbers "1/2" follow the order; "LC1/LC2" are stable IDs. Combinations reference the stable ID.',
        ),
      ),
    );
    const list = createElement('div', 'diagnostic-list');
    list.id = 'load-combination-list';
    if (!doc.loadCombinations.length) {
      list.append(createElement('p', undefined, localText('荷重組合せはありません。', 'No load combinations.')));
    }
    for (const combination of doc.loadCombinations) {
      const row = createElement('div', 'diagnostic-item info');
      row.dataset.combinationId = combination.id;
      row.append(
        createElement('p', undefined, `${combination.name} (${combination.id}): ${describeTerms(combination.terms)}`),
      );
      const actions = createElement('div', 'panel-inline-actions');
      actions.append(
        createButton(
          localText(`編集: ${combination.name}`, `Edit: ${combination.name}`),
          () => startEditingCombination(combination),
          'toolbar-btn secondary',
        ),
        createButton(
          localText(`複製: ${combination.name}`, `Duplicate: ${combination.name}`),
          () => {
            const copy = mutateDocument('Duplicate load combination', () =>
              doc.addLoadCombination(`${combination.name} Copy`, combination.terms, undefined, combination.memo),
            );
            notify(
              'success',
              localText(
                `荷重組合せ ${combination.name} を複製しました → ${copy.name} (${copy.id})`,
                `Duplicated combination ${combination.name} → ${copy.name} (${copy.id})`,
              ),
            );
          },
          'toolbar-btn secondary',
        ),
        createButton(
          localText(`削除: ${combination.name}`, `Delete: ${combination.name}`),
          () => {
            mutateDocument('Delete load combination', () => {
              const index = doc.loadCombinations.indexOf(combination);
              if (index >= 0) doc.loadCombinations.splice(index, 1);
            });
            if (editingCombinationId === combination.id) {
              editingCombinationId = null;
              combinationDraft = null;
            }
            notify(
              'success',
              localText(
                `荷重組合せ ${combination.name} (${combination.id}) を削除しました`,
                `Deleted combination ${combination.name} (${combination.id})`,
              ),
            );
          },
          'toolbar-btn toolbar-btn-danger',
        ),
      );
      row.append(actions);
      list.appendChild(row);
    }
    section.append(list, renderCombinationForm());
  }

  function startEditingCombination(combination: LoadCombination): void {
    editingCombinationId = combination.id;
    combinationDraft = {
      name: combination.name,
      memo: combination.memo,
      terms: combination.terms.map((term) => ({ ...term })),
    };
    renderCombinations();
    combinationSection?.querySelector<HTMLInputElement>('input[name="combination-name"]')?.focus();
  }

  function renderCombinationForm(): HTMLElement {
    const editing = editingCombinationId
      ? doc.loadCombinations.find((item) => item.id === editingCombinationId) ?? null
      : null;
    if (editingCombinationId && !editing) {
      editingCombinationId = null;
      combinationDraft = null;
    }
    const draft = combinationDraft ?? {
      name: '',
      memo: '',
      terms: doc.loadCases.length ? [{ loadCaseId: doc.loadCases[0].id, factor: 1 }] : [],
    };
    combinationDraft = draft;
    const form = createElement('div', 'panel-form');
    form.id = 'load-combination-form';
    form.append(
      createElement(
        'p',
        'panel-subtitle',
        editing
          ? localText(`組合せを編集: ${editing.name} (${editing.id})`, `Editing combination: ${editing.name} (${editing.id})`)
          : localText('組合せを追加', 'Add combination'),
      ),
    );
    const name = createElement('input');
    name.name = 'combination-name';
    name.placeholder = localText('例: 長期', 'e.g. Service');
    name.value = draft.name;
    name.addEventListener('input', () => (draft.name = name.value));
    const memo = createElement('input');
    memo.name = 'combination-memo';
    memo.value = draft.memo;
    memo.addEventListener('input', () => (draft.memo = memo.value));
    form.append(labelled(localText('組合せ名', 'Combination name'), name), labelled(localText('メモ', 'Memo'), memo));

    const terms = createElement('table', 'panel-table');
    terms.id = 'load-combination-terms';
    const head = terms.createTHead().insertRow();
    for (const header of [localText('荷重ケース', 'Load case'), localText('係数', 'Factor'), '']) {
      const cell = document.createElement('th');
      cell.textContent = header;
      head.appendChild(cell);
    }
    const body = terms.createTBody();
    draft.terms.forEach((term, index) => {
      const row = body.insertRow();
      const select = createElement('select');
      select.name = `term-case-${index}`;
      caseOptions(select, term.loadCaseId);
      select.addEventListener('change', () => (term.loadCaseId = select.value));
      const factor = createElement('input');
      factor.name = `term-factor-${index}`;
      applyNumericConstraints(factor, {});
      factor.value = String(term.factor);
      factor.addEventListener('input', () => (term.factor = Number(factor.value)));
      row.insertCell().appendChild(select);
      row.insertCell().appendChild(factor);
      row.insertCell().appendChild(
        createButton(
          localText('行を削除', 'Remove row'),
          () => {
            draft.terms.splice(index, 1);
            renderCombinations();
          },
          'toolbar-btn secondary',
        ),
      );
    });
    form.append(terms);
    form.append(
      createButton(
        localText('ケース行を追加', 'Add case row'),
        () => {
          draft.terms.push({ loadCaseId: doc.loadCases[0]?.id ?? '', factor: 1 });
          renderCombinations();
        },
        'panel-action secondary',
      ),
    );
    const submit = createButton(
      editing ? localText('組合せを更新', 'Update combination') : localText('組合せを追加', 'Add combination'),
      () => {
        const combinationName = draft.name.trim();
        if (!combinationName) throw new Error(localText('組合せ名を入力してください。', 'Enter a combination name.'));
        if (!draft.terms.length) throw new Error(localText('ケース行を1件以上追加してください。', 'Add at least one case row.'));
        const known = new Set(doc.loadCases.map((loadCase) => loadCase.id));
        for (const term of draft.terms) {
          if (!known.has(term.loadCaseId) || !Number.isFinite(term.factor)) {
            throw new Error(
              localText('存在する荷重ケースと有限の係数を指定してください。', 'Choose an existing load case and a finite factor.'),
            );
          }
        }
        if (editing) {
          mutateDocument('Edit load combination', () => {
            editing.name = combinationName;
            editing.memo = draft.memo;
            editing.terms = draft.terms.map((term) => ({ ...term }));
          });
          notify(
            'success',
            localText(
              `荷重組合せ ${combinationName} (${editing.id}) を更新しました: ${describeTerms(editing.terms)}`,
              `Updated combination ${combinationName} (${editing.id}): ${describeTerms(editing.terms)}`,
            ),
          );
        } else {
          const created = mutateDocument('Add load combination', () =>
            doc.addLoadCombination(combinationName, draft.terms, undefined, draft.memo),
          );
          notify(
            'success',
            localText(
              `荷重組合せ ${created.name} (${created.id}) を追加しました: ${describeTerms(created.terms)}`,
              `Added combination ${created.name} (${created.id}): ${describeTerms(created.terms)}`,
            ),
          );
        }
        editingCombinationId = null;
        combinationDraft = null;
        renderCombinations();
      },
    );
    submit.id = 'load-combination-submit';
    form.append(submit);
    if (editing) {
      form.append(
        createButton(
          localText('編集を取消', 'Cancel editing'),
          () => {
            editingCombinationId = null;
            combinationDraft = null;
            renderCombinations();
            notify('cancel', localText('組合せの編集を取り消しました。', 'Combination edit cancelled.'));
          },
          'panel-action secondary',
        ),
      );
    }
    return form;
  }

  function show(): void {
    const content = createElement('div');
    editingCaseId = doc.loadCases[doc.loadCaseIndex]?.id ?? null;
    const form = createElement('div', 'panel-form');
    form.id = 'load-case-form';
    const target = createElement('p', 'panel-subtitle');
    target.id = 'load-case-edit-target';
    const dirtyBadge = createElement('span', 'panel-badge', localText('未確定の編集', 'Unsaved edits'));
    dirtyBadge.classList.add('hidden');
    target.append(dirtyBadge);
    const name = createElement('input');
    name.name = 'load-case-name';
    const type = createElement('select');
    type.name = 'load-case-type';
    for (const value of Object.values(LoadCaseType)) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = value;
      type.appendChild(item);
    }
    const memo = createElement('textarea');
    memo.name = 'load-case-memo';
    for (const control of [name, type, memo]) control.addEventListener('input', updateDirtyBadge);
    type.addEventListener('change', updateDirtyBadge);
    const update = createButton(localText('ケース情報を更新', 'Update case'), applyCaseEdit);
    update.id = 'load-case-update';
    const revert = createButton(
      localText('入力を元に戻す', 'Revert inputs'),
      () => {
        fillCaseForm();
        notify('cancel', localText('ケース情報の編集を取り消しました。', 'Load case edits reverted.'));
      },
      'panel-action secondary',
    );
    form.append(
      target,
      labelled(localText('ケース名', 'Case name'), name),
      labelled(localText('種別', 'Type'), type),
      labelled(localText('メモ', 'Memo'), memo),
      update,
      revert,
    );
    caseForm = { target, name, type, memo, dirtyBadge };
    const typeOption = Array.from(type.options).find((item) => item.value === (editingCase()?.type ?? ''));
    if (!typeOption && editingCase()) {
      const item = document.createElement('option');
      item.value = editingCase()!.type;
      item.textContent = editingCase()!.type;
      type.appendChild(item);
    }
    fillCaseForm();
    content.appendChild(form);
    combinationSection = createElement('div');
    combinationSection.id = 'load-combination-section';
    content.appendChild(combinationSection);
    renderCombinations();
    toolPanel.open(t('loadcase.combinations'), content, {
      id: LOAD_CASE_PANEL_ID,
      onModelChanged: syncFromModel,
      onClose: () => {
        caseForm = null;
        filledValues = null;
        combinationSection = null;
        editingCombinationId = null;
        combinationDraft = null;
      },
    });
  }

  return {
    show,
    onActiveCaseChanged,
    /** Exposed for tests and status rendering. */
    getEditingCaseId: () => editingCaseId,
    isCaseFormDirty,
  };
}
