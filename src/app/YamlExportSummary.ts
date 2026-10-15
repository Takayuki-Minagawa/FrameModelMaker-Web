import type { FrameDocument } from '../models/FrameDocument';
import { createElement, localText } from './UiHelpers';

export interface YamlExportSummaryRow {
  key: string;
  label: string;
  count: number;
  /** Output unit in the analysis YAML, or '-' when not applicable. */
  unit: string;
  exported: boolean;
  note?: string;
}

/**
 * Lists what the analysis YAML export carries and what it omits (R19). The
 * current analysis YAML schema has no representation for walls, custom
 * member-end springs or FrameModelMaker load values, so those are reported as
 * omitted with their counts instead of being silently dropped.
 */
export function buildYamlExportSummary(doc: FrameDocument): YamlExportSummaryRow[] {
  const nodeLoadCount = doc.nodes.reduce(
    (sum, node) => sum + node.loads.filter((load) => !load.isZero).length,
    0,
  );
  const memberLoadCount = doc.members.reduce(
    (sum, member) => sum + member.memberLoads.filter((load) => !load.isZero).length,
    0,
  );
  const cmqCount = doc.members.reduce(
    (sum, member) => sum + member.cmqLoads.filter((load) => !load.isZero).length,
    0,
  );
  const customSpringReferences = doc.members.filter((member) =>
    [member.ixSpring, member.iySpring, member.izSpring, member.jxSpring, member.jySpring, member.jzSpring].some(
      (number) => number >= 3,
    ),
  ).length;
  const metadata = doc.analysisMetadata;
  const rows: YamlExportSummaryRow[] = [
    { key: 'nodes', label: localText('節点', 'Nodes'), count: doc.nodes.length, unit: 'mm', exported: true },
    { key: 'boundaries', label: localText('支持（境界条件）', 'Supports (boundaries)'), count: doc.boundaries.length, unit: '-', exported: true },
    { key: 'materials', label: localText('材料', 'Materials'), count: doc.materials.length, unit: 'N/mm²', exported: true },
    { key: 'sections', label: localText('断面', 'Sections'), count: doc.sections.length, unit: 'mm², mm⁴', exported: true },
    { key: 'members', label: localText('部材（線材）', 'Members (line elements)'), count: doc.members.length, unit: '-', exported: true },
    { key: 'loadCases', label: localText('荷重ケース', 'Load cases'), count: doc.loadCases.length, unit: '-', exported: true },
    { key: 'loadCombinations', label: localText('荷重組合せ', 'Load combinations'), count: doc.loadCombinations.length, unit: '-', exported: true },
    {
      key: 'walls',
      label: localText('壁', 'Walls'),
      count: doc.walls.length,
      unit: '-',
      exported: doc.walls.length === 0,
      note: doc.walls.length ? localText('解析YAMLスキーマに壁要素がないため出力されません', 'Not exported: the analysis YAML schema has no wall element') : undefined,
    },
    {
      key: 'springs',
      label: localText('カスタム部材端バネ', 'Custom member-end springs'),
      count: doc.springs.length,
      unit: '-',
      exported: doc.springs.length === 0,
      note: doc.springs.length
        ? localText(`${customSpringReferences}部材が参照。スキーマに端部バネがないため出力されません`, `Referenced by ${customSpringReferences} members; not exported (no end-spring in schema)`)
        : undefined,
    },
    {
      key: 'nodeLoads',
      label: localText('節点荷重（非零）', 'Node loads (non-zero)'),
      count: nodeLoadCount,
      unit: 'kN, kN·cm',
      exported: nodeLoadCount === 0,
      note: nodeLoadCount ? localText('荷重値はスキーマ非対応のため出力されません', 'Load values are not exported (unsupported by schema)') : undefined,
    },
    {
      key: 'memberLoads',
      label: localText('部材荷重（非零）', 'Member loads (non-zero)'),
      count: memberLoadCount,
      unit: '-',
      exported: memberLoadCount === 0,
      note: memberLoadCount ? localText('荷重値はスキーマ非対応のため出力されません', 'Load values are not exported (unsupported by schema)') : undefined,
    },
    {
      key: 'cmqLoads',
      label: localText('CMQ荷重（非零）', 'CMQ loads (non-zero)'),
      count: cmqCount,
      unit: 'kN, kN·cm',
      exported: cmqCount === 0,
      note: cmqCount ? localText('荷重値はスキーマ非対応のため出力されません', 'Load values are not exported (unsupported by schema)') : undefined,
    },
    {
      key: 'metadata',
      label: localText('解析メタデータ（制約・質量・リンク）', 'Analysis metadata (constraints, masses, links)'),
      count: metadata ? metadata.constraints.length + metadata.nodalMasses.length + metadata.linkElements.length : 0,
      unit: '-',
      exported: true,
    },
  ];
  return rows;
}

export function renderYamlExportSummary(doc: FrameDocument): HTMLElement {
  const rows = buildYamlExportSummary(doc);
  const container = createElement('div');
  container.id = 'yaml-export-summary';
  container.append(
    createElement(
      'p',
      undefined,
      localText(
        '出力単位: 長さ mm / 力 N / 応力 N/mm² / 面積 mm² / 断面二次モーメント mm⁴（内部の cm / kN から換算）。',
        'Export units: length mm / force N / stress N/mm² / area mm² / second moment mm⁴ (converted from internal cm / kN).',
      ),
    ),
  );
  const table = createElement('table', 'panel-table');
  const head = table.createTHead().insertRow();
  for (const header of [localText('項目', 'Item'), localText('件数', 'Count'), localText('単位', 'Unit'), localText('出力', 'Export')]) {
    const cell = document.createElement('th');
    cell.textContent = header;
    head.appendChild(cell);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    tr.dataset.key = row.key;
    tr.dataset.exported = String(row.exported);
    tr.insertCell().textContent = row.label;
    tr.insertCell().textContent = String(row.count);
    tr.insertCell().textContent = row.unit;
    const status = tr.insertCell();
    status.textContent = row.exported
      ? localText('出力', 'Exported')
      : `${localText('欠落', 'Omitted')}${row.note ? `: ${row.note}` : ''}`;
    if (!row.exported) tr.classList.add('omitted');
  }
  container.append(table);
  const omitted = rows.filter((row) => !row.exported);
  container.append(
    createElement(
      'p',
      omitted.length ? 'diagnostic-item warn' : 'diagnostic-item info',
      omitted.length
        ? localText(
            `欠落項目 ${omitted.length}件: ${omitted.map((row) => `${row.label} ${row.count}件`).join('、')}。解析連携に必要な場合は別途受け渡してください。`,
            `${omitted.length} omitted item(s): ${omitted.map((row) => `${row.label} ${row.count}`).join(', ')}. Hand these over separately if the analysis needs them.`,
          )
        : localText('欠落項目はありません。', 'Nothing is omitted.'),
    ),
  );
  return container;
}
