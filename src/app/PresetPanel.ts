import type { FrameDocument } from '../models/FrameDocument';
import { Material } from '../models/Material';
import { PresetRepository, validatePreset, type Preset } from '../services/Presets';
import { applySectionProperties, type SectionPropertyInput } from '../services/SectionProperties';
import type { ModelViewer } from '../viewer/ModelViewer';
import type { DialogService } from './DialogService';
import { assertImportFileSize, downloadText } from './FileDownloads';
import type { ToolPanel } from './ToolPanel';
import { createButton, createElement, formatNumber, localText, nextNumber, requestFields } from './UiHelpers';

export const PRESET_PANEL_ID = 'presets';

type PresetNotify = (kind: 'info' | 'success' | 'error' | 'cancel', message: string) => void;

export function presetKindLabel(kind: Preset['kind']): string {
  return kind === 'view' ? localText('ビュー', 'View') : localText('断面', 'Section');
}

export class PresetPanel {
  readonly repository: PresetRepository;
  private searchQuery = '';
  private lastDeleted: Preset | null = null;

  constructor(
    private readonly doc: FrameDocument,
    private readonly viewer: ModelViewer,
    private readonly dialog: DialogService,
    private readonly panel: ToolPanel,
    private readonly mutate: <T>(label: string, action: () => T) => T,
    private readonly notify: PresetNotify = () => undefined,
    repository: PresetRepository = new PresetRepository(),
  ) {
    this.repository = repository;
  }

  async saveSection(input: SectionPropertyInput, materialNumber?: number): Promise<void> {
    const answer = await requestFields(
      this.dialog,
      localText('断面テンプレートを保存', 'Save section preset'),
      [{ name: 'name', label: localText('名前', 'Name') }],
    );
    if (!answer) {
      this.notify('cancel', localText('断面テンプレートの保存を取り消しました。', 'Section preset not saved.'));
      return;
    }
    const material = this.doc.materials.find((item) => item.number === materialNumber);
    const properties = material
      ? {
          name: material.name,
          young: material.young,
          shear: material.shear,
          expansion: material.expansion,
          poisson: material.poisson,
          unitLoad: material.unitLoad,
        }
      : undefined;
    const name = answer.name.trim();
    this.repository.save({
      kind: 'section',
      version: 1,
      formulaVersion: 1,
      units: 'cm-kN',
      id: crypto.randomUUID(),
      name,
      input,
      material: properties,
    });
    this.notify('success', localText(`断面テンプレート「${name}」を保存しました。`, `Saved section preset “${name}”.`));
  }

  private currentViewSnapshot() {
    return {
      camera: this.viewer.getCameraState(),
      view: this.viewer.getViewMode(),
      layers: this.viewer.getLayerVisibility(),
      color: this.viewer.getMemberColorMode(),
      labels: this.viewer.getLabelDensity(),
    };
  }

  private async applyPreset(preset: Preset): Promise<void> {
    if (preset.kind === 'view') {
      this.viewer.setViewMode(preset.view, false);
      this.viewer.restoreCameraState(preset.camera);
      this.viewer.setLayerVisibility(preset.layers);
      this.viewer.setMemberColorMode(preset.color);
      this.viewer.setLabelDensity(preset.labels);
      this.notify(
        'success',
        localText(
          `ビュー「${preset.name}」を適用しました（視点・投影・表示レイヤー・色分け: ${preset.color}・ラベル密度: ${preset.labels.mode}）`,
          `Applied view “${preset.name}” (camera, projection, layers, colors: ${preset.color}, labels: ${preset.labels.mode})`,
        ),
      );
      return;
    }
    if (!this.doc.sections.length)
      throw new Error(localText('先に適用先の断面を作成してください。', 'Create a target section first.'));
    const revision = this.doc.revision;
    const answer = await requestFields(this.dialog, localText('適用先断面', 'Target section'), [
      {
        name: 'section',
        label: localText('断面', 'Section'),
        type: 'select',
        options: this.doc.sections.map((section) => ({
          value: String(section.number),
          label: `${section.number}: ${section.comment}`,
        })),
      },
    ]);
    if (!answer) {
      this.notify('cancel', localText('テンプレートの適用を取り消しました。', 'Preset application cancelled.'));
      return;
    }
    if (revision !== this.doc.revision) {
      this.notify('cancel', localText('モデルが変更されたため適用を中止しました。', 'Application aborted because the model changed.'));
      return;
    }
    const result = this.mutate('Apply section preset', () => {
      const section = this.doc.findSectionByNumber(Number(answer.section));
      if (!section) throw new Error(localText('断面が存在しません。', 'Section no longer exists.'));
      const properties = applySectionProperties(section, preset.input);
      let materialNumber: number | null = null;
      if (preset.material) {
        let material = this.doc.materials.find((item) =>
          Object.entries(preset.material!).every(([key, value]) => Reflect.get(item, key) === value),
        );
        if (!material) {
          material = Object.assign(new Material(), preset.material, {
            number: nextNumber(this.doc.materials),
          });
          this.doc.materials.push(material);
        }
        section.materialNumber = material.number;
        materialNumber = material.number;
      }
      return { section, properties, materialNumber };
    });
    this.notify(
      'success',
      localText(
        `断面テンプレート「${preset.name}」を断面 ${result.section.number} へ適用: A=${formatNumber(result.properties.area)} cm², J=${formatNumber(result.properties.torsionConstant)} cm⁴, Iy=${formatNumber(result.properties.inertiaY)} cm⁴, Iz=${formatNumber(result.properties.inertiaZ)} cm⁴${result.materialNumber !== null ? `、材料 ${result.materialNumber}` : ''}`,
        `Applied section preset “${preset.name}” to section ${result.section.number}: A=${formatNumber(result.properties.area)} cm², J=${formatNumber(result.properties.torsionConstant)} cm⁴, Iy=${formatNumber(result.properties.inertiaY)} cm⁴, Iz=${formatNumber(result.properties.inertiaZ)} cm⁴${result.materialNumber !== null ? `, material ${result.materialNumber}` : ''}`,
      ),
    );
  }

  private async rename(preset: Preset): Promise<void> {
    const answer = await requestFields(this.dialog, localText(`名前を変更: ${preset.name}`, `Rename: ${preset.name}`), [
      { name: 'name', label: localText('新しい名前', 'New name'), value: preset.name },
    ]);
    if (!answer) return;
    const name = answer.name.trim();
    if (!name || name === preset.name) return;
    this.repository.save({ ...preset, name });
    this.notify('success', localText(`「${preset.name}」を「${name}」に変更しました。`, `Renamed “${preset.name}” to “${name}”.`));
    this.show();
  }

  private duplicate(preset: Preset): void {
    const items = this.repository.list();
    let name = `${preset.name} Copy`;
    let suffix = 2;
    while (items.some((item) => item.kind === preset.kind && item.name === name)) name = `${preset.name} Copy ${suffix++}`;
    this.repository.save({ ...preset, id: crypto.randomUUID(), name });
    this.notify('success', localText(`「${preset.name}」を複製しました → 「${name}」`, `Duplicated “${preset.name}” → “${name}”`));
    this.show();
  }

  private async overwrite(preset: Preset): Promise<void> {
    if (preset.kind !== 'view') {
      this.notify('info', localText('断面テンプレートは断面計算パネルから保存し直してください。', 'Re-save section presets from the section calculator.'));
      return;
    }
    const confirmed = await this.dialog.confirm({
      title: localText(`上書き: ${preset.name}`, `Overwrite: ${preset.name}`),
      body: localText('現在のビュー設定でこのプリセットを上書きします。', 'Overwrite this preset with the current view settings.'),
      confirmLabel: localText('上書き', 'Overwrite'),
      destructive: true,
    });
    if (!confirmed) return;
    this.repository.save({ ...preset, ...this.currentViewSnapshot() });
    this.notify('success', localText(`ビュー「${preset.name}」を現在の表示で上書きしました。`, `Overwrote view “${preset.name}” with the current display.`));
    this.show();
  }

  private remove(preset: Preset): void {
    this.repository.remove(preset.id);
    this.lastDeleted = preset;
    this.notify('success', localText(`「${preset.name}」を削除しました（元に戻せます）。`, `Deleted “${preset.name}” (undo available).`));
    this.show();
  }

  private undoDelete(): void {
    const preset = this.lastDeleted;
    if (!preset) return;
    this.repository.save(preset);
    this.lastDeleted = null;
    this.notify('success', localText(`「${preset.name}」の削除を元に戻しました。`, `Restored “${preset.name}”.`));
    this.show();
  }

  show(): void {
    const content = createElement('div', 'panel-form');
    content.append(
      createButton(localText('現在のビューを保存', 'Save current view'), async () => {
        const answer = await requestFields(this.dialog, localText('ビューを保存', 'Save view'), [
          { name: 'name', label: localText('名前', 'Name') },
        ]);
        if (!answer) return;
        const name = answer.name.trim();
        this.repository.save({ kind: 'view', id: crypto.randomUUID(), name, version: 1, ...this.currentViewSnapshot() });
        this.notify('success', localText(`ビュー「${name}」を保存しました。`, `Saved view “${name}”.`));
        this.show();
      }),
      createButton(localText('テンプレートJSONを読み込む', 'Import preset JSON'), () => {
        const input = createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async () => {
          try {
            const file = input.files?.[0];
            if (!file) return;
            assertImportFileSize(file);
            const preset = validatePreset(JSON.parse(await file.text()));
            this.repository.save(preset);
            this.notify('success', localText(`テンプレート「${preset.name}」を読み込みました。`, `Imported preset “${preset.name}”.`));
            this.show();
          } catch (error) {
            content.append(createElement('p', 'diagnostic-item error', String(error)));
          }
        });
        input.click();
      }),
    );
    const search = createElement('input');
    search.type = 'search';
    search.id = 'preset-search';
    search.value = this.searchQuery;
    search.placeholder = localText('名前・種別で検索', 'Search by name or kind');
    search.setAttribute('aria-label', localText('テンプレートを検索', 'Search presets'));
    search.addEventListener('input', () => {
      this.searchQuery = search.value;
      renderList();
    });
    content.append(search);
    if (this.lastDeleted) {
      const deleted = this.lastDeleted;
      content.append(
        createButton(localText(`削除を元に戻す: ${deleted.name}`, `Undo delete: ${deleted.name}`), () => this.undoDelete(), 'panel-action secondary'),
      );
    }
    content.append(
      createElement(
        'p',
        undefined,
        localText(
          '断面テンプレートは断面計算パネルから保存できます。寸法はcmです。',
          'Save section presets from the section calculator. Dimensions are in cm.',
        ),
      ),
    );
    const list = createElement('div', 'diagnostic-list');
    list.id = 'preset-list';
    const renderList = (): void => {
      list.replaceChildren();
      const query = this.searchQuery.trim().toLowerCase();
      const presets = this.repository
        .list()
        .filter((preset) => !query || preset.name.toLowerCase().includes(query) || presetKindLabel(preset.kind).toLowerCase().includes(query) || preset.kind.includes(query));
      if (!presets.length) list.append(createElement('p', undefined, localText('該当するテンプレートはありません。', 'No matching presets.')));
      for (const preset of presets) {
        const row = createElement('div', 'diagnostic-item info');
        row.dataset.presetId = preset.id;
        row.append(createElement('p', undefined, `${presetKindLabel(preset.kind)}: ${preset.name}`));
        const actions = createElement('div', 'panel-inline-actions');
        const named = (ja: string, en: string): string => localText(`${ja}: ${preset.name}`, `${en}: ${preset.name}`);
        actions.append(
          createButton(named('適用', 'Apply'), () => this.applyPreset(preset)),
          createButton(named('名前変更', 'Rename'), () => this.rename(preset), 'toolbar-btn secondary'),
          createButton(named('上書き', 'Overwrite'), () => this.overwrite(preset), 'toolbar-btn secondary'),
          createButton(named('複製', 'Duplicate'), () => this.duplicate(preset), 'toolbar-btn secondary'),
          createButton(named('JSON', 'JSON'), () =>
            downloadText(JSON.stringify(preset, null, 2), `preset-${preset.name}.json`, 'application/json'),
            'toolbar-btn secondary',
          ),
          createButton(named('削除', 'Delete'), () => this.remove(preset), 'toolbar-btn toolbar-btn-danger'),
        );
        row.append(actions);
        list.append(row);
      }
    };
    renderList();
    content.append(list);
    this.panel.open(localText('テンプレートとビュー', 'Presets and views'), content, { id: PRESET_PANEL_ID });
  }
}
