# 解析用YAML読み込み対応 作業計画

## 目的

`Test0202_calc.yaml` のように、既存JSON保存形式とは別に生成された解析用フレームモデルYAMLを読み込み、FrameModelMaker-Web上で形状確認できる状態に変換する。保存形式は現行どおりJSONのままとし、YAMLはインポート専用形式として扱う。

初期調査ではコード修正を行わず、複数サブエージェントによる読み込み手続き調査結果を統合して実装計画を整理した。本計画を実装する段階では、下記のフェーズに沿ってコード、テスト、ドキュメントを更新する。

## 調査観点

- 既存のファイル読み込み経路、UI入口、内部モデル、保存形式を確認する。
- `Test0202_calc.yaml` のような解析用YAMLのスキーマ、件数、単位、既存モデルへのマッピング候補を確認する。
- ゼロレングス要素、検証、描画、CAD出力相当の形状確認リスクを確認する。
- 上記結果とリポジトリ内の追加確認を統合し、実装計画として整理する。

## 現状の読み込み手続き

関連箇所:

- `src/main.ts`
  - `setupMenu()`
  - `openFile()`
  - `saveFile()`
  - `loadSample()`
- `src/io/FrameJson.ts`
  - `parseFrameJson(text, doc)`
  - `toFrameJson(doc)`
  - `writeFrameJson(doc)`
- `src/models/FrameDocument.ts`
  - `FrameDocument`
  - `Node`, `Member`, `Section`, `Material`, `BoundaryCondition`, `Spring`, `Wall`
- `src/viewer/ModelViewer.ts`
  - `drawNodes()`
  - `drawMembers()`
  - `drawWalls()`
  - `pickMemberAtScreen()`

現状フロー:

1. `openFile()` が `<input type="file">` を生成し、`input.accept = '.json'` でJSONのみ受け付ける。
2. `file.text()` で読み込み、`parseFrameJson(text, doc)` を呼ぶ。
3. `parseFrameJson()` は `JSON.parse()` 後、`doc.init()` で既存状態を初期化する。
4. JSON配列を `FrameDocument` の各モデルクラスへ直接変換する。
5. `boundaries` は `nodeNumber` で `Node.boundaryCondition` に再リンクする。
6. 読み込み成功後、ビューア更新、グリッド更新、荷重ケースセレクタ更新を行う。
7. 保存は常に `writeFrameJson()` でJSON出力する。

API層やサービス層はなく、静的フロントエンド内で `main.ts` が直接IOと `FrameDocument` を操作している。

## 対象YAMLの概要

対象例: `Test0202_calc.yaml`

トップレベル:

- `schema_version`
- `units`
- `model`
- `load_cases`
- `load_combinations`

主な内容:

- `model.ndm`: `3`
- `model.ndf`: `6`
- `model.nodes`: 76件
- `model.supports`: 68件
- `model.nodal_masses`: 64件
- `model.constraints`: 72件、すべて `equalDOF`
- `model.elements`: 79件
  - `elasticTimoshenkoBeam3D`: 64件
  - `truss3D`: 2件
  - `twoNodeLink3D`: 13件
- `model.materials`: 2件、`steel`, `alc`
- `model.sections`: 2件、`B`, `ALC_S_center_beam`
- `load_cases`: 空
- `load_combinations`: 空

単位:

- 長さ: `mm`
- 力: `N`
- 応力: `N/mm^2`
- 面積: `mm^2`
- 断面二次モーメント: `mm^4`
- 並進剛性: `N/mm`
- 回転剛性: `N*mm/rad`

## 既存モデルへのマッピング方針

既存アプリは `cm/kN` 系を前提としているため、YAMLの `mm/N` 系から変換して取り込む。

| YAML | FrameDocument | 変換方針 |
| --- | --- | --- |
| `model.name` | `doc.title` | 文字列として設定 |
| `model.nodes[].tag` | `Node.number` | タグ番号をそのまま節点番号にする |
| `model.nodes[].x/y/z` | `Node.x/y/z` | `mm -> cm` で `/ 10` |
| `model.supports[].node_tag` | `BoundaryCondition.nodeNumber` | 対象節点へ紐付け |
| `model.supports[].dofs` | `deltaX/Y/Z`, `thetaX/Y/Z` | `ux/uy/uz/rx/ry/rz` を固定フラグへ変換 |
| `model.materials` | `Material[]` | 文字列キーから数値IDを採番 |
| `elastic_modulus` | `Material.young` | `N/mm^2 -> kN/cm^2` で `* 0.1` |
| `shear_modulus` | `Material.shear` | `N/mm^2 -> kN/cm^2` で `* 0.1` |
| `model.sections` | `Section[]` | 文字列キーから数値IDを採番 |
| `area` | `Section.p1_A` | `mm^2 -> cm^2` で `/ 100` |
| `torsion_constant` | `Section.p2_Ix` | `mm^4 -> cm^4` で `/ 10000`、対応名は要確認 |
| `inertia_y` | `Section.p3_Iy` | `mm^4 -> cm^4` で `/ 10000` |
| `inertia_z` | `Section.p4_Iz` | `mm^4 -> cm^4` で `/ 10000` |
| `shear_area_y/z` | `Section.ky/kz` | `shear_area / area` を候補にする |
| `elasticTimoshenkoBeam3D` | `Member` | 線材として取り込む |
| `truss3D` | `Member` | 線材として取り込み、`Section.type = Truss` 候補 |
| `twoNodeLink3D` | `Member` または診断付き表示用部材 | 既存 `Spring` では忠実に表せないため、形状確認用に扱う |

現行JSONに保存先がない情報:

- `constraints` の `equalDOF`
- `nodal_masses`
- `groups`
- `result_extraction`
- `traceability`
- `vecxz`
- `twoNodeLink3D` の `dir`, `stiffness`, `orient_x`, `orient_y`, `shear_dist`

これらは現行保存形式を変更しない限り、読み込み後の保存JSONには保持できない。実装時は「形状確認用に落とし込む情報」と「失われる解析情報」を読み込み診断に明示する。

## ゼロレングス要素とスキップ方針

今回の `Test0202_calc.yaml` では、厳密なゼロレングス要素は検出されなかった。ただし、同一座標の別タグ節点があり、`twoNodeLink3D` の一部は1mm程度の短いリンクとして表現されている。

将来のYAMLではゼロレングス要素を含む前提で、以下の方針にする。

1. 読み込み全体を即停止せず、要素単位で診断を集める。
2. 節点タグ重複、要素タグ重複、非有限座標、YAMLルート不正など、モデル全体の整合性が壊れる場合は読み込み失敗にする。
3. 端点節点が見つからない要素は、その要素だけスキップする。
4. `elasticTimoshenkoBeam3D` と `truss3D` の長さが許容値以下の場合は、その要素だけスキップする。
5. `twoNodeLink3D` はゼロレングスが意図される可能性があるため、まず保持を試みる。
6. ただし、既存ビューアまたは将来のCAD出力でゼロ長線分がエラーになる場合は、その要素だけスキップし、タグ、種類、端点、理由を診断へ出す。
7. 同一座標の別タグ節点は自動統合しない。`equalDOF` や接続ばね用の意味を壊す可能性が高いため。

診断レベル:

- `ERROR`: その要素またはファイルを取り込めない問題。
- `WARN`: 取り込むが、解析情報の欠落や短すぎる要素など注意が必要な問題。
- `INFO`: 件数、スキップ数、単位変換、未対応情報の概要。

診断に含める項目:

- ファイル名
- YAML `schema_version`
- 節点、材料、断面、要素の件数
- 要素タイプ別件数
- スキップした要素の `tag`, `type`, `node_i`, `node_j`, `length`, `reason`
- 未対応で破棄されるキー
- 単位変換の有無

## 実装計画

### 1. YAML専用IOモジュールを追加

追加候補:

- `src/io/FrameAnalysisYaml.ts`

責務:

- YAML文字列をパースする。
- 対象スキーマか判定する。
- `FrameDocument` に変換する。
- 診断結果を返す。

想定API:

```ts
export interface FrameYamlImportDiagnostic {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  tag?: number;
}

export interface FrameYamlImportResult {
  diagnostics: FrameYamlImportDiagnostic[];
  importedNodeCount: number;
  importedMemberCount: number;
  skippedElementCount: number;
}

export function parseFrameAnalysisYaml(text: string, doc: FrameDocument): FrameYamlImportResult;
```

YAMLパーサは `yaml` または `js-yaml` の追加が必要。型安全性とESM利用のしやすさを確認して選定する。

### 2. 変換を小さな関数に分割

候補:

- `parseRawYaml(text)`
- `validateAnalysisYamlRoot(raw)`
- `buildMaterialMap(model.materials)`
- `buildSectionMap(model.sections, materialMap)`
- `parseNodes(model.nodes)`
- `parseSupports(model.supports, nodeMap)`
- `parseElements(model.elements, nodeMap, sectionMap)`
- `appendImportMemo(doc, diagnostics)`

`FrameJson.ts` の既存パーサと混ぜず、JSON保存形式への影響を避ける。

### 3. UIの読み込み入口を拡張

変更候補:

- `src/main.ts`
  - `input.accept` を `.json,.yaml,.yml` に拡張。
  - 拡張子またはファイル内容でJSON/YAMLをdispatch。
  - 読み込み成功ステータスにスキップ数と警告数を含める。
  - 失敗時は現行と同じくバックアップJSONから復元する。
- `src/i18n.ts`
  - メニュー表記を `開く (.json/.yaml)` に変更。
  - YAML読み込み診断用ステータス文言を追加。

保存側は変更しない。YAMLから読み込んだ後も `saveFile()` は現行JSONを出力する。

### 4. 表示用の部材化方針を決める

形状確認を優先する場合、`twoNodeLink3D` も表示用 `Member` として取り込むのが実用的。ただし、解析的な意味は失われる。

候補:

- `elasticTimoshenkoBeam3D`: 通常 `Member`
- `truss3D`: `Member`、断面種別は `Truss`
- `twoNodeLink3D`: 表示用 `Member`
  - 専用の「Link/Spring」断面を内部で作る。
  - `comment` に `twoNodeLink3D` と元の方向、剛性の概要を入れる。
  - ゼロ長でCAD出力や描画が破綻する場合は、要素単位でスキップする。

現行 `Spring` は部材端回転ばね用であり、YAMLの独立した2節点リンクを表す器ではないため、無理に `Spring` へ入れない。

### 5. CAD出力またはCAD由来形状確認への備え

現リポジトリ内にDXFなどのCAD出力機能は見当たらない。今後CAD出力を追加または外部確認する場合は、YAMLインポート時点で以下を保証しておく。

- 節点番号、要素番号を元タグのまま維持する。
- 短いリンク、ゼロ長リンク、スキップ要素を診断で追えるようにする。
- CADでゼロ長線分が扱えない場合は、線分ではなく点マーカーまたは注記として扱う設計にする。
- 形状確認対象は、解析完全再現ではなく、節点、線材、接続リンクの幾何確認であることをUIまたはドキュメントに明記する。

## テスト計画

追加候補:

- `tests/io/FrameAnalysisYaml.test.ts`

テストケース:

1. `Test0202_calc.yaml` 相当の最小YAMLを読み込める。
2. `model.nodes` が `Node` に変換され、座標が `mm -> cm` 変換される。
3. `supports[].dofs` が `BoundaryCondition` に変換される。
4. `materials` と `sections` の文字列参照が数値IDに変換される。
5. `elasticTimoshenkoBeam3D` と `truss3D` が `Member` に変換される。
6. `twoNodeLink3D` が表示用部材として取り込まれる、またはスキップされる場合は診断が出る。
7. 端点節点が存在しない要素は要素単位でスキップされる。
8. beam/trussのゼロ長要素はスキップされる。
9. `twoNodeLink3D` のゼロ長要素は、保持可能なら保持し、保持不能なら診断付きでスキップする。
10. YAML読み込み後に `writeFrameJson()` で現行JSON形式として保存できる。
11. `parseFrameJson()` の既存テストが影響を受けない。

検証コマンド:

```bash
npm run typecheck
npm test
npm run build
```

## 受け入れ条件

- `.json` 読み込みの既存挙動が変わらない。
- `.yaml` / `.yml` を開ける。
- `Test0202_calc.yaml` を読み込んだとき、少なくとも節点76件と主要線材要素がビューアに表示される。
- 読み込み時にスキップした要素がある場合、理由が確認できる。
- ゼロレングスまたは短い `twoNodeLink3D` が原因でファイル全体の読み込みが失敗しない。
- 保存は従来どおり `.json` で行われる。
- 未対応情報が失われることが診断またはドキュメントで分かる。
- 型チェック、テスト、ビルドが通る。

## 実装時の注意点

- `mergeOverlappingNodes()` をYAML読み込み直後に自動実行しない。
- `assignNumbers()` をYAML読み込み直後に自動実行しない。
- 元タグを維持し、CAD出力や元データとの照合を可能にする。
- `section_ref` と `material_ref` は文字列なので、安定した数値IDマップを作る。
- `calcCaseMemo` へインポート概要を入れる場合は、保存JSONに残ることを前提に文面を最小限にする。
- 読み込み失敗時の復元処理は現行 `openFile()` のバックアップ方式に合わせる。

## 推奨実装順

1. `FrameAnalysisYaml.ts` の型定義と純粋変換関数を作る。
2. 最小YAMLの単体テストを追加する。
3. 単位変換、材料、断面、節点、境界条件を実装する。
4. beam/truss要素の `Member` 変換を実装する。
5. `twoNodeLink3D` の表示用変換とゼロ長スキップ診断を実装する。
6. `main.ts` の読み込みdispatchを追加する。
7. i18n、README、仕様書にYAMLはインポート専用であることを追記する。
8. 実ファイル `Test0202_calc.yaml` で手動確認する。
9. 型チェック、テスト、ビルドを実行する。
