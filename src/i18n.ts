export type Lang = 'ja' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    // メニュー
    'menu.file': 'ファイル',
    'menu.view': '表示',
    'menu.edit': '編集',
    'menu.loadcase': '荷重定義',
    'menu.new': '新規作成',
    'menu.open': '開く (.dat)',
    'menu.save': '保存 (.dat)',
    'menu.sample': 'サンプル読込',
    'menu.showNodeNum': '節点番号 表示/非表示',
    'menu.showMemberNum': '部材番号 表示/非表示',
    'menu.sort': 'ソート',
    'menu.renumber': '番号再割当',
    'menu.merge': '重複ノード統合',
    'menu.addLoadcase': '荷重定義 追加',
    'menu.removeLoadcase': '荷重定義 削除',

    // タブ
    'tab.nodes': '節点',
    'tab.boundaries': '境界条件',
    'tab.materials': '材料',
    'tab.sections': '断面',
    'tab.springs': 'バネ',
    'tab.members': '部材',
    'tab.walls': '壁',
    'tab.nodeloads': '節点荷重',
    'tab.cmqloads': 'CMQ荷重',
    'tab.memberloads': '部材荷重',

    // ステータス
    'status.initializing': '起動中...',
    'status.ready': '準備完了',
    'status.newCreated': '新規作成',
    'status.nodeNumOn': '節点番号: 表示',
    'status.nodeNumOff': '節点番号: 非表示',
    'status.memberNumOn': '部材番号: 表示',
    'status.memberNumOff': '部材番号: 非表示',
    'status.sorted': 'ソート完了',
    'status.renumbered': '番号再割当完了',
    'status.merged': '重複ノード統合完了',
    'status.loadcaseAdded': '荷重定義 {0} 追加',
    'status.loadcaseDeleted': '荷重定義削除',
    'status.fileLoaded': '読込完了: {0} (節点:{1} 部材:{2})',
    'status.encodingWarning': ' [警告: {0}でデコード]',
    'status.loadError': '読込エラー: {0}',
    'status.fileSaved': 'ファイル保存完了',
    'status.sampleLoaded': 'サンプル読込完了 (節点:{0} 部材:{1})',
    'status.sampleError': 'サンプル読込エラー: {0}',

    // ツールバー
    'toolbar.dataEdit': 'データ編集',

    // 荷重セレクタ
    'loadcase.label': '荷重定義 {0}',

    // 列ヘッダー: 節点
    'col.nodeNumber': '節点番号',
    'col.xCoord': 'X座標 cm',
    'col.yCoord': 'Y座標 cm',
    'col.zCoord': 'Z座標 cm',
    'col.temperature': '節点温度',
    'col.intensityGroup': '震度G',
    'col.longWeight': '長期重量',
    'col.forceWeight': '地震重量',
    'col.addForceWeight': '付加重量',
    'col.area': '面積cm2',

    // 列ヘッダー: 境界条件
    'col.deltaX': 'DX',
    'col.deltaY': 'DY',
    'col.deltaZ': 'DZ',
    'col.thetaX': 'RX',
    'col.thetaY': 'RY',
    'col.thetaZ': 'RZ',

    // 列ヘッダー: 材料
    'col.number': '番号',
    'col.young': 'ヤング係数',
    'col.shear': 'せん断',
    'col.expansion': '熱膨張',
    'col.poisson': 'ポアソン比',
    'col.unitLoad': '単位荷重',
    'col.materialName': '材料名',

    // 列ヘッダー: 断面
    'col.material': '材料',
    'col.type': '種別',
    'col.shape': '形状',
    'col.comment': 'コメント',

    // 列ヘッダー: バネ
    'col.method': '方式',

    // 列ヘッダー: 部材
    'col.memberNumber': '部材番号',
    'col.iNode': 'I端',
    'col.jNode': 'J端',
    'col.section': '断面',

    // 列ヘッダー: 壁
    'col.wallNumber': '壁番号',
    'col.leftBottom': '左下',
    'col.rightBottom': '右下',
    'col.leftTop': '左上',
    'col.rightTop': '右上',

    // 列ヘッダー: 節点荷重
    'col.p1kN': 'P1(kN)',
    'col.p2kN': 'P2(kN)',
    'col.p3kN': 'P3(kN)',

    // 列ヘッダー: 部材荷重
    'col.lengthMethod': '長さ方式',
    'col.direction': '方向',
    'col.scale': '倍率',
    'col.code': 'コード',

    // テーマ
    'theme.light': 'ライト',
    'theme.dark': 'ダーク',

    // ヘルプ
    'help.title': 'FrameModelMaker-Web ヘルプ',
    'help.close': '閉じる',
    'help.content': `
<h3>概要</h3>
<p>FrameModelMaker-Web は、立体フレーム（骨組構造）の解析モデルを作成・編集・可視化する Web アプリケーションです。StructForm フォーマット（.dat）のファイルを読み書きできます。</p>

<h3>ファイル操作</h3>
<table>
<tr><td><b>新規作成</b></td><td>モデルを初期化します</td></tr>
<tr><td><b>開く</b></td><td>.dat ファイルを読み込みます（Shift_JIS / UTF-8 対応）</td></tr>
<tr><td><b>保存</b></td><td>現在のモデルを .dat ファイルとしてダウンロードします</td></tr>
<tr><td><b>サンプル読込</b></td><td>内蔵のサンプルデータ（3階建て建物）を読み込みます</td></tr>
</table>

<h3>3D ビュー操作</h3>
<table>
<tr><td><b>左ドラッグ</b></td><td>モデルを回転</td></tr>
<tr><td><b>右ドラッグ</b></td><td>視点を平行移動</td></tr>
<tr><td><b>ホイール</b></td><td>ズームイン / ズームアウト</td></tr>
</table>

<h3>データ編集</h3>
<p>画面右側のデータパネルで、タブを切り替えてモデルの各要素（節点・部材・断面・材料・荷重など）を直接編集できます。セルの値を変更すると 3D ビューに即座に反映されます。</p>

<h3>編集メニュー</h3>
<table>
<tr><td><b>ソート</b></td><td>節点を Z→Y→X 順に、部材を I 端 Z 順にソートします</td></tr>
<tr><td><b>番号再割当</b></td><td>全要素の番号を 1 から振り直します</td></tr>
<tr><td><b>重複ノード統合</b></td><td>距離 2cm 以内の節点を統合します</td></tr>
</table>

<h3>荷重定義</h3>
<p>複数の荷重ケースを管理できます。ドロップダウンで荷重定義を切り替え、各ケースの節点荷重・CMQ荷重・部材荷重を個別に編集できます。</p>

<h3>単位系</h3>
<table>
<tr><td>長さ</td><td>cm</td></tr>
<tr><td>力</td><td>kN</td></tr>
<tr><td>モーメント</td><td>kN*cm</td></tr>
</table>
`,
  },

  en: {
    // Menu
    'menu.file': 'File',
    'menu.view': 'View',
    'menu.edit': 'Edit',
    'menu.loadcase': 'Load Case',
    'menu.new': 'New',
    'menu.open': 'Open (.dat)',
    'menu.save': 'Save (.dat)',
    'menu.sample': 'Load Sample',
    'menu.showNodeNum': 'Node Numbers Show/Hide',
    'menu.showMemberNum': 'Member Numbers Show/Hide',
    'menu.sort': 'Sort',
    'menu.renumber': 'Renumber',
    'menu.merge': 'Merge Duplicate Nodes',
    'menu.addLoadcase': 'Add Load Case',
    'menu.removeLoadcase': 'Remove Load Case',

    // Tabs
    'tab.nodes': 'Nodes',
    'tab.boundaries': 'Boundaries',
    'tab.materials': 'Materials',
    'tab.sections': 'Sections',
    'tab.springs': 'Springs',
    'tab.members': 'Members',
    'tab.walls': 'Walls',
    'tab.nodeloads': 'Node Loads',
    'tab.cmqloads': 'CMQ Loads',
    'tab.memberloads': 'Member Loads',

    // Status
    'status.initializing': 'Initializing...',
    'status.ready': 'Ready',
    'status.newCreated': 'New model created',
    'status.nodeNumOn': 'Node numbers: ON',
    'status.nodeNumOff': 'Node numbers: OFF',
    'status.memberNumOn': 'Member numbers: ON',
    'status.memberNumOff': 'Member numbers: OFF',
    'status.sorted': 'Sort complete',
    'status.renumbered': 'Renumber complete',
    'status.merged': 'Merge complete',
    'status.loadcaseAdded': 'Load case {0} added',
    'status.loadcaseDeleted': 'Load case deleted',
    'status.fileLoaded': 'Loaded: {0} (Nodes:{1} Members:{2})',
    'status.encodingWarning': ' [Warning: decoded as {0}]',
    'status.loadError': 'Load error: {0}',
    'status.fileSaved': 'File saved',
    'status.sampleLoaded': 'Sample loaded (Nodes:{0} Members:{1})',
    'status.sampleError': 'Sample load error: {0}',

    // Toolbar
    'toolbar.dataEdit': 'Data Editor',

    // Load case selector
    'loadcase.label': 'Load Case {0}',

    // Column headers: Nodes
    'col.nodeNumber': 'Node No.',
    'col.xCoord': 'X (cm)',
    'col.yCoord': 'Y (cm)',
    'col.zCoord': 'Z (cm)',
    'col.temperature': 'Temp.',
    'col.intensityGroup': 'Int.G',
    'col.longWeight': 'Long Wt.',
    'col.forceWeight': 'Seis. Wt.',
    'col.addForceWeight': 'Add. Wt.',
    'col.area': 'Area cm2',

    // Column headers: Boundary
    'col.deltaX': 'DX',
    'col.deltaY': 'DY',
    'col.deltaZ': 'DZ',
    'col.thetaX': 'RX',
    'col.thetaY': 'RY',
    'col.thetaZ': 'RZ',

    // Column headers: Material
    'col.number': 'No.',
    'col.young': "Young's",
    'col.shear': 'Shear',
    'col.expansion': 'Expan.',
    'col.poisson': 'Poisson',
    'col.unitLoad': 'Unit Load',
    'col.materialName': 'Name',

    // Column headers: Section
    'col.material': 'Mat.',
    'col.type': 'Type',
    'col.shape': 'Shape',
    'col.comment': 'Comment',

    // Column headers: Spring
    'col.method': 'Method',

    // Column headers: Member
    'col.memberNumber': 'Mem. No.',
    'col.iNode': 'I Node',
    'col.jNode': 'J Node',
    'col.section': 'Section',

    // Column headers: Wall
    'col.wallNumber': 'Wall No.',
    'col.leftBottom': 'LB',
    'col.rightBottom': 'RB',
    'col.leftTop': 'LT',
    'col.rightTop': 'RT',

    // Column headers: Node loads
    'col.p1kN': 'P1(kN)',
    'col.p2kN': 'P2(kN)',
    'col.p3kN': 'P3(kN)',

    // Column headers: Member loads
    'col.lengthMethod': 'Len.Method',
    'col.direction': 'Dir.',
    'col.scale': 'Scale',
    'col.code': 'Code',

    // Theme
    'theme.light': 'Light',
    'theme.dark': 'Dark',

    // Help
    'help.title': 'FrameModelMaker-Web Help',
    'help.close': 'Close',
    'help.content': `
<h3>Overview</h3>
<p>FrameModelMaker-Web is a web application for creating, editing, and visualizing 3D frame (skeletal structure) analysis models. It reads and writes StructForm format (.dat) files.</p>

<h3>File Operations</h3>
<table>
<tr><td><b>New</b></td><td>Initialize a new model</td></tr>
<tr><td><b>Open</b></td><td>Load a .dat file (Shift_JIS / UTF-8 supported)</td></tr>
<tr><td><b>Save</b></td><td>Download the current model as a .dat file</td></tr>
<tr><td><b>Load Sample</b></td><td>Load a built-in sample (3-story building)</td></tr>
</table>

<h3>3D View Controls</h3>
<table>
<tr><td><b>Left Drag</b></td><td>Rotate the model</td></tr>
<tr><td><b>Right Drag</b></td><td>Pan the view</td></tr>
<tr><td><b>Scroll Wheel</b></td><td>Zoom in / out</td></tr>
</table>

<h3>Data Editing</h3>
<p>Use the tabbed data panel on the right to edit model elements (nodes, members, sections, materials, loads, etc.). Changes are reflected in the 3D view immediately.</p>

<h3>Edit Menu</h3>
<table>
<tr><td><b>Sort</b></td><td>Sort nodes by Z→Y→X, members by I-node Z</td></tr>
<tr><td><b>Renumber</b></td><td>Reassign all element numbers from 1</td></tr>
<tr><td><b>Merge</b></td><td>Merge nodes within 2cm distance</td></tr>
</table>

<h3>Load Cases</h3>
<p>Manage multiple load cases. Switch between them using the dropdown, and edit node loads, CMQ loads, and member loads independently for each case.</p>

<h3>Unit System</h3>
<table>
<tr><td>Length</td><td>cm</td></tr>
<tr><td>Force</td><td>kN</td></tr>
<tr><td>Moment</td><td>kN*cm</td></tr>
</table>
`,
  },
};

let currentLang: Lang = (localStorage.getItem('lang') as Lang) || 'ja';

/** 現在の言語を取得 */
export function getLang(): Lang {
  return currentLang;
}

/** 言語を設定（localStorage に保存） */
export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('lang', lang);
}

/** 翻訳テキストを取得。{0}, {1}... をパラメータで置換 */
export function t(key: string, ...args: (string | number)[]): string {
  let text = messages[currentLang][key] ?? messages['ja'][key] ?? key;
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`{${i}}`, String(args[i]));
  }
  return text;
}
