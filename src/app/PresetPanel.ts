import type { FrameDocument } from '../models/FrameDocument';
import { Material } from '../models/Material';
import { PresetRepository, validatePreset } from '../services/Presets';
import { applySectionProperties, type SectionPropertyInput } from '../services/SectionProperties';
import type { ModelViewer } from '../viewer/ModelViewer';
import type { DialogService } from './DialogService';
import { assertImportFileSize, downloadText } from './FileDownloads';
import type { ToolPanel } from './ToolPanel';
import { createButton, createElement, localText, nextNumber, requestFields } from './UiHelpers';

export class PresetPanel {
  private readonly repository = new PresetRepository();
  constructor(
    private readonly doc: FrameDocument,
    private readonly viewer: ModelViewer,
    private readonly dialog: DialogService,
    private readonly panel: ToolPanel,
    private readonly mutate: (label: string, action: () => void) => void,
  ) {}

  async saveSection(input: SectionPropertyInput, materialNumber?: number): Promise<void> {
    const answer = await requestFields(
      this.dialog,
      localText('断面テンプレートを保存', 'Save section preset'),
      [{ name: 'name', label: localText('名前', 'Name') }],
    );
    if (!answer) return;
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
    this.repository.save({
      kind: 'section',
      version: 1,
      formulaVersion: 1,
      units: 'cm-kN',
      id: crypto.randomUUID(),
      name: answer.name.trim(),
      input,
      material: properties,
    });
  }

  show(): void {
    const content = createElement('div', 'panel-form');
    content.append(
      createButton(localText('現在のビューを保存', 'Save current view'), async () => {
        const answer = await requestFields(this.dialog, localText('ビューを保存', 'Save view'), [
          { name: 'name', label: localText('名前', 'Name') },
        ]);
        if (!answer) return;
        this.repository.save({
          kind: 'view',
          id: crypto.randomUUID(),
          name: answer.name.trim(),
          version: 1,
          camera: this.viewer.getCameraState(),
          view: this.viewer.getViewMode(),
          layers: this.viewer.getLayerVisibility(),
          color: this.viewer.getMemberColorMode(),
          labels: this.viewer.getLabelDensity(),
        });
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
            this.repository.save(validatePreset(JSON.parse(await file.text())));
            this.show();
          } catch (error) {
            content.append(createElement('p', 'diagnostic-item error', String(error)));
          }
        });
        input.click();
      }),
    );
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
    for (const preset of this.repository.list()) {
      const row = createElement('div', 'diagnostic-item info');
      row.append(createElement('p', undefined, `${preset.kind}: ${preset.name}`));
      row.append(
        createButton(localText('適用', 'Apply'), async () => {
          if (preset.kind === 'view') {
            this.viewer.setViewMode(preset.view, false);
            this.viewer.restoreCameraState(preset.camera);
            this.viewer.setLayerVisibility(preset.layers);
            this.viewer.setMemberColorMode(preset.color);
            this.viewer.setLabelDensity(preset.labels);
          } else {
            if (!this.doc.sections.length) throw new Error('Create a target section first.');
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
            if (!answer || revision !== this.doc.revision) return;
            this.mutate('Apply section preset', () => {
              const section = this.doc.findSectionByNumber(Number(answer.section));
              if (!section) throw new Error('Section no longer exists.');
              applySectionProperties(section, preset.input);
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
              }
            });
          }
        }),
        createButton('JSON', () =>
          downloadText(JSON.stringify(preset, null, 2), 'preset.json', 'application/json'),
        ),
        createButton(
          localText('削除', 'Delete'),
          () => {
            this.repository.remove(preset.id);
            this.show();
          },
          'toolbar-btn toolbar-btn-danger',
        ),
      );
      content.append(row);
    }
    this.panel.open(localText('テンプレートとビュー', 'Presets and views'), content);
  }
}
