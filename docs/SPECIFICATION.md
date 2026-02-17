# 技術仕様書

FrameModelMaker-Web の内部データモデル、StructForm ファイルフォーマット、UI 構成に関する詳細な技術仕様です。

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
  area: number;            // 面積 (cm²)
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
  p1_A: number;    // 断面積 (cm²)
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
  young: number;      // ヤング係数 (kN/cm²)
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
| m1 | X 軸モーメント (kN\*cm) |
| m2 | Y 軸モーメント (kN\*cm) |
| m3 | Z 軸モーメント (kN\*cm) |

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

## StructForm ファイルフォーマット詳細

テキスト形式、Shift_JIS エンコーディング。区切り文字はカンマ（`,`）。

### ファイル全体構造

```
START                                                       Windows 8.00
TITLE
"タイトル文字列"
CONTROL
0,0,0, 5,, 5
M-CONTROL
 1 , 1 , 0 , 0 , 0 , 0
 0 , 0 , 0 , 5 , 80
 1 ,2.0,1.1,60,
 1 ,2.0,1.1,2.0,0.2,60
 0 , 1 , 1 , 1 ,20,15, 1 ,,
 0 , 1 , 1 , 1 ,20,15,1.0,1.0
NODE
    番号,X座標,Y座標,Z座標,,    0,0.0,0.0,,0.0,
    ...
BOUNDARY
1,""
    節点番号,DeltaX,DeltaY,DeltaZ,ThetaX,ThetaY,ThetaZ,,,,,,
    ...
MATERIAL
    番号,Young,Shear,Expansion,Poisson,UnitLoad,Name
    ...
M-MATERIAL
    （デフォルト値）
SECTION
    番号,材料番号,Type,Shape,P1_A,P2_Ix,P3_Iy,P4_Iz,,,Ky,Kz,,,,,0,0,,,,,Comment
    ...
MEM1-SPRING
    番号,Method,K_Theta
    ...
MEMBER
    番号,I端番号,J端番号,Ix,Iy,Iz,Jx,Jy,Jz,断面番号,    0,5,P1,P2,P3,...
    ...
WALL（壁がある場合のみ）
    番号,左下,右下,左上,右上,材料番号,Method,P1,P2,P3,P4,
    ...
AI-LOAD
0,0,1.0,2,0.2,0.0,  0
LOAD-DEFINITION（荷重定義ごとに繰り返し）
 定義番号,0,0,0,"",0
F-NODE
    節点番号,P1,P2,P3,M1,M2,M3
    ...
F-CMQ
    部材番号,Moy,Moz,iMy,iMz,iQx,iQy,iQz,jMy,jMz,jQx,jQy,jQz
    ...
F-MEMBER
    部材番号,LengthMethod,Type,Direction,Scale,LoadCode,UnitLoad,P1,P2,P3,...
    ...
CALCULATION-CASE
    荷重組合せ情報行...
STOP
```

### パーサー実装上の注意点

1. 各セクションはキーワード行（`NODE`, `BOUNDARY`, `MATERIAL` 等）で区切られる
2. `M-CONTROL` セクションは行数不定のため、`NODE` キーワードが現れるまでスキップ
3. `M-MATERIAL` セクションも同様に、`SECTION` キーワードまでスキップ
4. `MEM1-SPRING` セクションが存在しない場合は、`SECTION` の直後に `MEMBER` が現れる
5. `WALL` セクションが存在しない場合は、`MEMBER` の直後に `AI-LOAD` が現れる
6. 空文字列のフィールドは 0 として扱う
7. 数値は科学記数法（例: `6.384E+00`）を含む場合がある
8. `LOAD-DEFINITION` は荷重定義数分繰り返され、各定義内に `F-NODE`, `F-CMQ`, `F-MEMBER` が順に出現する
9. ゼロの荷重値は出力を省略する

### 数値フォーマット（書き出し時）

| 種別 | フォーマット | 例 |
|------|------------|-----|
| 浮動小数点 | `value.toExponential(3).toUpperCase()` | `6.384E+00` |
| 整数（右寄せ） | `String(n).padStart(width, ' ')` | `    1` |

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
| | 開く | `.dat` ファイル読み込み |
| | 保存 | StructForm フォーマットでダウンロード |
| | サンプル読込 | 内蔵サンプルデータ読み込み |
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
