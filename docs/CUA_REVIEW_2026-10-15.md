# CUA評価（2026-10-15）対応計画と実装記録

- 根拠コミット: `5774f61da7030520a3094dc10b0a8870014b80a8`（main、v1.2.0）
- 要望: R01〜R21（P1: R01〜R05、P2: R06〜R19・R21、P3: R20）
- 検証: `npm run verify`（typecheck / test / build / audit）と Vitest 単体・DOM テスト

## 方針

1. 画面パネルは `FrameApplication.ts` の閉包から切り出し、`doc` / `toolPanel` / `updateStatus` などを注入する関数にして jsdom で直接テストできるようにする。
2. 開いたままのパネルはモデル変更通知（`ToolPanel.notifyModelChanged()`）で再集計・再同期する。
3. 状態通知は `notify(kind, message)` に統一し、`#status-text` に `data-kind` / `data-sequence` を付けて成功・失敗・取消を区別する。
4. 共通入力フォーム `requestFields` は長さ・座標・角度を `step="any"`、個数のみ整数にする。
5. アプリ全体の統合テストは `tests/app/support/appHarness.ts`（`index.html` + ModelViewer のフェイク）で `initialize()` を実行して検証する。

## 対応表

| ID | 対応内容 | 主な変更ファイル | テスト |
|---|---|---|---|
| R01 | 荷重ケースパネルに編集対象の番号・ID・名前を表示。ケース切替で入力を同期し、未確定編集は保存／破棄／取消を選択 | `src/app/LoadCasePanel.ts`, `DialogService.choose` | `tests/app/LoadCasePanel.test.ts` |
| R02 | モデル情報・数量をモデル変更時に再集計。CSVは出力時に再計算し単位付き列名 | `src/app/ModelInfoPanel.ts`, `ToolPanel` | `tests/app/ModelInfoPanel.test.ts` |
| R03 | 断面計算の入力変更で「未計算／前回値（入力変更済み）」表示、失敗時は旧値を消去、成功時は旧エラーを消去。結果は単位付き表 | `src/app/SectionCalculatorPanel.ts` | `tests/app/SectionCalculatorPanel.test.ts` |
| R04 | 適用先リストを断面の追加・削除・番号変更に追従。未選択時は適用不可。適用後に対象と変更内容を通知 | 同上 | 同上 |
| R05 | 長さ・座標・角度は `step="any"`、個数のみ整数。骨組生成・統合距離・番号変更も点検 | `src/app/UiHelpers.ts`, `PatternPanel.ts` | `tests/app/RequestFields.test.ts`, `tests/app/PatternPanel.test.ts` |
| R06 | セル確定後（ナビゲーションモード）の Cmd/Ctrl+Z はモデル Undo、編集中は文字入力の Undo | `src/ui/DataGrid.ts`（`isEditing`）, `FrameApplication.ts` | `tests/app/FrameApplication.test.ts` |
| R07 | 成功・失敗・取消を `notify` で通知し、古い通知を上書き。骨組生成・配列複製・ズーム・復元の結果を通知 | `FrameApplication.ts`, 各パネル | 同上 |
| R08 | 選択状態を `setCurrentSelection` で一元管理し、番号変更・複製・削除・Undo で情報パネルと表を同期 | `FrameApplication.ts` | 同上 |
| R09 | タブ一覧セレクト・左右スクロール、表最大化／ビュー最大化、検索・絞り込み状態表示、新規・読込時の検索初期化 | `index.html`, `FrameApplication.ts`, `main.css` | 同上 |
| R10 | 作図設定（スナップ間隔・ON/OFF・作業平面位置）と絶対／相対座標の数値確定、現在座標・スナップ先表示 | `ModelViewer.ts`, `src/app/DrawingPanel.ts` | `tests/app/DrawingPanel.test.ts` |
| R11 | 配列複製の方式別に入力を切替。影響件数・番号・座標を事前表示 | `PatternPanel.ts`, `ModelPatterns.previewPattern` | `tests/app/PatternPanel.test.ts`, `tests/services/ModelPatternsPreview.test.ts` |
| R12 | 列説明（意味・単位・正方向・例）を列ヘッダーの title / aria-description に追加 | `GridColumns.ts`, `DataGrid.ts`, `i18n.ts` | `tests/app/GridColumns.test.ts` |
| R13 | 荷重組合せをケース選択＋係数の行で編集。既存組合せの編集・複製 | `LoadCasePanel.ts` | `tests/app/LoadCasePanel.test.ts` |
| R14 | 未読込「結果未読込・0フレーム」と操作無効化、状態テキスト（ファイル名・結果名・再生状態・時刻・フレーム数）、破棄時同期、直接入力・前後・先頭末尾・速度・ループ | `ResultsPanel.ts` | `tests/app/ResultsPanel.test.ts` |
| R15 | 選択節点・部材の数値表、極値一覧、CSV出力 | `src/services/ResultTables.ts`, `ResultsPanel.ts` | `tests/services/ResultTables.test.ts` |
| R16 | 局所軸ボタンに `aria-pressed` | `FrameApplication.ts` | `tests/app/FrameApplication.test.ts` |
| R17 | ラベル背景、浮動パネルの折畳み・ドッキング・サイズ変更、情報パネルの「閉じる」と「選択解除」を分離 | `ModelViewer.ts`, `ToolPanel.ts`, `index.html`, `main.css` | `tests/app/ToolPanel.test.ts` |
| R18 | ダイアログ既定ラベル・メニュー・復旧ボタンの言語統一、断面エラーの日本語化、ヘルプ刷新、凡例に材料番号、README/SPEC の旧記述整理 | `i18n.ts`, `DialogService.ts`, `index.html`, docs | `tests/app/i18n.test.ts` |
| R19 | YAML出力前に要素数・単位・欠落項目の表を表示 | `src/app/YamlExportSummary.ts`, `FileOperations.ts` | `tests/app/YamlExportSummary.test.ts` |
| R20 | プリセット：検索・名前変更・上書き・複製・削除Undo・項目名入りボタン名・適用通知。復旧候補ボタンにモデル名・日時 | `PresetPanel.ts`, `RecoveryPanel.ts` | `tests/app/PresetPanel.test.ts` |
| R21 | P1・CUA 状態読取りの回帰テスト、E2E を公開前チェック `npm run verify:release` に組込み | `tests/app/*`, `e2e/cua-regression.spec.ts`, `package.json` | — |

## 実装記録

### 検証結果（2026-10-15、Node.js 22.22）

| 項目 | 評価時 | 対応後 |
|---|---|---|
| Vitest | 33ファイル・192件成功 | 47ファイル・241件成功 |
| 行カバレッジ（全体） | 47.47% | 67.12% |
| 分岐カバレッジ（全体） | 41.14% | 52.37% |
| `FrameApplication.ts` 行 | 0% | 63.95% |
| `SectionCalculatorPanel.ts` 行 | 0% | 95.62% |
| `ModelInfoPanel.ts` 行 | 0% | 84.03% |
| `LoadCasePanel.ts` 行 | （新規） | 86.86% |
| `ResultsPanel.ts` 行 | 0% | 83.52% |
| `ModelViewer.ts` 行 | 2.16% | 2.21%（WebGL のため E2E で検証） |
| `npm run verify` | 成功 | 成功（typecheck / test / build / audit） |
| E2E（Chromium） | 11件 | 19件（既存11 + CUA回帰8） |

`npm audit --audit-level=high` は依存 `source-map-js` の high 指摘で失敗していたため、`npm update source-map-js fast-uri` で lockfile 内のパッチ版へ更新しました（アプリ依存の変更なし）。

### 主な設計変更

- **通知**: `FrameApplication.notify(kind, message)` が `#status-text` に `data-kind` / `data-sequence` / `title`（時刻）を付与。`updateStatus` は `notify('info')` の別名。CSS で ✓ / ✕ / ⊘ を前置。
- **パネル同期**: `ToolPanel.open(title, content, { id, onModelChanged, onClose })`。`refreshDocumentUi` と表セル編集後に `notifyModelChanged()` を呼び、モデル情報・断面計算（適用先）・荷重ケース・解析結果の各パネルが再同期。
- **選択の一元管理**: `setCurrentSelection()` が存在確認 → ビューア → 情報パネル → 表 → 結果数値の順に同期。番号変更・複製・作図・Undo/Redo が利用。情報パネルの「×」は非表示のみ（`data-dismissed`）、「選択解除」で選択を解除。
- **荷重ケース**: `LoadCasePanel` が `editingCaseId` を保持し、セレクタ変更時に `onActiveCaseChanged()` で同期。未確定編集は `DialogService.choose()` で保存／破棄／取消（取消はセレクタを戻す）。組合せはケース行＋係数の表で編集・複製。
- **共通フォーム**: `DialogField` に `integer` / `min` / `max` / `description` / `visibleWhen`、`requestFields` に `preview`。数値入力は既定 `step="any"`。非表示項目は `disabled` にしてネイティブ検証から除外。
- **作図**: `ModelViewer.getDrawingOptions / setDrawingOptions / setOnDrawingCursor / getDrawingStart / confirmDrawingPoint` を追加し、`DrawingPanel` が数値入力・スナップ・作業平面・現在座標を担当。
- **解析結果**: `ResultTables`（純関数）で選択要素の行・極値・CSV・時刻→フレーム変換。パネルは状態（読込・再生・フレーム・時刻）を `data-*` と表で公開し、破棄時に同期。
- **列説明**: `ColumnDef.description` を列ヘッダー `title` / `aria-description` とセルの `title` に反映。コード値（0〜3、0/1）の構造的意味は解析プログラム側の定義に従う旨を明示し、独自定義はしない。
- **テスト基盤**: `tests/app/support/appHarness.ts` が `index.html` を jsdom に展開し、`ModelViewer` を `FakeModelViewer` に差し替えて `initialize()` を実行。`tests/app/FrameApplication.test.ts` が R01〜R18 の状態読取りを回帰テスト化。`e2e/cua-regression.spec.ts` がブラウザ固有の挙動（step 検証、確定済みセルの Cmd+Z、1440 幅のタブ到達、通知属性）を確認。`npm run verify:release` で公開前に E2E まで実行。
- **Playwright**: `PLAYWRIGHT_CHROMIUM_EXECUTABLE` でプリインストール済み Chromium を指定可能（CI イメージ向け、未指定時は従来どおり）。

### 残課題・判断

- R10 の作業平面は 2D ビューの `elevation` / `offset` を数値で指定する方式。3D ビューでは平面ビューへ切り替えて適用する。
- R17 の「パネルを除いた領域への全体表示」はドッキング（キャンバスを縮める）で実現し、浮動時はブラウザ標準の `resize` でサイズ変更する。ラベルは背景付きで重なりを判読可能にしたが、位置の自動回避は既存の間引きに委ねる。
- R19 は出力範囲の拡張（壁・端バネ・荷重値の YAML 化）ではなく、欠落項目・件数・単位の明示に留めた。解析 YAML スキーマ側に対応表現がないため。
- R21 の E2E は Chromium のみを公開前チェックに組み込んだ（Firefox / WebKit は従来どおり任意実行）。
