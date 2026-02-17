# 技術仕様書

FrameModelMaker-Web の内部データモデル、JSON ファイルフォーマット、UI 構成に関する詳細な技術仕様です。

---

## データモデル

### Node（節点）

```typescript
interface Node {
  number: number;          // 節点番号（1 始まり）
  x: number;               // X 座標 (cm)
  y: number;               // Y 座標 (cm)
  z: number;               // Z 座標 (cm)
  temperature: number;     // 節点温度
  intensityGroup: number;  // 震度グループ番号
  longWeight: number;      // 長期荷重用節点重量
  forceWeight: number;     // 地震力算定用節点重量
  addForceWeight: number;  // 地震力算定用節点付加重量
  area: number;            // 面積 (cm^2)
  boundaryCondition: BoundaryCondition | null;
  loads: NodeLoad[];       // 荷重定義ごとの節点荷重
}
```

### Member（部材）

```typescript
interface Member {
  number: number;          // 部材番号
  iNodeNumber: number;     // I 端節点番号
  jNodeNumber: number;     // J 端節点番号
  ixSpring: number;        // I 端接合 X バネ番号
  iySpring: number;        // I 端接合 Y バネ番号
  izSpring: number;        // I 端接合 Z バネ番号
  jxSpring: number;        // J 端接合 X バネ番号
  jySpring: number;        // J 端接合 Y バネ番号
  jzSpring: number;        // J 端接合 Z バネ番号
  sectionNumber: number;   // 断面番号
  p1: number;              // パラメータ P1
  p2: number;              // パラメータ P2
  p3: number;              // パラメータ P3
  memberLoads: MemberLoad[];
  cmqLoads: CMQLoad[];
}
```

### Section（断面）

```typescript
enum SectionType {
  Horizontal = 0,  // 水平材
  Vertical = 1,    // 鉛直材
  Diagonal = 2,    // 斜め材
  Other = 3,       // その他
  Truss = 4,       // トラス
  Wall = 5         // 壁
}

enum SectionShape {
  DirectInput = 0, // 直接入力
  Rectangle = 1,   // 矩形
  Circle = 2,      // 円形
  Steel = 3,       // 鋼材
  Box = 4,         // ボックス
  I_Steel = 5,     // I 形鋼
  H_Steel = 6      // H 形鋼
}

interface Section {
  number: number;
  materialNumber: number;
  type: SectionType;
  shape: SectionShape;
  p1_A: number;    // 断面積 (cm^2)
  p2_Ix: number;   // 断面二次モーメント Ix
  p3_Iy: number;   // 断面二次モーメント Iy
  p4_Iz: number;   // 断面二次モーメント Iz
  ky: number;      // せん断面積比 Ky
  kz: number;      // せん断面積比 Kz
  comment: string;
}
```

### Material（材料）

```typescript
interface Material {
  number: number;
  young: number;      // ヤング係数 (kN/cm^2)
  shear: number;      // せん断弾性係数
  expansion: number;  // 熱膨張係数
  poisson: number;    // ポアソン比
  unitLoad: number;   // 単位荷重
  name: string;
}
```

### BoundaryCondition（境界条件）

```typescript
interface BoundaryCondition {
  nodeNumber: number;
  deltaX: number;    // X 方向変位拘束 (0: 自由, 1: 固定)
  deltaY: number;
  deltaZ: number;
  thetaX: number;    // X 軸回転拘束
  thetaY: number;
  thetaZ: number;
}
```

### Spring（部材端バネ）

```typescript
interface Spring {
  number: number;
  method: number;
  kTheta: number;    // 回転バネ定数
}
// デフォルトバネ: 剛接合 (number=1), ピン接合 (number=2)
```

### Wall（壁エレメント）

```typescript
interface Wall {
  number: number;
  leftBottomNode: number;
  rightBottomNode: number;
  leftTopNode: number;
  rightTopNode: number;
  materialNumber: number;
  method: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}
```

### 荷重データ

#### NodeLoad（節点荷重）

| フィールド | 説明 |
|-----------|------|
| p1 | X 方向力 (kN) |
| p2 | Y 方向力 (kN) |
| p3 | Z 方向力 (kN) |
| m1 | X 軸モーメント (kN*cm) |
| m2 | Y 軸モーメント (kN*cm) |
| m3 | Z 軸モーメント (kN*cm) |

#### CMQLoad（CMQ 荷重）

| フィールド | 説明 |
|-----------|------|
| moy, moz | 部材荷重モーメント |
| iMy, iMz | I 端モーメント |
| iQx, iQy, iQz | I 端せん断力 |
| jMy, jMz | J 端モーメント |
| jQx, jQy, jQz | J 端せん断力 |

#### MemberLoad（部材荷重）

| フィールド | 説明 |
|-----------|------|
| lengthMethod | 長さ方式 |
| type | 荷重種別 |
| direction | 荷重方向 |
| scale | 倍率 |
| loadCode | 荷重コード |
| unitLoad | 単位荷重 |
| p1, p2, p3 | 荷重パラメータ |

### FrameDocument（ドキュメント統括クラス）

全データを保持し、以下の操作を提供します。

| メソッド | 説明 |
|---------|------|
| `init()` | 全リストをクリアし初期化 |
| `assignNumbers()` | 全要素の番号を 1 から再割当 |
| `sort()` | 節点は Z→Y→X 順、部材は I 端 Z 順でソート |
| `mergeOverlappingNodes(threshold)` | 距離 threshold (cm) 以内のノードを統合 |
| `addLoadCase()` | 荷重定義を追加 |
| `removeLoadCase(index)` | 指定した荷重定義を削除 |
| `onChange(listener)` | 変更通知リスナーの登録 |
| `removeChangeListener(listener)` | 変更通知リスナーの解除 |

---

## JSON ファイルフォーマット詳細

### ルート構造

保存・読込に使う JSON のルートはオブジェクトで、主要キーは以下です。

```typescript
interface FrameJsonDocument {
  title: string;
  loadCaseCount: number;
  loadCaseIndex: number;
  calcCaseMemo: string[];
  nodes: NodeJson[];
  members: MemberJson[];
  sections: SectionJson[];
  materials: MaterialJson[];
  boundaries: BoundaryJson[];
  springs: SpringJson[];
  walls: WallJson[];
}
```

### 最小例

```json
{
  "title": "Sample",
  "loadCaseCount": 1,
  "loadCaseIndex": 0,
  "calcCaseMemo": [],
  "nodes": [],
  "members": [],
  "sections": [],
  "materials": [],
  "boundaries": [],
  "springs": [],
  "walls": []
}
```

### パース実装上の仕様

1. ルートがオブジェクトでない場合はエラー
2. 各配列キーは省略可能（省略時は空配列）
3. 数値・文字列・真偽値は不正値の場合に既定値へフォールバック
4. `loadCaseCount` は `1` 以上に補正
5. 実際の `loadCaseCount` は、`nodes[].loads` と `members[].memberLoads/cmqLoads` の最大長を下回らないよう補正
6. `loadCaseIndex` は `0` 以上 `loadCaseCount - 1` 以下へ補正
7. 読込後、全節点/部材の荷重配列は `setLoadCaseCount` で長さを揃える
8. `boundaries` は `nodeNumber` で節点へ再リンクして `boundaryCondition` を復元
9. 未知キーは無視（前方互換）

### 書き出し仕様

1. `JSON.stringify(..., null, 2)` で 2 スペース整形
2. 出力ファイル拡張子は `.json`
3. 内部状態の一時フラグ（例: `selected`, `isShown`）は保存対象外

### サンプルデータ

同梱サンプル:

- `public/samples/FrameModel_Sample.json`

このサンプルはオリジナル建物モデルデータを JSON 化したものです。

---

## UI 構成

### 画面レイアウト

```
+-----------------------------------------------------------+
| メニューバー                                                |
| [ファイル] [表示] [編集] [荷重定義]                            |
+---------------------------+-------------------------------+
|                           |                               |
|   3D モデルビュー           |  データパネル（タブ切替式）       |
|   (Three.js)              |                               |
|                           |  [節点|部材|断面|材料|...]       |
|   左ドラッグ = 回転         |  +---------------------------+ |
|   右ドラッグ = 移動         |  | 編集可能データグリッド       | |
|   ホイール  = ズーム        |  |                           | |
|                           |  +---------------------------+ |
+---------------------------+-------------------------------+
| ステータスバー                                               |
+-----------------------------------------------------------+
```

### 3D ビュー描画要素

| 要素 | 描画方法 | 色 |
|------|---------|-----|
| 節点 | Points（8px） | 青 (0, 0.3, 0.8)、選択時は赤 |
| 部材 | LineSegments | 青、選択時は赤 |
| 壁 | 四角形メッシュ（半透明） | #88aacc (opacity 0.3) |
| 境界条件 | 三角形シンボル | 緑 |
| 番号ラベル | Canvas 2D オーバーレイ | 節点: 青、部材: オレンジ |

### メニュー

| メニュー | 項目 | 動作 |
|---------|------|------|
| ファイル | 新規作成 | ドキュメント初期化 |
| | 開く | `.json` ファイル読み込み |
| | 保存 | JSON ファイルでダウンロード |
| | サンプル読込 | 内蔵 JSON サンプル読み込み |
| 表示 | 節点番号表示 | 3D ビュー上の番号表示切替 |
| | 部材番号表示 | 3D ビュー上の番号表示切替 |
| 編集 | ソート | 節点・部材を座標順にソート |
| | 番号再割当 | 番号を 1 から振り直す |
| | 重複ノード統合 | しきい値以内のノードをマージ |
| 荷重定義 | 追加 | 新しい荷重定義を追加 |
| | 削除 | 現在の荷重定義を削除 |
| | 切替 | ドロップダウンで荷重定義を選択 |

---

## 未実装機能

将来的に追加が検討されている機能です。

- 構面リスト管理
- 2D CAD ビュー
- マウス操作による節点・部材の追加
- コピー・削除ダイアログ
- 時刻歴データ表示・アニメーション
- 壁番号表示
