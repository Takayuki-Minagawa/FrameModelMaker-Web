import { createGridColumns } from '../app/GridColumns';
import { createTabProviders, type TabId, type TabProvider } from '../app/TabProviders';
import { parseDelimited } from '../io/DelimitedText';
import { parseFrameJson, writeFrameJson } from '../io/FrameJson';
import { FrameDocument } from '../models/FrameDocument';
import { coerceDataGridValue, normalizeOption, type DataGridChange } from '../ui/DataGridTypes';
import { validateFrameDocument } from '../validation/FrameValidator';
import { MM_N_TO_CM_KN } from './Units';

export interface BulkEditPreview {
  document: FrameDocument;
  changes: string[];
  errors: string[];
}
export type InputUnits = 'cm-kN' | 'mm-N';

function unitFactor(tab: TabId, key: string, units: InputUnits): number {
  if (units === 'cm-kN') return 1;
  if (tab === 'nodes') {
    if (['x', 'y', 'z'].includes(key)) return MM_N_TO_CM_KN.length;
    if (key === 'area') return MM_N_TO_CM_KN.area;
    if (['longWeight', 'forceWeight', 'addForceWeight'].includes(key))
      throw new Error(`${key}: use cm-kN until its weight convention is specified.`);
  }
  if (tab === 'materials') {
    if (['young', 'shear'].includes(key)) return MM_N_TO_CM_KN.stress;
    if (key === 'unitLoad') throw new Error('unitLoad: use cm-kN until the density convention is specified.');
  }
  if (tab === 'sections') {
    if (key === 'p1_A') return MM_N_TO_CM_KN.area;
    if (['p2_Ix', 'torsionConstant', 'p3_Iy', 'p4_Iz'].includes(key)) return MM_N_TO_CM_KN.inertia;
  }
  if (tab === 'nodeloads') {
    if (['p1', 'p2', 'p3'].includes(key)) return MM_N_TO_CM_KN.force;
    if (['m1', 'm2', 'm3'].includes(key)) return MM_N_TO_CM_KN.moment;
  }
  if (tab === 'springs' && key === 'kTheta') return MM_N_TO_CM_KN.moment;
  if (
    ['memberloads', 'cmqloads', 'walls', 'members'].includes(tab) &&
    !/Number$|^number$|Spring$|^method$/.test(key)
  ) {
    throw new Error(`${tab}.${key}: use cm-kN; this field has no general unit conversion.`);
  }
  return 1;
}

export function prepareCsvEdit(
  source: FrameDocument,
  tab: TabId,
  csv: string,
  mapping: readonly string[],
  mode: 'add' | 'update',
  units: InputUnits,
): BulkEditPreview {
  const document = new FrameDocument();
  parseFrameJson(writeFrameJson(source), document, { mode: 'strict' });
  const provider = createTabProviders(document).tabProviders[tab] as unknown as TabProvider<
    Record<string, unknown>
  >;
  const columns = createGridColumns(document)<Record<string, unknown>>(tab);
  const rows = parseDelimited(csv);
  const errors: string[] = [];
  const changes: string[] = [];
  const identity = ['nodeloads', 'boundaries'].includes(tab)
    ? 'nodeNumber'
    : ['memberloads', 'cmqloads'].includes(tab)
      ? 'memberNumber'
      : 'number';
  if (!mapping.includes(identity)) return { document, changes, errors: [`Map the ${identity} column.`] };
  const mapped = mapping.filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    return { document, changes, errors: ['A target column may only be mapped once.'] };
  const seen = new Set<number>();
  for (const [index, values] of rows.slice(1).entries()) {
    if (values.every((value) => value === '')) continue;
    const number = Number(values[mapping.indexOf(identity)]);
    if (!Number.isInteger(number) || number <= 0 || seen.has(number)) {
      errors.push(`Row ${index + 2}: invalid or duplicate ${identity}.`);
      continue;
    }
    seen.add(number);
    let row = provider.rows().find((item) => item[identity] === number);
    if (mode === 'add') {
      if (row) {
        errors.push(`Row ${index + 2}: ${number} already exists.`);
        continue;
      }
      row = provider.add?.() ?? undefined;
      if (!row) {
        errors.push(`Row ${index + 2}: this tab cannot add a row with the current model.`);
        continue;
      }
      Reflect.set(row, identity, number);
    } else if (!row) {
      errors.push(`Row ${index + 2}: ${number} does not exist.`);
      continue;
    }
    const cellChanges: DataGridChange<Record<string, unknown>>['changes'][number][] = [];
    for (const [columnIndex, key] of mapping.entries()) {
      if (!key || key === identity) continue;
      const raw = values[columnIndex];
      if (raw == null || raw === '') continue;
      const column = columns.find((item) => item.key === key);
      if (!column || column.readOnly) {
        errors.push(`Row ${index + 2}: ${key} is not editable.`);
        continue;
      }
      const rowIndex = provider.rows().indexOf(row);
      const context = { row, rowIndex, column, data: provider.rows() };
      const sourceOptions =
        column.getOptions?.(context) ?? column.referenceOptions ?? column.enumOptions ?? column.options ?? [];
      const options = (typeof sourceOptions === 'function' ? sourceOptions(context) : sourceOptions).map(
        normalizeOption,
      );
      const converted = coerceDataGridValue(column.type, raw, options, column.allowCustomValue);
      if (converted.error) {
        errors.push(`Row ${index + 2}, ${key}: ${converted.error}`);
        continue;
      }
      let value = converted.value;
      try {
        if (typeof value === 'number') value *= unitFactor(tab, key, units);
      } catch (error) {
        errors.push(String(error));
        continue;
      }
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) ||
          (column.min != null && value < column.min) ||
          (column.max != null && value > column.max))
      ) {
        errors.push(`Row ${index + 2}, ${key}: out of range.`);
        continue;
      }
      const previousValue = row[key];
      row[key] = value;
      cellChanges.push({ row, rowIndex, columnKey: key, previousValue, value });
      changes.push(`${identity} ${number} / ${key}: ${String(previousValue)} → ${String(value)}`);
    }
    if (cellChanges.length)
      provider.applyChanges?.({ source: 'paste', ...cellChanges[0], changes: cellChanges });
    if (mode === 'add') changes.push(`Add ${identity} ${number}`);
  }
  document.synchronizeBoundaryConditions();
  errors.push(
    ...validateFrameDocument(document)
      .diagnostics.filter((item) => item.severity === 'error')
      .map((item) => `[${item.code}] ${item.message}`),
  );
  return { document, changes, errors };
}
