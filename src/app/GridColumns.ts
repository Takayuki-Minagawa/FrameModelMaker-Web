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
      column.description = columnDescription(tabId, configuration.key);
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

  /**
   * Column meaning, unit and sign convention for header tooltips (R12). Codes
   * whose semantics are defined by the analysis program are described as the
   * stored code values; the app does not invent structural meanings for them.
   */
  function columnDescription(tabId: string, key: string): string | undefined {
    const common: Record<string, [string, string]> = {
      number: ['要素番号。正の整数で種類ごとに一意。番号変更は参照先も同時に更新', 'Entity number: positive integer, unique per entity kind. Renumbering updates references.'],
      x: ['全体X座標 (cm)。X=水平右が正。例: 600', 'Global X coordinate (cm); +X is horizontal right. Example: 600'],
      y: ['全体Y座標 (cm)。Y=水平奥が正', 'Global Y coordinate (cm); +Y is horizontal depth.'],
      z: ['全体Z座標 (cm)。Z=鉛直上が正。例: 階高 300', 'Global Z coordinate (cm); +Z is vertical up. Example: story height 300'],
      temperature: ['節点温度（温度荷重用、℃）', 'Node temperature for thermal loads (°C).'],
      intensityGroup: ['震度グループ番号（整数）', 'Seismic intensity group number (integer).'],
      longWeight: ['長期重量 (kN)', 'Long-term weight (kN).'],
      forceWeight: ['地震用重量 (kN)', 'Seismic weight (kN).'],
      addForceWeight: ['付加重量 (kN)', 'Additional weight (kN).'],
      area: ['負担面積 (cm²)', 'Tributary area (cm²).'],
      nodeNumber: ['対象節点番号（節点タブの番号を参照）', 'Target node number (references the Nodes tab).'],
      memberNumber: ['対象部材番号（部材タブの番号を参照）', 'Target member number (references the Members tab).'],
      materialNumber: ['材料番号。0 は未指定', 'Material number; 0 means unspecified.'],
      comment: ['任意のコメント。YAML出力では断面名として使用', 'Free comment; used as the section name in YAML export.'],
      name: ['材料名。YAML出力では材料名として使用', 'Material name; used as the material name in YAML export.'],
      young: ['ヤング係数 E (kN/cm²)。例: 鋼 20500', "Young's modulus E (kN/cm²). Example: steel 20500"],
      shear: ['せん断弾性係数 G (kN/cm²)。例: 鋼 7900', 'Shear modulus G (kN/cm²). Example: steel 7900'],
      expansion: ['線膨張係数 (1/℃)。例: 1.2e-5', 'Thermal expansion coefficient (1/°C). Example: 1.2e-5'],
      poisson: ['ポアソン比（-0.999〜0.499）', 'Poisson ratio (-0.999 to 0.499).'],
      unitLoad: ['単位荷重（単位体積重量など。意味は解析側で決定、数量集計には使用しない）', 'Unit load (e.g. weight per volume). Meaning is defined by the analysis side; not used for quantities.'],
      iNodeNumber: ['I端節点番号。局所x軸は I→J 方向', 'I-end node number; the local x axis points from I to J.'],
      jNodeNumber: ['J端節点番号。I端と異なる節点', 'J-end node number; must differ from the I end.'],
      sectionNumber: ['断面番号（断面タブを参照）', 'Section number (references the Sections tab).'],
      p1_A: ['断面積 A (cm²)', 'Section area A (cm²).'],
      p2_Ix: ['旧形式のねじり定数ミラー (cm⁴)。新規編集は J 列を使用', 'Legacy torsion-constant mirror (cm⁴); edit the J column instead.'],
      torsionConstant: ['ねじり定数 J (cm⁴)。箱形・H形の自動計算は近似式', 'Torsion constant J (cm⁴); box/H auto-calculation is approximate.'],
      p3_Iy: ['断面二次モーメント Iy (cm⁴)、局所y軸回り', 'Second moment of area Iy (cm⁴) about local y.'],
      p4_Iz: ['断面二次モーメント Iz (cm⁴)、局所z軸回り', 'Second moment of area Iz (cm⁴) about local z.'],
      ky: ['せん断形状係数 ky（無次元）', 'Shear coefficient ky (dimensionless).'],
      kz: ['せん断形状係数 kz（無次元）', 'Shear coefficient kz (dimensionless).'],
      kTheta: ['回転バネ定数 Kθ (kN·cm/rad)', 'Rotational spring stiffness Kθ (kN·cm/rad).'],
      type: ['種別コード', 'Type code.'],
      shape: ['断面形状。寸法計算は矩形・円形・箱形・I/H形に対応', 'Section shape; dimension-based calculation supports rectangle, circle, box and I/H.'],
    };
    const perTab: Record<string, Record<string, [string, string]>> = {
      boundaries: {
        deltaX: ['X方向並進: 0=自由, 1=固定', 'Translation X: 0 = free, 1 = fixed'],
        deltaY: ['Y方向並進: 0=自由, 1=固定', 'Translation Y: 0 = free, 1 = fixed'],
        deltaZ: ['Z方向並進: 0=自由, 1=固定', 'Translation Z: 0 = free, 1 = fixed'],
        thetaX: ['X軸回り回転: 0=自由, 1=固定', 'Rotation about X: 0 = free, 1 = fixed'],
        thetaY: ['Y軸回り回転: 0=自由, 1=固定', 'Rotation about Y: 0 = free, 1 = fixed'],
        thetaZ: ['Z軸回り回転: 0=自由, 1=固定', 'Rotation about Z: 0 = free, 1 = fixed'],
      },
      springs: {
        method: ['バネ方式コード: 0 または 1（解析プログラム側の定義に従う）。番号1=剛、2=ピンは予約', 'Spring method code 0 or 1 as defined by the analysis program. Numbers 1 (rigid) and 2 (pin) are reserved.'],
      },
      members: {
        ixSpring: ['I端 x方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'I-end x joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        iySpring: ['I端 y方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'I-end y joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        izSpring: ['I端 z方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'I-end z joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        jxSpring: ['J端 x方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'J-end x joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        jySpring: ['J端 y方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'J-end y joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        jzSpring: ['J端 z方向の接合: 0=連続, 1=剛, 2=ピン, 3以上=バネ番号', 'J-end z joint: 0 continuous, 1 rigid, 2 pin, ≥3 spring number'],
        p1: ['部材パラメータ1（解析プログラム固有。例: コードアングル）', 'Member parameter 1 (analysis-program specific, e.g. code angle).'],
        p2: ['部材パラメータ2（解析プログラム固有）', 'Member parameter 2 (analysis-program specific).'],
        p3: ['部材パラメータ3（解析プログラム固有）', 'Member parameter 3 (analysis-program specific).'],
      },
      walls: {
        method: ['壁の方式コード（解析プログラム固有）', 'Wall method code (analysis-program specific).'],
        p1: ['壁パラメータ1（例: 厚さ。単位は解析側で定義）', 'Wall parameter 1 (e.g. thickness; unit defined by the analysis side).'],
        p2: ['壁パラメータ2', 'Wall parameter 2'],
        p3: ['壁パラメータ3', 'Wall parameter 3'],
        p4: ['壁パラメータ4', 'Wall parameter 4'],
        leftBottomNode: ['左下節点番号', 'Lower-left node number'],
        rightBottomNode: ['右下節点番号', 'Lower-right node number'],
        leftTopNode: ['左上節点番号', 'Upper-left node number'],
        rightTopNode: ['右上節点番号', 'Upper-right node number'],
      },
      nodeloads: {
        p1: ['全体X方向の集中力 (kN)。+X 向きが正。例: 水平力 10', 'Concentrated force in global X (kN); +X positive. Example: 10'],
        p2: ['全体Y方向の集中力 (kN)。+Y 向きが正', 'Concentrated force in global Y (kN); +Y positive.'],
        p3: ['全体Z方向の集中力 (kN)。+Z（上向き）が正。鉛直下向き荷重は負値。例: -50', 'Concentrated force in global Z (kN); +Z (up) positive, so downward loads are negative. Example: -50'],
        m1: ['全体X軸回りのモーメント (kN·cm)、右ねじ正', 'Moment about global X (kN·cm), right-hand positive.'],
        m2: ['全体Y軸回りのモーメント (kN·cm)、右ねじ正', 'Moment about global Y (kN·cm), right-hand positive.'],
        m3: ['全体Z軸回りのモーメント (kN·cm)、右ねじ正', 'Moment about global Z (kN·cm), right-hand positive.'],
      },
      memberloads: {
        lengthMethod: ['長さ方式コード 0〜3（解析プログラムの定義に従う。p1〜p3 の長さの解釈を決める）', 'Length-method code 0–3 as defined by the analysis program; decides how p1–p3 lengths are read.'],
        type: ['荷重種別コード 0〜3（解析プログラムの定義: 等分布・集中などの区分）', 'Load type code 0–3 as defined by the analysis program (distributed / concentrated classes).'],
        direction: ['荷重方向コード 0〜3（解析プログラムの定義: 全体軸・局所軸などの区分）', 'Load direction code 0–3 as defined by the analysis program (global / local axis classes).'],
        scale: ['荷重倍率（無次元）', 'Load scale factor (dimensionless).'],
        loadCode: ['荷重コード文字列（任意）', 'Free load code text.'],
        unitLoad: ['単位荷重の大きさ (kN/cm または kN、種別コードによる)', 'Unit load magnitude (kN/cm or kN depending on the type code).'],
        p1: ['荷重パラメータ1 (cm)。長さ方式に応じた位置・区間長', 'Load parameter 1 (cm): position or span length per length-method code.'],
        p2: ['荷重パラメータ2 (cm)', 'Load parameter 2 (cm).'],
        p3: ['荷重パラメータ3 (cm)', 'Load parameter 3 (cm).'],
      },
      cmqloads: {
        moy: ['中央曲げモーメント M0y (kN·cm)、局所y軸回り', 'Mid-span moment M0y (kN·cm) about local y.'],
        moz: ['中央曲げモーメント M0z (kN·cm)、局所z軸回り', 'Mid-span moment M0z (kN·cm) about local z.'],
        iMy: ['I端固定端モーメント My (kN·cm)', 'I-end fixed-end moment My (kN·cm).'],
        iMz: ['I端固定端モーメント Mz (kN·cm)', 'I-end fixed-end moment Mz (kN·cm).'],
        iQx: ['I端固定端力 Qx（軸方向, kN）', 'I-end fixed-end force Qx (axial, kN).'],
        iQy: ['I端固定端せん断力 Qy (kN)', 'I-end fixed-end shear Qy (kN).'],
        iQz: ['I端固定端せん断力 Qz (kN)', 'I-end fixed-end shear Qz (kN).'],
        jMy: ['J端固定端モーメント My (kN·cm)', 'J-end fixed-end moment My (kN·cm).'],
        jMz: ['J端固定端モーメント Mz (kN·cm)', 'J-end fixed-end moment Mz (kN·cm).'],
        jQx: ['J端固定端力 Qx（軸方向, kN）', 'J-end fixed-end force Qx (axial, kN).'],
        jQy: ['J端固定端せん断力 Qy (kN)', 'J-end fixed-end shear Qy (kN).'],
        jQz: ['J端固定端せん断力 Qz (kN)', 'J-end fixed-end shear Qz (kN).'],
      },
      sections: {
        type: ['断面種別: 水平・鉛直・斜材・その他・トラス・壁', 'Section type: horizontal, vertical, diagonal, other, truss, wall.'],
      },
    };
    const entry = perTab[tabId]?.[key] ?? common[key];
    return entry ? localText(...entry) : undefined;
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
      const prefix =
        key === 'lengthMethod'
          ? localText('長さ方式', 'length method')
          : key === 'type'
            ? localText('種別', 'type')
            : localText('方向', 'direction');
      column.enumOptions = [0, 1, 2, 3].map((value) => option(value, `${value} (${prefix} ${value})`));
    }
    if (tabId === 'springs' && key === 'method') {
      column.type = 'enum';
      column.enumOptions = [option(0, localText('0 (方式0)', '0 (method 0)')), option(1, localText('1 (方式1)', '1 (method 1)'))];
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
