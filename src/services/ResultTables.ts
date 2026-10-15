import type {
  AnalysisResultFrame,
  AnalysisResultSet,
  MemberForceStation,
  SectionForceComponent,
} from '../viewer/ViewerTypes';

/** Fixed units of the canonical result JSON v1 (see docs/RELEASE_1_2.md). */
export const RESULT_UNITS = {
  displacement: 'cm',
  rotation: 'rad',
  force: 'kN',
  moment: 'kN·cm',
  time: 's',
} as const;

export const SECTION_FORCE_COMPONENTS: SectionForceComponent[] = [
  'axial',
  'shearY',
  'shearZ',
  'torsion',
  'momentY',
  'momentZ',
];

export const SECTION_FORCE_LABELS: Record<SectionForceComponent, string> = {
  axial: 'N',
  shearY: 'Qy',
  shearZ: 'Qz',
  torsion: 'Mx',
  momentY: 'My',
  momentZ: 'Mz',
};

export function sectionForceUnit(component: SectionForceComponent): string {
  return component === 'axial' || component === 'shearY' || component === 'shearZ'
    ? RESULT_UNITS.force
    : RESULT_UNITS.moment;
}

export interface NodeResultRow {
  nodeNumber: number;
  displacement: [number, number, number];
  rotation: [number, number, number];
  reaction?: [number, number, number];
  reactionMoment?: [number, number, number];
}

export interface MemberResultRow {
  memberNumber: number;
  stations: MemberForceStation[];
}

export function nodeResultRow(frame: AnalysisResultFrame, nodeNumber: number): NodeResultRow | null {
  const node = frame.nodes.find((item) => item.nodeNumber === nodeNumber);
  if (!node) return null;
  return {
    nodeNumber,
    displacement: node.displacement ?? [0, 0, 0],
    rotation: node.rotation ?? [0, 0, 0],
    reaction: node.reaction,
    reactionMoment: node.reactionMoment,
  };
}

export function memberResultRow(frame: AnalysisResultFrame, memberNumber: number): MemberResultRow | null {
  const member = frame.members?.find((item) => item.memberNumber === memberNumber);
  if (!member) return null;
  return { memberNumber, stations: [...(member.stations ?? [])].sort((a, b) => a.position - b.position) };
}

export interface ExtremeLocation {
  value: number;
  nodeNumber?: number;
  memberNumber?: number;
  /** Normalized member coordinate 0 (I end) … 1 (J end). */
  position?: number;
}

export interface ExtremeEntry {
  key: string;
  label: string;
  unit: string;
  max: ExtremeLocation | null;
  min: ExtremeLocation | null;
}

function track(entry: ExtremeEntry, location: ExtremeLocation): void {
  if (!Number.isFinite(location.value)) return;
  if (!entry.max || location.value > entry.max.value) entry.max = location;
  if (!entry.min || location.value < entry.min.value) entry.min = location;
}

/** Maximum and minimum of every component in one frame, with the location of each extreme. */
export function frameExtremes(frame: AnalysisResultFrame): ExtremeEntry[] {
  const axes = ['x', 'y', 'z'] as const;
  const entries: ExtremeEntry[] = [];
  const nodeEntries = (
    prefix: string,
    labels: readonly string[],
    unit: string,
    pick: (node: AnalysisResultFrame['nodes'][number]) => [number, number, number] | undefined,
  ): void => {
    axes.forEach((axis, index) => {
      const entry: ExtremeEntry = { key: `${prefix}${axis}`, label: labels[index], unit, max: null, min: null };
      for (const node of frame.nodes) {
        const vector = pick(node);
        if (vector) track(entry, { value: vector[index], nodeNumber: node.nodeNumber });
      }
      entries.push(entry);
    });
  };
  nodeEntries('d', ['dx', 'dy', 'dz'], RESULT_UNITS.displacement, (node) => node.displacement);
  nodeEntries('r', ['rx', 'ry', 'rz'], RESULT_UNITS.rotation, (node) => node.rotation);
  nodeEntries('R', ['Rx', 'Ry', 'Rz'], RESULT_UNITS.force, (node) => node.reaction);
  nodeEntries('RM', ['RMx', 'RMy', 'RMz'], RESULT_UNITS.moment, (node) => node.reactionMoment);
  for (const component of SECTION_FORCE_COMPONENTS) {
    const entry: ExtremeEntry = {
      key: component,
      label: SECTION_FORCE_LABELS[component],
      unit: sectionForceUnit(component),
      max: null,
      min: null,
    };
    for (const member of frame.members ?? []) {
      for (const station of member.stations ?? []) {
        const value = station[component];
        if (value !== undefined)
          track(entry, { value, memberNumber: member.memberNumber, position: station.position });
      }
    }
    entries.push(entry);
  }
  return entries.filter((entry) => entry.max !== null);
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const RESULT_CSV_COLUMNS = [
  'kind',
  'number',
  'position',
  'dx_cm',
  'dy_cm',
  'dz_cm',
  'rx_rad',
  'ry_rad',
  'rz_rad',
  'Rx_kN',
  'Ry_kN',
  'Rz_kN',
  'RMx_kNcm',
  'RMy_kNcm',
  'RMz_kNcm',
  'N_kN',
  'Qy_kN',
  'Qz_kN',
  'Mx_kNcm',
  'My_kNcm',
  'Mz_kNcm',
] as const;

/**
 * Serializes one frame (nodes then member stations) as CSV with unit-suffixed
 * column names. Node reactions are global XYZ; member forces are local xyz
 * acting on the positive local-x face (same convention as the viewer).
 */
export function resultFrameToCsv(results: AnalysisResultSet, frameIndex: number): string {
  const frame = results.frames[frameIndex];
  if (!frame) throw new Error(`Frame ${frameIndex} does not exist.`);
  const lines: string[] = [
    `# ${results.name ?? ''}; frame ${frameIndex + 1}/${results.frames.length}; time ${frame.time ?? 0} ${RESULT_UNITS.time}; nodes global-xyz; members local-xyz`,
    RESULT_CSV_COLUMNS.join(','),
  ];
  const blank = (count: number) => Array.from({ length: count }, () => '');
  for (const node of frame.nodes) {
    const d = node.displacement ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0];
    const reaction = node.reaction ?? blank(3);
    const moment = node.reactionMoment ?? blank(3);
    lines.push(['node', node.nodeNumber, '', ...d, ...r, ...reaction, ...moment, ...blank(6)].map(csvCell).join(','));
  }
  for (const member of frame.members ?? []) {
    for (const station of member.stations ?? []) {
      lines.push(
        [
          'member',
          member.memberNumber,
          station.position,
          ...blank(12),
          ...SECTION_FORCE_COMPONENTS.map((component) => station[component] ?? ''),
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return `﻿${lines.join('\r\n')}`;
}

/** Finds the frame whose time is closest to the requested one. */
export function frameIndexForTime(results: AnalysisResultSet, time: number): number {
  let best = 0;
  let bestDistance = Infinity;
  results.frames.forEach((frame, index) => {
    const distance = Math.abs((frame.time ?? index) - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
