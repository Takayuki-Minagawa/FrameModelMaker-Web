import type { Material } from '../models/Material';
import type {
  LabelDensityOptions,
  MemberColorMode,
  ViewerCameraState,
  ViewerLayers,
  ViewMode,
} from '../viewer/ViewerTypes';
import { calculateSectionProperties, type SectionPropertyInput } from './SectionProperties';
import { settings, type SettingsRepository } from './SettingsRepository';

export interface SectionPreset {
  kind: 'section';
  id: string;
  name: string;
  version: 1;
  units: 'cm-kN';
  formulaVersion: 1;
  input: SectionPropertyInput;
  material?: Pick<Material, 'name' | 'young' | 'shear' | 'expansion' | 'poisson' | 'unitLoad'>;
}
export interface ViewPreset {
  kind: 'view';
  id: string;
  name: string;
  version: 1;
  camera: ViewerCameraState;
  view: ViewMode;
  layers: ViewerLayers;
  color: MemberColorMode;
  labels: LabelDensityOptions;
}
export type Preset = SectionPreset | ViewPreset;

export function validatePreset(value: unknown): Preset {
  if (!value || typeof value !== 'object') throw new Error('Invalid preset.');
  const preset = value as Preset;
  if (
    preset.version !== 1 ||
    typeof preset.id !== 'string' ||
    typeof preset.name !== 'string' ||
    !preset.name.trim()
  )
    throw new Error('Unsupported preset version or missing name.');
  if (preset.kind === 'section') {
    if (preset.units !== 'cm-kN' || preset.formulaVersion !== 1 || !preset.input)
      throw new Error('Unsupported section units or formula version.');
    calculateSectionProperties(preset.input);
    if (
      preset.material &&
      (typeof preset.material.name !== 'string' ||
        !['young', 'shear', 'expansion', 'poisson', 'unitLoad'].every((key) =>
          Number.isFinite(Reflect.get(preset.material!, key)),
        ))
    )
      throw new Error('Invalid material.');
  } else if (preset.kind === 'view') {
    const camera = preset.camera;
    if (
      !camera ||
      !['perspective', 'orthographic'].includes(camera.projection) ||
      ![camera.position, camera.target, camera.up].every(
        (vector) => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite),
      ) ||
      !Number.isFinite(camera.zoom) ||
      camera.zoom <= 0 ||
      (camera.orthographicHeight != null &&
        (!Number.isFinite(camera.orthographicHeight) || camera.orthographicHeight <= 0))
    )
      throw new Error('Invalid camera.');
    if (Math.hypot(...camera.up) === 0 || camera.position.every((n, i) => n === camera.target[i]))
      throw new Error('Degenerate camera.');
    if (!preset.view || !['3d', 'plan', 'elevation-x', 'elevation-y'].includes(preset.view.kind))
      throw new Error('Invalid view.');
    for (const key of ['offset', 'elevation']) {
      const value = Reflect.get(preset.view, key);
      if (value != null && !Number.isFinite(value)) throw new Error('Invalid drawing plane.');
    }
    if (
      !preset.layers ||
      !['grid', 'axes', 'nodes', 'members', 'walls', 'boundaries', 'loads', 'results', 'labels'].every(
        (key) => typeof Reflect.get(preset.layers, key) === 'boolean',
      )
    )
      throw new Error('Invalid layers.');
    if (!['default', 'section', 'material', 'element-type'].includes(preset.color))
      throw new Error('Invalid member color.');
    if (
      !preset.labels ||
      !['all', 'auto', 'selected-only'].includes(preset.labels.mode) ||
      !Number.isFinite(preset.labels.maxLabels) ||
      preset.labels.maxLabels < 0 ||
      !Number.isFinite(preset.labels.minSpacingPx) ||
      preset.labels.minSpacingPx < 0
    )
      throw new Error('Invalid labels.');
  } else throw new Error('Unknown preset kind.');
  return structuredClone(preset);
}

export class PresetRepository {
  constructor(private readonly storage: SettingsRepository = settings) {}
  list(): Preset[] {
    const raw = this.storage.getItem('framemodelmaker.presets.v1');
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) throw new Error('Invalid preset library.');
    return values.map(validatePreset);
  }
  save(value: Preset): void {
    const preset = validatePreset(value);
    const items = this.list();
    if (items.some((item) => item.id !== preset.id && item.kind === preset.kind && item.name === preset.name))
      throw new Error('A preset with this name exists. Use another name or delete it first.');
    this.storage.setItem(
      'framemodelmaker.presets.v1',
      JSON.stringify([...items.filter((item) => item.id !== preset.id), preset]),
    );
  }
  remove(id: string): void {
    this.storage.setItem(
      'framemodelmaker.presets.v1',
      JSON.stringify(this.list().filter((item) => item.id !== id)),
    );
  }
}
