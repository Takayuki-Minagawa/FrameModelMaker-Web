import gridColumns from '../data/gridColumns';
import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import type { Member } from '../models/Member';
import { SectionShape, SectionType } from '../models/Section';
import type { ColumnDef, DataGridOptionLike } from '../ui/DataGrid';
import { localText } from './UiHelpers';
type GridColumnType = 'number' | 'text' | 'int';

interface GridColumnConfig {
  key: string;
  header?: string;
  width?: string;
  type?: GridColumnType;
  readOnly?: boolean;
}

const GRID_COLUMNS = gridColumns as Record<string, GridColumnConfig[]>;
export function createGridColumns(doc: FrameDocument) {
  function getColumnsFromConfig<T extends object>(tabId: string): ColumnDef<T>[] {
    return (GRID_COLUMNS[tabId] ?? []).map((configuration) => {
      const column: ColumnDef<T> = {
        key: configuration.key as keyof T & string,
        header: columnHeader(tabId, configuration.key),
        width: configuration.width,
        type: configuration.type,
        readOnly: configuration.readOnly,
        searchable: true,
      };
      configureTypedColumn(tabId, column);
      return column;
    });
  }

  function columnHeader(tabId: string, key: string): string {
    const special: Record<string, string> = {
      nodeNumber: t('col.nodeNumber'),
      memberNumber: t('col.memberNumber'),
      x: t('col.xCoord'),
      y: t('col.yCoord'),
      z: t('col.zCoord'),
      temperature: t('col.temperature'),
      intensityGroup: t('col.intensityGroup'),
      longWeight: t('col.longWeight'),
      forceWeight: t('col.forceWeight'),
      addForceWeight: t('col.addForceWeight'),
      area: t('col.area'),
      deltaX: t('col.deltaX'),
      deltaY: t('col.deltaY'),
      deltaZ: t('col.deltaZ'),
      thetaX: t('col.thetaX'),
      thetaY: t('col.thetaY'),
      thetaZ: t('col.thetaZ'),
      young: t('col.young'),
      shear: t('col.shear'),
      expansion: t('col.expansion'),
      poisson: t('col.poisson'),
      unitLoad: t('col.unitLoad'),
      name: t('col.materialName'),
      materialNumber: t('col.material'),
      type: t('col.type'),
      shape: t('col.shape'),
      comment: t('col.comment'),
      method: t('col.method'),
      iNodeNumber: t('col.iNode'),
      jNodeNumber: t('col.jNode'),
      sectionNumber: t('col.section'),
      leftBottomNode: t('col.leftBottom'),
      rightBottomNode: t('col.rightBottom'),
      leftTopNode: t('col.leftTop'),
      rightTopNode: t('col.rightTop'),
      lengthMethod: t('col.lengthMethod'),
      direction: t('col.direction'),
      scale: t('col.scale'),
      loadCode: t('col.code'),
      p1_A: 'A',
      p2_Ix: 'Ix (legacy J)',
      torsionConstant: 'J',
      p3_Iy: 'Iy',
      p4_Iz: 'Iz',
      kTheta: 'Kθ',
    };
    if (key === 'number') {
      if (tabId === 'nodes') return t('col.nodeNumber');
      if (tabId === 'members') return t('col.memberNumber');
      if (tabId === 'walls') return t('col.wallNumber');
      return t('col.number');
    }
    if (['p1', 'p2', 'p3'].includes(key) && tabId === 'nodeloads') return t(`col.${key}kN`);
    return special[key] ?? key;
  }

  function option(value: string | number | boolean, label: string): DataGridOptionLike {
    return { value, label };
  }

  function configureTypedColumn<T extends object>(tabId: string, column: ColumnDef<T>): void {
    const key = column.key as string;
    const numberedTabs = new Set(['nodes', 'materials', 'sections', 'springs', 'members', 'walls']);
    if (key === 'number' && numberedTabs.has(tabId)) column.readOnly = true;

    const nodeReferenceKeys = new Set([
      'nodeNumber',
      'iNodeNumber',
      'jNodeNumber',
      'leftBottomNode',
      'rightBottomNode',
      'leftTopNode',
      'rightTopNode',
    ]);
    if (nodeReferenceKeys.has(key) && tabId !== 'nodeloads') {
      column.type = 'reference';
      column.referenceOptions = () => doc.nodes.map((node) => option(node.number, String(node.number)));
      column.required = true;
    }
    if (key === 'materialNumber') {
      column.type = 'reference';
      column.referenceOptions = () => [
        option(0, localText('0: 未指定', '0: None')),
        ...doc.materials.map((material) =>
          option(material.number, `${material.number}: ${material.name || '-'}`),
        ),
      ];
    }
    if (key === 'sectionNumber') {
      column.type = 'reference';
      column.referenceOptions = () =>
        doc.sections.map((section) => option(section.number, `${section.number}: ${section.comment || '-'}`));
    }
    if (/^[ij][xyz]Spring$/.test(key)) {
      column.type = 'reference';
      column.referenceOptions = () => [
        option(0, localText('0: 連続', '0: Continuous')),
        option(1, localText('1: 剛', '1: Rigid')),
        option(2, localText('2: ピン', '2: Pin')),
        ...doc.springs.map((spring) => option(spring.number, `${spring.number}: Kθ=${spring.kTheta}`)),
      ];
    }
    if (
      tabId === 'boundaries' &&
      ['deltaX', 'deltaY', 'deltaZ', 'thetaX', 'thetaY', 'thetaZ'].includes(key)
    ) {
      column.type = 'enum';
      column.enumOptions = [option(0, localText('自由', 'Free')), option(1, localText('拘束', 'Fixed'))];
    }
    if (tabId === 'sections' && key === 'type') {
      column.type = 'enum';
      column.enumOptions = [
        option(SectionType.Horizontal, localText('水平', 'Horizontal')),
        option(SectionType.Vertical, localText('鉛直', 'Vertical')),
        option(SectionType.Diagonal, localText('斜材', 'Diagonal')),
        option(SectionType.Other, localText('その他', 'Other')),
        option(SectionType.Truss, localText('トラス', 'Truss')),
        option(SectionType.Wall, localText('壁', 'Wall')),
      ];
    }
    if (tabId === 'sections' && key === 'shape') {
      column.type = 'enum';
      column.enumOptions = [
        option(SectionShape.DirectInput, localText('直接入力', 'Direct')),
        option(SectionShape.Rectangle, localText('矩形', 'Rectangle')),
        option(SectionShape.Circle, localText('円形', 'Circle')),
        option(SectionShape.Steel, localText('鋼材', 'Steel')),
        option(SectionShape.Box, localText('箱形', 'Box')),
        option(SectionShape.I_Steel, 'I'),
        option(SectionShape.H_Steel, 'H'),
      ];
    }
    if (tabId === 'memberloads' && ['lengthMethod', 'type', 'direction'].includes(key)) {
      column.type = 'enum';
      column.enumOptions = [0, 1, 2, 3].map((value) => option(value, String(value)));
    }
    if (tabId === 'springs' && key === 'method') {
      column.type = 'enum';
      column.enumOptions = [option(0, '0'), option(1, '1')];
    }
    if (
      [
        'p1_A',
        'p2_Ix',
        'torsionConstant',
        'p3_Iy',
        'p4_Iz',
        'ky',
        'kz',
        'young',
        'shear',
        'unitLoad',
        'kTheta',
        'area',
      ].includes(key)
    ) {
      column.min = 0;
    }
    if (key === 'poisson') {
      column.min = -0.999;
      column.max = 0.499;
    }
    if (column.type === 'number' || column.type === 'int') {
      column.required = true;
      column.validate = (context) =>
        Number.isFinite(Number(context.value))
          ? null
          : localText('有限の数値を入力してください', 'Enter a finite number');
    }
    if (tabId === 'members' && (key === 'iNodeNumber' || key === 'jNodeNumber')) {
      column.validate = (context) => {
        const row = context.row as unknown as Member;
        const other = key === 'iNodeNumber' ? row.jNodeNumber : row.iNodeNumber;
        return Number(context.value) === other
          ? localText('I端とJ端には異なる節点が必要です', 'I and J ends must use different nodes')
          : null;
      };
    }
  }

  return getColumnsFromConfig;
}
