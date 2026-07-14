# FrameModelMaker-Web 技術仕様

- 対象バージョン: 1.1.0
- モデル JSON: formatVersion 2
- 解析結果 JSON: formatVersion 1
- 最終更新: 2026-07-14

この文書は FrameModelMaker-Web のデータモデル、整合性規則、ファイル形式、編集・表示サービスと既知の制約を定義します。画面の使い方は [README](../README.md)、実装前の監査と対応状況は [追加機能提案](FEATURE_RECOMMENDATIONS.md) を参照してください。

## 1. システム境界

本アプリの責務は次のとおりです。

1. 立体フレームモデルの作成・編集
2. モデル整合性の診断
3. 3D / 2D 表示と荷重・外部解析結果の可視化
4. Frame JSON と解析 YAML の交換

本アプリは FEM 方程式の組立・求解を行いません。解析結果表示は外部ソルバーが作成した JSON を対象にします。

内部の基本単位は長さ cm、力 kN、モーメント kN·cm、応力度 kN/cm²、断面積 cm²、断面二次モーメント・ねじり定数 cm⁴です。座標系は X = 水平右、Y = 水平奥、Z = 鉛直上です。

## 2. ドキュメントモデル

`FrameDocument` が全エンティティと荷重ケースを所有します。

```typescript
class FrameDocument {
  title: string;
  nodes: Node[];
  members: Member[];
  sections: Section[];
  materials: Material[];
  boundaries: BoundaryCondition[];
  springs: Spring[];
  walls: Wall[];
  loadCaseCount: number;       // 常に1以上
  loadCaseIndex: number;       // 0..loadCaseCount-1
  calcCaseMemo: string[];
  loadCases: LoadCase[];
  loadCombinations: LoadCombination[];
  analysisMetadata: AnalysisMetadata | null;
}
```

### 2.1 節点と荷重

```typescript
class Node {
  number: number;
  x: number; y: number; z: number;
  temperature: number;
  intensityGroup: number;
  longWeight: number;
  forceWeight: number;
  addForceWeight: number;
  area: number;
  boundaryCondition: BoundaryCondition | null;
  loads: NodeLoad[];
  isShown: boolean;
}

class NodeLoad {
  p1: number; p2: number; p3: number; // X/Y/Z方向力
  m1: number; m2: number; m3: number; // X/Y/Z軸モーメント
}
```

`Node.loads[index]` は `loadCases[index]` に対応します。新規節点と荷重ケース増減時は、配列長を `loadCaseCount` に同期します。

### 2.2 部材と荷重

```typescript
class Member {
  number: number;
  iNodeNumber: number;
  jNodeNumber: number;
  ixSpring: number; iySpring: number; izSpring: number;
  jxSpring: number; jySpring: number; jzSpring: number;
  sectionNumber: number;
  p1: number; p2: number; p3: number;
  memberLoads: MemberLoad[];
  cmqLoads: CMQLoad[];
  isShown: boolean;
}
```

`memberLoads[index]` と `cmqLoads[index]` も同じ荷重ケース添字を使います。部材荷重の局所軸・符号・長さ指定は外部スキーマに依存するため、ビューアは `LoadGlyphProvider` で明示的な表示アダプターを受け取ります。規約が不明な値を推測して描画しません。

### 2.3 断面と材料

```typescript
class Section {
  number: number;
  materialNumber: number;
  type: SectionType;
  shape: SectionShape;
  p1_A: number;             // A (cm²)
  p2_Ix: number;            // v1互換ミラー。非推奨
  torsionConstant: number;  // J (cm⁴)、v2正式フィールド
  p3_Iy: number;            // Iy (cm⁴)
  p4_Iz: number;            // Iz (cm⁴)
  ky: number;
  kz: number;
  comment: string;
}
```

`p2_Ix` は従来 JSON / UI でねじり定数として扱われていたため残します。新規処理は `torsionConstant` を使用し、保存時は互換値も維持します。

`SectionShape` は DirectInput、Rectangle、Circle、Steel、Box、I_Steel、H_Steel を持ちます。寸法計算は DirectInput、Rectangle、Circle、Box、I_Steel、H_Steel に対応します。箱形の J は Bredt–Batho 薄肉近似、I / H 形の J は開断面近似です。これらは設計規準に基づく最終照査値ではありません。

### 2.4 境界条件、バネ、壁

- `BoundaryCondition` は節点番号と並進3・回転3自由度を持ち、各 DOF は 0（自由）または 1（固定）です。
- 境界条件は `FrameDocument.boundaries` が正規の一覧で、`Node.boundaryCondition` は同じオブジェクトへの参照です。`synchronizeBoundaryConditions()` で同期します。
- バネ番号 0 はバネなし、1 と 2 は予約バネ、カスタムバネは 3 以上です。
- `Wall` は4節点、材料、方式と4パラメーターを持ちます。4節点は互いに異なり、面積が必要です。

### 2.5 荷重ケースと組合せ

```typescript
class LoadCase {
  id: string;    // ドキュメント内で一意かつ安定
  name: string;
  type: 'dead' | 'live' | 'wind' | 'seismic' | 'temperature' | 'other' | string;
  memo: string;
}

class LoadCombination {
  id: string;
  name: string;
  terms: Array<{ loadCaseId: string; factor: number }>;
  memo: string;
}
```

ケースの追加・削除・複製・移動は3種類の荷重配列を同時に更新します。最後の1ケースは削除できません。組合せは添字ではなく `loadCaseId` を参照します。

### 2.6 YAML解析メタデータ

FrameModelMaker 固有モデルへ直接写像できない値を `AnalysisMetadata` に保持します。

- `equalDOF` 制約
- 節点質量
- `twoNodeLink3D` の節点、方向、剛性、局所軸、せん断距離
- 局所軸
- ノード・要素グループ
- 結果抽出指定
- 出典、生成元、生成日時、元タグなどのトレーサビリティ
- JSON 互換の拡張値

この領域は JSON へ保存できます。元 YAML のコメント、キー順、アンカー、未知の任意構文を完全保存するものではありません。

## 3. 整合性と編集操作

### 3.1 番号と参照

節点、部材、断面、材料、カスタムバネ、壁の番号は正の整数で、種類ごとに一意です。番号変更と一括再採番は、次の参照を同一操作内で更新します。

| 番号種別 | 追従する参照 |
|---|---|
| 節点 | 部材 I/J 端、境界条件、壁4隅、解析メタデータの節点参照 |
| 断面 | 部材 |
| 材料 | 断面、壁 |
| バネ | 部材端6方向 |
| 荷重ケースID | 荷重組合せ |

`assignNumbers()` は旧番号→新番号の Map を含む `RenumberResult` を返します。番号セルの変更も `changeEntityNumber()` と同じ参照更新規則を通します。

### 3.2 重複節点統合

`mergeOverlappingNodes(threshold)` は距離がしきい値以内の推移的な節点集合を統合します。代表節点を確定して参照を更新してから重複節点を削除します。

- 部材・壁・境界条件の節点参照を代表番号へ変更
- 節点荷重と重量を統合
- 属性競合を結果の `conflicts` に記録
- 同一端点となった部材を除去して番号を報告
- 退化した壁を報告

操作結果は統合数、旧番号→代表番号、除去部材、退化壁、属性競合を返します。

### 3.3 履歴と dirty 状態

`DocumentHistory` は Frame JSON v2 のスナップショット履歴です。

- 既定上限100件
- トランザクション内の複数変更を1履歴へ集約
- Undo / Redo 時は strict パースを使って原子的に復元
- 保存時スナップショットとの差分で dirty 判定
- `autosaveVersion: 1` の復旧ペイロードをシリアライズ
- `KeyValueStorage` を介して localStorage 等へ保存可能

現在の実装は JSON スナップショット方式で、アプリ UI は最大100件の履歴を `localStorage` へベストエフォートで保存します。ブラウザのクォータを超える場合は保存に失敗するため、復旧を保証するものではありません。非常に大きなモデル向けの差分コマンド履歴、IndexedDB バックエンド、復旧候補を選択する UI は未実装です。

### 3.4 モデル検証

`FrameValidator` は副作用なしで `error`、`warning`、`info` の診断を返します。主な検査は次のとおりです。

- 無効・重複番号、非有限値
- 節点・断面・材料・バネ参照切れ
- 同一端点、ゼロ長、重複部材
- 断面・材料・バネの負値と不正 enum
- 境界 DOF、重複境界、節点参照との同期
- 壁の欠落節点、退化、ゼロ面積
- 孤立節点、未使用断面・材料
- 荷重配列長、荷重ケース数・ID、組合せ係数・参照

診断にはコード、説明、対象種類・番号・配列位置・フィールドが含まれます。保存前検証と、UI から対象行・3D 要素へ移動する用途で同じ結果を使います。

## 4. Frame JSON v2

### 4.1 ルート

```json
{
  "formatVersion": 2,
  "title": "Sample",
  "loadCaseCount": 1,
  "loadCaseIndex": 0,
  "calcCaseMemo": [],
  "loadCases": [
    { "id": "LC1", "name": "Dead", "type": "dead", "memo": "" }
  ],
  "loadCombinations": [],
  "analysisMetadata": null,
  "nodes": [],
  "members": [],
  "sections": [],
  "materials": [],
  "boundaries": [],
  "springs": [],
  "walls": []
}
```

要素の詳細フィールドは2章のモデルと同じです。ただし `Node.boundaryCondition` は重複保存せず、`boundaries` から復元します。選択状態は保存しません。`isShown` は節点・部材・壁ごとに保存します。

### 4.2 読込モード

`parseFrameJson(text, target, { mode })` は一時 `FrameDocument` を構築し、成功後に `target.replaceWith()` します。

- `strict`: 型違反、非有限数、不正な必須値をエラーとして拒否
- `lenient`: 安全に既定値へ補正可能な値は補正し、パス付き診断を返す

戻り値は現行 `formatVersion`、移行元バージョン、診断一覧です。未知の将来バージョンは拒否し、対象ドキュメントを変更しません。

### 4.3 マイグレーション

`formatVersion` がないファイルは v1 とみなし v2 へ移行します。

- `loadCaseCount` から安定 ID `LC1`... の荷重ケースを生成
- `p2_Ix` を `torsionConstant` へ移行し、互換ミラーを維持
- 新規の組合せと解析メタデータは空値で初期化

保存は常に2スペース整形の v2 JSON です。

## 5. 解析 YAML

### 5.1 入力条件

解析 YAML は `schema_version: "1"`、`units`、`model.nodes`、`model.elements` を必須とします。現在の単位スキーマは次を受け付けます。

| YAML | 内部 | 係数 |
|---|---|---|
| mm | cm | 0.1 |
| N | kN系モデル値 | 項目ごとの変換規則 |
| N/mm² | kN/cm² | 0.1 |
| mm² | cm² | 0.01 |
| mm⁴ | cm⁴ | 0.0001 |

### 5.2 対応モデル

- 節点、支持条件、材料、断面
- `elasticTimoshenkoBeam3D`
- `truss3D`
- 表示用部材としての `twoNodeLink3D`
- 名前付き荷重ケースと荷重組合せ
- 2.6節の解析メタデータ

重複タグや不正な節点座標などモデル全体を壊す入力は拒否します。存在しない端点を持つ要素と、通常線材のゼロ長要素はその要素だけスキップします。ゼロ長 `twoNodeLink3D` は表示用部材として保持し、剛性・方向をメタデータへ保存します。

### 5.3 診断と非破壊性

結果には info / warn / error のコード、メッセージ、元要素タグ・種類が含まれます。取込件数とスキップ件数も返します。パースと変換は一時ドキュメントで行い、成功時のみ現在のドキュメントを置換します。

YAML 情報は Frame JSON v2 の `analysisMetadata` に保持できます。`exportFrameAnalysisYaml()` は `{ yaml, diagnostics }`、`writeFrameAnalysisYaml()` はYAML文字列を返します。節点、支持、材料、断面、線材、荷重ケース・組合せと、保持した制約・質量・リンク・局所軸・グループ・結果抽出・トレース・拡張値を再構成します。出力単位は現在 `mm / N / N/mm² / mm² / mm⁴` 系です。

現行解析 YAML スキーマで表現できない壁、カスタム部材端バネ、FrameModelMaker 固有の節点荷重・部材荷重・CMQ値は出力診断へ警告を追加します。また、一般的な YAML のコメント、アンカー、キー順、未知の任意構文を元と同一に再構築することは保証しません。

## 6. 解析結果 JSON v1（実験的）

解析結果はモデル JSON と分離します。この形式は結果表示の MVP を検証するための実験的スキーマであり、設計照査用の確定交換仕様ではありません。

```typescript
interface AnalysisResult {
  formatVersion: 1;
  title: string;
  units: {
    length: 'cm';
    force: 'kN';
    moment: 'kN-cm';
  };
  coordinateSystem: 'global-xyz';
  nodeReactionSystem: 'global-xyz';
  memberForceSystem: 'local-xyz';
  loadCaseId?: string;
  combinationId?: string;
  frames: Array<{
    time: number;
    nodes: Array<{
      nodeNumber: number;
      displacement: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      reaction?: ResultForce6;
    }>;
    members: Array<{
      memberNumber: number;
      iEnd: ResultForce6;
      jEnd: ResultForce6;
    }>;
  }>;
  metadata?: Record<string, string | number | boolean | null>;
}
```

`ResultForce6` は axial、shearY、shearZ、torsion、momentY、momentZ を持ちます。ベクトルは `{x,y,z}` と3要素配列、端力は名前付きオブジェクトと6要素配列を受け付けます。`frames` を省略した静的ルートの nodes / members は時刻0の1フレームとして扱います。

パーサーは有限値、正の節点・部材番号、1件以上のフレームに加え、次の固定規約を必須とします。

- 長さ `cm`、力 `kN`、モーメント `kN-cm`
- 節点座標・変位・反力は全体 `global-xyz`
- 部材 I/J 端力は部材 `local-xyz`

規約フィールドの欠落または不一致は読込時に拒否します。アプリ層は節点・部材番号、荷重ケースID、組合せIDを現在のモデルへ照合し、モデル編集時は読み込み済みの結果を破棄します。ビューアは単位、座標、局所軸、符号を変換しません。節点反力の先頭3成分は全体 X / Y / Z、後半3成分は全体軸回りのモーメントとして扱います。部材端力は入力元が定義した部材局所軸・符号と一致している必要があり、断面力図は確認用の実験的表現です。値と規約を入力元でも検証し、解析結果表示だけを構造安全性の判定に使用してはいけません。

## 7. データグリッド

`DataGrid<T>` は次の列型を提供します。

- text、number、checkbox
- select / enum / reference
- readonly

列定義は単位、必須、最小・最大、候補値、行依存候補、検証関数を持てます。編集値は型変換後に検証し、不正セルを保持・一覧化します。

複数行選択、Ctrl / Shift 選択、元データ添字を維持する検索・列フィルター・行フィルター・表示ソート、行スクロール、TSV コピー＆ペーストを提供します。貼り付けは複数セル変更を1件の構造化イベントで通知します。表示ソートは番号再採番とは別操作です。

## 8. 3D / 2D ビューア

### 8.1 表示と選択

Three.js ビューアは節点、部材、壁、境界条件、荷重、結果、ラベルを個別レイヤーとして管理します。選択型は `none | node | member | wall` です。3D 選択とグリッド選択は番号を介して同期します。

標準視点は top / front / side / isometric、投影は perspective / orthographic です。カメラ状態は position、target、up、zoom、平行投影高さとして取得・復元できます。セル編集によるモデル更新では `updateModel(false)` を使い、現在の視点を維持します。

表示モードは通常、選択のみ、非選択を薄く表示から選べます。部材色は断面、材料、要素種別またはカスタム resolver で決定し、凡例を取得できます。ラベル密度は全件、自動間引き、選択のみです。

### 8.2 省電力

レンダリングは invalidate 方式です。モデル、カメラ、選択、テーマ、リサイズ等の変更時にだけ描画し、操作が収束した非操作時は連続描画を停止します。ジオメトリ・マテリアル・壁エッジ・ラベルはモデル更新または dispose 時に解放します。

### 8.3 2D作図

表示モードは 3D、平面、X立面、Y立面です。作図モードは none、node、member、move、duplicate を持ちます。グリッドスナップと作図面上の既存節点スナップの結果を `DrawingEvent` としてアプリ層へ通知し、モデル変更・検証・履歴登録はアプリ層が実行します。キャンバスはフォーカス可能で、矢印キーによる照準移動と Enter による選択・作図確定をマウス操作の代替として提供します。

### 8.4 荷重と解析結果

節点荷重・境界条件はモデルから表示できます。部材荷重と CMQ は局所軸・符号規約を呼出側が確定し、`LoadGlyphProvider` から矢印・ポリライン・ラベルを渡します。

実験的な解析結果表示は未変形 / 変形形、反力、断面力成分、各倍率を切り替え、断面力倍率の自動調整も提供します。フレーム指定と fps / loop 付き再生・一時停止を提供します。結果パーサーは固定単位・座標規約を検査し、アプリ層はモデル参照を照合しますが、ビューアは結果の算定、単位・座標・局所軸・符号変換を行いません。

## 9. 集計サービス

`calculateModelStatistics()` は次を返します。

- 各エンティティ、荷重ケース、組合せの件数
- 節点座標の min / max / size
- 部材総延長と `A × length` の線材体積
- 断面別・材料別の部材数、総延長、体積
- 孤立節点、ゼロ長部材、参照未解決部材

壁は厚さの正式仕様がないため体積に含めません。`Material.unitLoad` は既定で使用せず、呼出側が `weightPerVolume` または `massPerVolume` と明示した場合のみ概算します。

## 10. UI・アクセシビリティ

- メニューは native `details` / `summary` / `button`
- タブは `role="tablist"`、表は `role="grid"`
- ダイアログは native `dialog`
- フォーカス可視化、Escape、主要ショートカット、`aria-live`
- 言語変更時に `html lang` を更新
- 狭い画面ではビューと編集パネルを縦配置
- `prefers-reduced-motion` を尊重

言語は日本語 / 英語、テーマはライト / ダークです。ユーザー設定はブラウザ保存領域へ記録します。

## 11. ビルド、テスト、CI

動作要件は Node.js `^20.19.0 || >=22.12.0` です。主要依存は TypeScript 5.9、Vite 8、Vitest 4、Three.js 0.185.1、yaml 2.9 です。

本番ビルドは Three.js と YAML を個別チャンクに分離します。YAML 読込処理は操作時に遅延ロードできます。Vitest は `tests/**/*.test.ts` を対象とし、V8 カバレッジを text / json / html / lcov で出力します。

GitHub Actions は Node.js 20.19 と 22.12 で型チェック、テスト、ビルド、`npm audit --audit-level=high` を実行します。デプロイ前にも同じ品質ゲートを通します。Dependabot は npm と GitHub Actions を定期確認します。

## 12. 既知の制約

- アプリ内 FEM ソルバー、クラウド保存、共同編集はない。
- YAML は対応スキーマを構造化して保持するが、任意 YAML の完全なラウンドトリップは保証しない。
- 部材荷重 / CMQ の3D表示は、局所軸・符号規約を指定するアダプターが必要。
- 壁厚が未定義のため、壁数量は件数・形状確認に限定する。
- 断面自動計算の J は近似式を含む。設計規準による照査は利用者が行う。
- 解析結果表示は実験的で、固定単位・座標規約以外を変換しない。モデル参照は読込時に照合するが、部材局所軸、符号、値の妥当性は入力元が表示前に検証する。
- 復旧スナップショットは `localStorage` の容量内に限る。IndexedDB と復旧候補選択 UI は未実装。
- Web Worker、完全な表仮想化、差分履歴は未実装。極端に大きいファイルではブラウザのメモリ制限を受ける。
- 入力ファイルは 25 MiB を上限とする。
