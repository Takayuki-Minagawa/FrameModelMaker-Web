import { settings } from './services/SettingsRepository';
export type Lang = 'ja' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    // メニュー
    'menu.file': 'ファイル',
    'menu.view': '表示',
    'menu.edit': '編集',
    'menu.loadcase': '荷重定義',
    'menu.new': '新規作成',
    'menu.open': '開く (.json/.yaml)',
    'menu.save': '保存 (.json)',
    'menu.sample': 'サンプル読込',
    'menu.showNodeNum': '節点番号 表示/非表示',
    'menu.showMemberNum': '部材番号 表示/非表示',
    'menu.sort': 'ソート',
    'menu.renumber': '番号再割当',
    'menu.merge': '重複ノード統合',
    'menu.addLoadcase': '荷重定義 追加',
    'menu.removeLoadcase': '荷重定義 削除',
    'menu.exportYaml': '解析YAMLを書き出す',
    'menu.exportCsv': '現在の表をCSVで書き出す',
    'menu.showWallNum': '壁番号 表示/非表示',
    'menu.tools': 'ツール',
    'edit.undo': '元に戻す',
    'edit.redo': 'やり直す',
    'edit.duplicate': '選択行を複製',
    'view.fit': '全体表示',
    'view.top': '上面 (XY)',
    'view.front': '正面 (XZ)',
    'view.side': '側面 (YZ)',
    'view.iso': 'アイソメ',
    'view.projection': '透視 / 平行投影',
    'view.plane': '2D作図モード',
    'view.elevationX': 'X方向立面ビュー',
    'view.elevationY': 'Y方向立面ビュー',
    'view.loads': '荷重表示',
    'view.boundaries': '境界条件表示',
    'draw.node': '節点を作図',
    'draw.member': '部材を作図',
    'draw.move': '選択要素を移動',
    'draw.duplicate': '選択要素を複製',
    'loadcase.copy': '現在の荷重ケースを複製',
    'loadcase.combinations': '荷重組合せ',
    'loadcase.current': '現在の荷重ケース',
    'tools.validate': 'モデル健全性センター',
    'tools.modelInfo': 'モデル情報・数量',
    'tools.sectionCalculator': '断面性能計算',
    'tools.importReport': 'インポート診断',
    'tools.results': '解析結果・時刻歴',

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
    'status.yamlFileLoaded': 'YAML読込完了: {0} (節点:{1} 部材:{2} スキップ:{3} 診断:{4})',
    'status.encodingWarning': ' [警告: {0}でデコード]',
    'status.loadError': '読込エラー: {0}',
    'status.fileSaved': 'ファイル保存完了',
    'status.sampleLoaded': 'サンプル読込完了 (節点:{0} 部材:{1})',
    'status.sampleError': 'サンプル読込エラー: {0}',
    'status.unsaved': '未保存',
    'status.validated': '検証完了: エラー {0} / 警告 {1}',
    'status.undo': '元に戻しました',
    'status.redo': 'やり直しました',
    'status.autosaveRestored': '自動保存から復元しました',
    'status.csvExported': 'CSVを書き出しました',
    'status.yamlExported': 'YAMLを書き出しました',
    'status.viewChanged': '表示を切り替えました',

    // ツールバー
    'toolbar.dataEdit': 'データ編集',
    'toolbar.addRow': '行追加',
    'toolbar.deleteRow': '行削除',
    'toolbar.search': '表を検索',
    'toolbar.copy': 'コピー',
    'toolbar.paste': '貼り付け',

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
    'selection.title.node': '節点情報',
    'selection.title.member': '部材情報',
    'selection.title.wall': '壁情報',
    'selection.close': '閉じる',
    'toolbar.changeNumber': '番号変更',
    'aria.applicationMenu': 'アプリケーションメニュー',
    'aria.viewer': '3Dモデルビュー',
    'aria.viewControls': 'ビュー操作',
    'aria.resizeData': 'モデルビューとデータ表のサイズを変更',
    'aria.modelData': 'モデルデータ',
    'aria.dataCategories': 'データ種別',
    'dialog.cancel': 'キャンセル',
    'dialog.confirm': '実行',
    'dialog.unsavedTitle': '未保存の変更があります',
    'dialog.unsavedBody': '続行すると未保存の変更が失われます。続行しますか？',
    'dialog.deleteTitle': '選択行を削除',
    'dialog.deleteBody': '選択した {0} 行を削除します。参照中の要素がある場合は削除できません。',
    'panel.validation': 'モデル健全性センター',
    'panel.modelInfo': 'モデル情報・数量',
    'panel.importReport': 'インポート診断',
    'panel.results': '解析結果・時刻歴',
    'panel.sectionCalculator': '断面性能計算',
    'diagnostic.none': '問題は見つかりませんでした。',
    'diagnostic.error': 'エラー',
    'diagnostic.warn': '警告',
    'diagnostic.info': '情報',
    'draw.nodeHint': 'グリッド上をクリックして節点を追加します。Escで終了します。',
    'draw.memberHint': '始点と終点の節点を順にクリックします。Escで終了します。',
    'results.load': '結果JSONを読み込む',
    'results.play': '再生',
    'results.pause': '一時停止',
    'results.scale': '変形倍率',

    'menu.importCsv': 'CSV入力',
    'menu.localAxes': '局所軸 表示/非表示',
    'menu.pattern': '配列複製',
    'menu.frameTemplate': '骨組生成',
    'menu.bulkAttribute': '一括属性変更',
    'menu.presets': 'テンプレート・ビュー',
    'menu.theme': 'テーマ切替',
    'menu.language': '言語切替',
    'menu.help': 'ヘルプ',
    'dialog.ok': 'OK',
    'layout.maximizeView': 'ビューを最大化（表を隠す）',
    'layout.maximizeData': '表を最大化（ビューを隠す）',
    'layout.restore': '表示を元に戻す',
    'tabs.scrollPrev': '前のタブへスクロール',
    'tabs.scrollNext': '次のタブへスクロール',
    'tabs.list': 'タブ一覧',
    'filter.none': '絞り込みなし',
    'filter.state': '検索「{0}」: {1} / {2} 行を表示',
    'draw.settings': '作図設定（数値入力）',
    'draw.closeSettings': '作図設定を閉じる',
    'selection.clear': '選択解除',
    'selection.closeInfo': '情報パネルを閉じる（選択は維持）',
    'panel.collapse': 'パネルを折り畳む／展開する',
    'panel.dock': 'パネルをドッキング／フロート',
    'panel.close': 'パネルを閉じる',
    'status.cancelled': '取り消しました',

    // ヘルプ
    'help.title': 'FrameModelMaker-Web ヘルプ',
    'help.close': '閉じる',
    'help.content': `
<h3>概要</h3>
<p>FrameModelMaker-Web は、立体フレーム（骨組構造）の解析モデルをブラウザで作成・検証・可視化し、JSON / 解析用 YAML で受け渡す Web アプリケーションです。FEM 解析は行いません。解析結果は外部ソルバーの JSON を読み込んで表示します。</p>

<h3>ファイル</h3>
<table>
<tr><td><b>新規作成</b></td><td>空のモデルへ切り替えます（未保存変更は確認）</td></tr>
<tr><td><b>開く</b></td><td>.json（Frame JSON v2 / 旧 v1）または解析用 .yaml/.yml を読み込み、件数・単位・診断をプレビューしてから適用します</td></tr>
<tr><td><b>保存</b></td><td>現在のモデルを JSON v2 としてダウンロードします（Ctrl/Cmd+S）</td></tr>
<tr><td><b>解析YAMLを書き出す</b></td><td>出力前に要素数・単位・欠落項目（壁・カスタムバネ・荷重値）の表を確認します</td></tr>
<tr><td><b>CSV入力 / 現在の表をCSVで書き出す</b></td><td>現在のタブに対して列対応・番号キー・単位（cm/kN または mm/N）を指定して取り込み、または書き出します</td></tr>
<tr><td><b>サンプル読込</b></td><td>同梱モデル（節点150・部材248・壁32・荷重8ケース）を読み込みます</td></tr>
</table>

<h3>データ編集と Undo / Redo</h3>
<p>右側のタブで節点・境界条件・材料・断面・バネ・部材・壁・各荷重を編集します。クリックまたは F2 / Enter で編集、Escape で未確定値を取り消し、Enter / Tab で確定します。確定後にセルにフォーカスがある状態の Ctrl/Cmd+Z・Ctrl/Cmd+Y（Shift+Z）はモデルの Undo / Redo、文字入力中はテキストの取り消しです。編集メニューからも Undo / Redo できます。</p>
<p>列ヘッダーにポインターを合わせると、列の意味・単位・正方向・例が表示されます。検索欄で表示行を絞り込み、絞り込み状態はツールバー下に「検索「…」: n / m 行」と表示されます。タブは左右スクロールボタン・タブ一覧セレクトから選べ、「表を最大化」「ビューを最大化」で片方を隠せます。</p>

<h3>貼り付け・一括属性変更・CSV</h3>
<p>Ctrl/Cmd+C / V で TSV をコピー＆貼り付けします。貼り付けは変更内容をプレビューし、エラーがあれば全件を止め、1回の Undo で戻せます。「一括属性変更」は選択行の1列を同じ値に変更します。</p>

<h3>配列複製・骨組生成</h3>
<p>選択した節点・部材・壁を直線（ΔX/ΔY/ΔZ・個数）、回転（中心・軸・角度・個数）、鏡映（面の法線・座標）で複製します。長さ・座標・角度は小数（例: 12.5 cm、0.5°）を使えます。実行前に対象番号・追加件数・複製先座標を確認できます。「骨組生成」はスパン数・層数・スパン・階高・断面からラーメン／トラス形状を追加します。</p>

<h3>3D / 2D ビュー</h3>
<table>
<tr><td><b>左ドラッグ / 右ドラッグ / ホイール</b></td><td>回転 / 平行移動 / ズーム</td></tr>
<tr><td><b>要素クリック</b></td><td>節点・部材・壁を選択。情報パネルの「×」はパネルを閉じるだけで、「選択解除」で選択を解除します</td></tr>
<tr><td><b>2D / EX / EY</b></td><td>平面・X立面・Y立面の作図ビュー</td></tr>
<tr><td><b>●+ / ╱+ / ↔ / ⧉</b></td><td>節点作図・部材作図・移動・複製。作図中は「作図設定」でスナップ間隔・ON/OFF・作業平面・絶対／相対座標を数値入力できます</td></tr>
<tr><td><b>矢印キー / Enter</b></td><td>キャンバスにフォーカスした状態で照準を移動 / 選択・作図を確定</td></tr>
<tr><td><b>F / Esc</b></td><td>全体表示 / 選択・作図モード・パネルを閉じる</td></tr>
</table>
<p>表示メニューで節点・部材・壁番号、局所軸（x赤・y緑・z青）、荷重、境界条件を切り替えます。モデル情報パネルではレイヤー・色分け（凡例に材料番号を併記）・ラベル密度・選択表示を変更できます。浮動パネルは折り畳み・ドッキング・サイズ変更ができます。</p>

<h3>荷重ケース・荷重組合せ</h3>
<p>「現在の荷重ケース」で表示・編集対象のケースを切り替えます。荷重組合せパネルは編集対象（表示番号・名前・固定ID）を表示し、ケースを切り替えると入力を同期します。未確定の編集があれば保存・破棄・取消を選べます。組合せはケース選択＋係数の行で作成・編集・複製します。表示番号（1/2）は並び順、LC1/LC2 は固定IDです。</p>

<h3>断面計算・モデル情報・プリセット</h3>
<p>断面計算は矩形・円形・箱形・H形の寸法から A / J / Iy / Iz / ky / kz を単位付きで算定し、入力変更後は「前回計算値」、失敗時は旧値を破棄して表示します。適用先は断面の追加・削除・番号変更に追従し、未選択では適用できません。モデル情報・数量はモデル変更に追従して再集計し、数量CSV（cm / cm³）は出力時に最新モデルから計算します。プリセットはビュー・断面テンプレートを検索・名前変更・上書き・複製・削除（取り消し可）できます。</p>

<h3>解析結果 JSON（実験的）</h3>
<p>結果 JSON v1（cm / kN / kN-cm、節点 global-xyz、部材 local-xyz）または OpenSees 変換形式を読み込み、変形・反力・断面力を表示します。パネルにはファイル名・結果名・再生状態・フレーム・時刻が表示され、フレーム／時刻の直接入力、前後・先頭／末尾、再生速度とループを操作できます。選択した節点・部材の数値、最大・最小値、現在フレームの CSV 出力も行えます。モデルを編集すると結果は破棄されます。</p>

<h3>復旧</h3>
<p>編集内容はこのブラウザーの IndexedDB に自動保存され、右上の復旧センターから候補（モデル名・日時）を復元・削除できます。JSON ファイルも必ず保存してください。</p>

<h3>キーボード</h3>
<table>
<tr><td>Ctrl/Cmd+S / O</td><td>保存 / 開く</td></tr>
<tr><td>Ctrl/Cmd+Z / Y</td><td>元に戻す / やり直す</td></tr>
<tr><td>Delete</td><td>選択行を削除（参照中の要素は削除不可）</td></tr>
<tr><td>Esc</td><td>選択・作図モード・パネルを閉じる</td></tr>
<tr><td>F</td><td>全体表示</td></tr>
<tr><td>タブ上の ← →</td><td>タブ切替</td></tr>
</table>

<h3>単位系と制限</h3>
<table>
<tr><td>長さ / 力 / モーメント</td><td>cm / kN / kN·cm（応力 kN/cm²、面積 cm²、断面二次モーメント cm⁴）</td></tr>
<tr><td>座標系</td><td>X=水平右、Y=水平奥、Z=鉛直上</td></tr>
<tr><td>制限</td><td>FEM ソルバーは含みません。壁体積は数量集計の対象外、J の自動計算は近似式、YAML 出力は壁・カスタムバネ・荷重値を含みません。読込ファイルの上限は 100 MiB です</td></tr>
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
    'menu.open': 'Open (.json/.yaml)',
    'menu.save': 'Save (.json)',
    'menu.sample': 'Load Sample',
    'menu.showNodeNum': 'Node Numbers Show/Hide',
    'menu.showMemberNum': 'Member Numbers Show/Hide',
    'menu.sort': 'Sort',
    'menu.renumber': 'Renumber',
    'menu.merge': 'Merge Duplicate Nodes',
    'menu.addLoadcase': 'Add Load Case',
    'menu.removeLoadcase': 'Remove Load Case',
    'menu.exportYaml': 'Export Analysis YAML',
    'menu.exportCsv': 'Export Current Grid as CSV',
    'menu.showWallNum': 'Wall Numbers Show/Hide',
    'menu.tools': 'Tools',
    'edit.undo': 'Undo',
    'edit.redo': 'Redo',
    'edit.duplicate': 'Duplicate Selected Rows',
    'view.fit': 'Fit to View',
    'view.top': 'Top (XY)',
    'view.front': 'Front (XZ)',
    'view.side': 'Side (YZ)',
    'view.iso': 'Isometric',
    'view.projection': 'Perspective / Orthographic',
    'view.plane': '2D Drawing Mode',
    'view.elevationX': 'X Elevation View',
    'view.elevationY': 'Y Elevation View',
    'view.loads': 'Load Display',
    'view.boundaries': 'Boundary Display',
    'draw.node': 'Draw Node',
    'draw.member': 'Draw Member',
    'draw.move': 'Move Selected Entity',
    'draw.duplicate': 'Duplicate Selected Entity',
    'loadcase.copy': 'Duplicate Current Load Case',
    'loadcase.combinations': 'Load Combinations',
    'loadcase.current': 'Current load case',
    'tools.validate': 'Model Health Center',
    'tools.modelInfo': 'Model Information & Quantities',
    'tools.sectionCalculator': 'Section Property Calculator',
    'tools.importReport': 'Import Diagnostics',
    'tools.results': 'Analysis Results & Time History',

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
    'status.yamlFileLoaded': 'YAML loaded: {0} (Nodes:{1} Members:{2} Skipped:{3} Diagnostics:{4})',
    'status.encodingWarning': ' [Warning: decoded as {0}]',
    'status.loadError': 'Load error: {0}',
    'status.fileSaved': 'File saved',
    'status.sampleLoaded': 'Sample loaded (Nodes:{0} Members:{1})',
    'status.sampleError': 'Sample load error: {0}',
    'status.unsaved': 'Unsaved',
    'status.validated': 'Validation complete: {0} errors / {1} warnings',
    'status.undo': 'Undone',
    'status.redo': 'Redone',
    'status.autosaveRestored': 'Restored from autosave',
    'status.csvExported': 'CSV exported',
    'status.yamlExported': 'YAML exported',
    'status.viewChanged': 'View changed',

    // Toolbar
    'toolbar.dataEdit': 'Data Editor',
    'toolbar.addRow': 'Add Row',
    'toolbar.deleteRow': 'Delete Row',
    'toolbar.search': 'Search grid',
    'toolbar.copy': 'Copy',
    'toolbar.paste': 'Paste',

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
    'selection.title.node': 'Node Information',
    'selection.title.member': 'Member Information',
    'selection.title.wall': 'Wall Information',
    'selection.close': 'Close',
    'toolbar.changeNumber': 'Change number',
    'aria.applicationMenu': 'Application menu',
    'aria.viewer': '3D model viewer',
    'aria.viewControls': 'View controls',
    'aria.resizeData': 'Resize model view and data table',
    'aria.modelData': 'Model data',
    'aria.dataCategories': 'Data categories',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'Continue',
    'dialog.unsavedTitle': 'There are unsaved changes',
    'dialog.unsavedBody': 'Continuing will discard unsaved changes. Continue?',
    'dialog.deleteTitle': 'Delete selected rows',
    'dialog.deleteBody': 'Delete {0} selected rows. Referenced entities cannot be removed.',
    'panel.validation': 'Model Health Center',
    'panel.modelInfo': 'Model Information & Quantities',
    'panel.importReport': 'Import Diagnostics',
    'panel.results': 'Analysis Results & Time History',
    'panel.sectionCalculator': 'Section Property Calculator',
    'diagnostic.none': 'No problems found.',
    'diagnostic.error': 'Error',
    'diagnostic.warn': 'Warning',
    'diagnostic.info': 'Information',
    'draw.nodeHint': 'Click the grid to add a node. Press Escape to finish.',
    'draw.memberHint': 'Click the start and end nodes. Press Escape to finish.',
    'results.load': 'Load result JSON',
    'results.play': 'Play',
    'results.pause': 'Pause',
    'results.scale': 'Deformation scale',

    'menu.importCsv': 'Import CSV',
    'menu.localAxes': 'Local Axes Show/Hide',
    'menu.pattern': 'Pattern Copy',
    'menu.frameTemplate': 'Generate Frame',
    'menu.bulkAttribute': 'Bulk Edit Attributes',
    'menu.presets': 'Presets & Views',
    'menu.theme': 'Toggle theme',
    'menu.language': 'Toggle language',
    'menu.help': 'Help',
    'dialog.ok': 'OK',
    'layout.maximizeView': 'Maximize view (hide table)',
    'layout.maximizeData': 'Maximize table (hide view)',
    'layout.restore': 'Restore layout',
    'tabs.scrollPrev': 'Scroll to previous tabs',
    'tabs.scrollNext': 'Scroll to next tabs',
    'tabs.list': 'Tab list',
    'filter.none': 'No filter',
    'filter.state': 'Search “{0}”: showing {1} / {2} rows',
    'draw.settings': 'Drawing settings (numeric input)',
    'draw.closeSettings': 'Close drawing settings',
    'selection.clear': 'Clear selection',
    'selection.closeInfo': 'Close info panel (keep selection)',
    'panel.collapse': 'Collapse / expand panel',
    'panel.dock': 'Dock / float panel',
    'panel.close': 'Close panel',
    'status.cancelled': 'Cancelled',

    // Help
    'help.title': 'FrameModelMaker-Web Help',
    'help.close': 'Close',
    'help.content': `
<h3>Overview</h3>
<p>FrameModelMaker-Web creates, checks and visualizes 3D frame analysis models in the browser and exchanges them as JSON / analysis YAML. It does not run FEM; analysis results are loaded from an external solver's JSON.</p>

<h3>File</h3>
<table>
<tr><td><b>New</b></td><td>Switch to an empty model (unsaved changes are confirmed)</td></tr>
<tr><td><b>Open</b></td><td>Load .json (Frame JSON v2 / legacy v1) or analysis .yaml/.yml with a preview of counts, units and diagnostics before applying</td></tr>
<tr><td><b>Save</b></td><td>Download the current model as JSON v2 (Ctrl/Cmd+S)</td></tr>
<tr><td><b>Export Analysis YAML</b></td><td>Review counts, units and omitted items (walls, custom springs, load values) before exporting</td></tr>
<tr><td><b>Import CSV / Export Current Grid as CSV</b></td><td>Import into or export from the current tab with column mapping, number keys and units (cm/kN or mm/N)</td></tr>
<tr><td><b>Load Sample</b></td><td>Load the bundled model (150 nodes, 248 members, 32 walls, 8 load cases)</td></tr>
</table>

<h3>Data editing and Undo / Redo</h3>
<p>Edit nodes, boundaries, materials, sections, springs, members, walls and loads in the tabs on the right. Click or press F2 / Enter to edit, Escape to cancel an uncommitted value, Enter / Tab to commit. After committing, Ctrl/Cmd+Z and Ctrl/Cmd+Y (Shift+Z) with the cell focused undo / redo the model; while typing they undo the text. The Edit menu offers Undo / Redo as well.</p>
<p>Hover a column header to see the column meaning, unit, positive direction and an example. The search box filters rows and the filter state is shown under the toolbar as “Search …: n / m rows”. Tabs can be reached with the scroll buttons or the tab list; “Maximize table” / “Maximize view” hide the other half.</p>

<h3>Paste, bulk attributes and CSV</h3>
<p>Ctrl/Cmd+C / V copies and pastes TSV. Pasting previews the changes, stops entirely on errors and can be undone in one step. “Bulk Edit Attributes” sets one column of the selected rows to the same value.</p>

<h3>Pattern copy and frame generation</h3>
<p>Copy selected nodes, members and walls linearly (ΔX/ΔY/ΔZ, count), radially (origin, axis, angle, count) or mirrored (plane normal, coordinate). Lengths, coordinates and angles accept decimals (e.g. 12.5 cm, 0.5°). The dialog previews source numbers, added counts and copy coordinates. “Generate Frame” adds a frame / truss from bays, stories, span, height and a section.</p>

<h3>3D / 2D view</h3>
<table>
<tr><td><b>Left drag / right drag / wheel</b></td><td>Rotate / pan / zoom</td></tr>
<tr><td><b>Click entity</b></td><td>Select a node, member or wall. The info panel's “×” only hides the panel; “Clear selection” clears it</td></tr>
<tr><td><b>2D / EX / EY</b></td><td>Plan, X-elevation and Y-elevation drawing views</td></tr>
<tr><td><b>●+ / ╱+ / ↔ / ⧉</b></td><td>Draw node, draw member, move, duplicate. While drawing, “Drawing settings” accepts snap spacing, snap toggles, work plane and absolute / relative coordinates</td></tr>
<tr><td><b>Arrow keys / Enter</b></td><td>With the canvas focused, move the crosshair / confirm a selection or drawing</td></tr>
<tr><td><b>F / Esc</b></td><td>Fit to view / clear selection, drawing mode and panels</td></tr>
</table>
<p>The View menu toggles node, member and wall numbers, local axes (x red, y green, z blue), loads and boundaries. The model information panel changes layers, colors (legend always shows material numbers), label density and selection display. Floating panels can be collapsed, docked and resized.</p>

<h3>Load cases and combinations</h3>
<p>“Current load case” switches the displayed and edited case. The load combination panel shows the edited case (display number, name, stable ID) and follows the selector; unsaved edits can be saved, discarded or the switch cancelled. Combinations are built from case rows with factors and can be edited and duplicated. Display numbers (1/2) follow the order; LC1/LC2 are stable IDs.</p>

<h3>Section calculator, model information, presets</h3>
<p>The section calculator derives A / J / Iy / Iz / ky / kz with units from rectangle, circle, box and H dimensions, marks results as “previous values” after inputs change and discards them on errors. The target list follows section additions, deletions and renumbering; applying requires a selected target. Model information recalculates after every change and the quantities CSV (cm / cm³) is computed from the latest model at export time. Presets (views and section templates) can be searched, renamed, overwritten, duplicated and deleted with undo.</p>

<h3>Analysis results JSON (experimental)</h3>
<p>Load result JSON v1 (cm / kN / kN-cm, nodes global-xyz, members local-xyz) or the OpenSees converter format to show deformation, reactions and section forces. The panel shows file name, result title, playback state, frame and time, with direct frame / time input, previous / next, first / last, speed and loop. Values for the selected node or member, extremes, and a CSV of the current frame are available. Editing the model discards loaded results.</p>

<h3>Recovery</h3>
<p>Edits are saved automatically to this browser's IndexedDB; the Recovery center (top right) restores or deletes snapshots by model name and time. Always keep a JSON file as well.</p>

<h3>Keyboard</h3>
<table>
<tr><td>Ctrl/Cmd+S / O</td><td>Save / open</td></tr>
<tr><td>Ctrl/Cmd+Z / Y</td><td>Undo / redo</td></tr>
<tr><td>Delete</td><td>Delete selected rows (referenced entities are protected)</td></tr>
<tr><td>Esc</td><td>Clear selection, drawing mode and panels</td></tr>
<tr><td>F</td><td>Fit to view</td></tr>
<tr><td>← → on a tab</td><td>Switch tabs</td></tr>
</table>

<h3>Units and limits</h3>
<table>
<tr><td>Length / force / moment</td><td>cm / kN / kN·cm (stress kN/cm², area cm², second moment cm⁴)</td></tr>
<tr><td>Coordinate system</td><td>X horizontal right, Y horizontal depth, Z vertical up</td></tr>
<tr><td>Limits</td><td>No FEM solver. Wall volumes are excluded from quantities, auto-calculated J is approximate, YAML export omits walls, custom springs and load values. Input files are limited to 100 MiB</td></tr>
</table>
`,
  },
};

let currentLang: Lang = settings.choice('lang', ['ja', 'en'] as const, 'ja');

/** 現在の言語を取得 */
export function getLang(): Lang {
  return currentLang;
}

/** 言語を設定（localStorage に保存） */
export function setLang(lang: Lang): void {
  currentLang = lang;
  settings.setItem('lang', lang);
  document.documentElement.lang = lang;
}

/** 翻訳テキストを取得。{0}, {1}... をパラメータで置換 */
export function t(key: string, ...args: (string | number)[]): string {
  let text = messages[currentLang][key] ?? messages['ja'][key] ?? key;
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`{${i}}`, String(args[i]));
  }
  return text;
}
