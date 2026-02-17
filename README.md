# FrameModelMaker-Web

C# Windows Forms アプリケーション「Ebi-FrameTerminal」を、GitHub Pages で動作する静的 Web アプリケーションとして再実装したフレーム解析（骨組構造解析）モデル作成・編集・可視化ツール。

StructForm フォーマット（.dat）でファイルの読み書きを行う。

## 技術スタック

| 項目 | 技術 |
|------|------|
| 言語 | HTML5 + CSS3 + TypeScript |
| 3D描画 | Three.js (v0.182.0) |
| ビルドツール | Vite (v7.3.1) |
| デプロイ先 | GitHub Pages（静的ホスティング、サーバーサイド処理なし） |

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド (dist/ に出力)
npm run preview  # ビルド結果プレビュー
```

## 単位系

| 種別 | 単位 |
|------|------|
| 長さ | cm |
| 力 | kN |
| モーメント | kN*cm |
| 応力 | kN/cm² |

## 座標系

- **X**: 水平（右方向）
- **Y**: 水平（奥行方向）
- **Z**: 鉛直（上方向）

---

## プロジェクト構成

```
FrameModelMaker-Web/
├── index.html              # エントリポイント
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts             # アプリケーション初期化・メニュー・タブ管理
│   ├── models/             # データモデル
│   │   ├── Node.ts
│   │   ├── Member.ts
│   │   ├── Section.ts
│   │   ├── Material.ts
│   │   ├── BoundaryCondition.ts
│   │   ├── Spring.ts
│   │   ├── Wall.ts
│   │   ├── NodeLoad.ts
│   │   ├── CMQLoad.ts
│   │   ├── MemberLoad.ts
│   │   └── FrameDocument.ts  # 全データを統括
│   ├── io/                 # ファイル入出力
│   │   ├── StructFormParser.ts   # .dat ファイル読込
│   │   └── StructFormWriter.ts   # .dat ファイル書出
│   ├── viewer/             # 3D ビューア
│   │   └── ModelViewer.ts    # Three.js メインビュー
│   ├── ui/                 # UIコンポーネント
│   │   └── DataGrid.ts       # 汎用編集可能データグリッド
│   └── styles/
│       └── main.css
├── public/
│   └── samples/
│       └── StructForm_SampleData1_Ver8.dat  # サンプルデータ
├── SampleData/             # テスト用追加データ
│   ├── plantest/           # 構面テスト用 CSV
│   ├── StructForm_SampleData1_Ver8.dat
│   └── test.out            # 解析結果出力サンプル
└── dist/                   # ビルド出力（GitHub Pages用）
```

---

## 機能一覧

### 実装済み機能

#### ファイル操作
- **新規作成**: ドキュメント初期化
- **開く**: `.dat` ファイルを `<input type="file">` で読込（Shift_JIS / UTF-8 対応）
- **保存**: StructForm フォーマットで Blob ダウンロード
- **サンプル読込**: 内蔵サンプルデータ読込

#### 表示制御
- 節点番号表示の切替
- 部材番号表示の切替
- 3Dビュー操作（回転・平行移動・ズーム）

#### 編集操作
- **ソート**: 節点はZ→Y→X順、部材はI端Z順でソート
- **番号再割当**: 番号を1から振り直す
- **重複ノード統合**: しきい値（2.0 cm）以内のノードをマージ

#### 荷重定義管理
- 荷重定義の追加・削除
- 荷重定義の切替（ドロップダウン）

#### データ編集（タブ切替式データグリッド）
- 節点 / 境界条件 / 材料 / 断面 / バネ / 部材 / 壁 / 節点荷重 / CMQ荷重 / 部材荷重

### 未実装機能（将来拡張）
- 構面リスト管理
- 2D CADビュー
- マウス操作による節点・部材追加
- コピー・削除ダイアログ
- 時刻歴データ表示・アニメーション
- 壁番号表示

---

## データモデル仕様

### Node（節点）

```typescript
interface Node {
  number: number;          // 節点番号（1始まり）
  x: number;               // X座標 (cm)
  y: number;               // Y座標 (cm)
  z: number;               // Z座標 (cm)
  temperature: number;     // 節点温度（デフォルト0）
  intensityGroup: number;  // 震度グループ番号（デフォルト0）
  longWeight: number;      // 長期荷重用節点重量（デフォルト0）
  forceWeight: number;     // 地震力算定用節点重量（デフォルト0）
  addForceWeight: number;  // 地震力算定用節点付加重量（デフォルト0）
  area: number;            // 面積 cm²（デフォルト0）
  boundaryCondition: BoundaryCondition | null;
  loads: NodeLoad[];       // 荷重定義ごとの節点荷重
}
```

### Member（部材）

```typescript
interface Member {
  number: number;          // 部材番号
  iNodeNumber: number;     // I端節点番号
  jNodeNumber: number;     // J端節点番号
  ixSpring: number;        // I端接合X バネ番号
  iySpring: number;        // I端接合Y バネ番号
  izSpring: number;        // I端接合Z バネ番号
  jxSpring: number;        // J端接合X バネ番号
  jySpring: number;        // J端接合Y バネ番号
  jzSpring: number;        // J端接合Z バネ番号
  sectionNumber: number;   // 断面番号
  p1: number;              // パラメータ P1
  p2: number;              // パラメータ P2
  p3: number;              // パラメータ P3
  memberLoads: MemberLoad[];  // 荷重定義ごとの部材荷重
  cmqLoads: CMQLoad[];        // 荷重定義ごとのCMQ荷重
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
  I_Steel = 5,     // I形鋼
  H_Steel = 6      // H形鋼
}

interface Section {
  number: number;
  materialNumber: number;  // 材料番号
  type: SectionType;
  shape: SectionShape;
  p1_A: number;            // 断面積 (cm²)
  p2_Ix: number;           // 断面二次モーメント Ix
  p3_Iy: number;           // 断面二次モーメント Iy
  p4_Iz: number;           // 断面二次モーメント Iz
  ky: number;              // せん断面積比 Ky
  kz: number;              // せん断面積比 Kz
  comment: string;         // コメント
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
  name: string;       // 材料名
}
```

### BoundaryCondition（境界条件）

```typescript
interface BoundaryCondition {
  nodeNumber: number;  // 対応する節点番号
  deltaX: number;      // X方向変位拘束 (0:自由, 1:固定)
  deltaY: number;      // Y方向変位拘束
  deltaZ: number;      // Z方向変位拘束
  thetaX: number;      // X軸回転拘束
  thetaY: number;      // Y軸回転拘束
  thetaZ: number;      // Z軸回転拘束
}
```

### Spring（部材端バネ）

```typescript
interface Spring {
  number: number;
  method: number;      // 方式
  kTheta: number;      // 回転バネ定数
}

// デフォルトバネ（常に存在）
// 剛接合: number=1, method=0, kTheta=0
// ピン接合: number=2, method=0, kTheta=0
```

### Wall（壁エレメント）

```typescript
interface Wall {
  number: number;
  leftBottomNode: number;   // 左下節点番号
  rightBottomNode: number;  // 右下節点番号
  leftTopNode: number;      // 左上節点番号
  rightTopNode: number;     // 右上節点番号
  materialNumber: number;   // 材料番号
  method: number;           // 方式
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}
```

### NodeLoad（節点荷重）

```typescript
interface NodeLoad {
  nodeNumber: number;
  p1: number;  // X方向力 (kN)
  p2: number;  // Y方向力 (kN)
  p3: number;  // Z方向力 (kN)
  m1: number;  // X軸モーメント (kN*cm)
  m2: number;  // Y軸モーメント (kN*cm)
  m3: number;  // Z軸モーメント (kN*cm)
}
```

### CMQLoad（CMQ荷重）

```typescript
interface CMQLoad {
  memberNumber: number;
  moy: number;
  moz: number;
  iMy: number; iMz: number;
  iQx: number; iQy: number; iQz: number;
  jMy: number; jMz: number;
  jQx: number; jQy: number; jQz: number;
}
```

### MemberLoad（部材荷重）

```typescript
interface MemberLoad {
  memberNumber: number;
  lengthMethod: number;
  type: number;
  direction: number;
  scale: number;
  loadCode: string;
  unitLoad: number;
  p1: number;
  p2: number;
  p3: number;
}
```

### FrameDocument（ドキュメント統括クラス）

全データを保持し、以下の操作を提供する。

| メソッド | 説明 |
|---------|------|
| `init()` | 全リストをクリアし初期化 |
| `assignNumbers()` | 全要素の番号を1から再割当 |
| `sort()` | 節点はZ→Y→X順、部材はI端Z順でソート |
| `mergeOverlappingNodes(threshold)` | 距離threshold以内のノードを統合 |
| `addLoadCase()` | 荷重定義を追加 |
| `removeLoadCase(index)` | 荷重定義を削除 |

---

## StructForm ファイルフォーマット仕様

テキスト形式、Shift_JIS エンコーディング（Webでは UTF-8 で読み書きし、必要に応じ変換）。
区切り文字はカンマ `,`。

### ファイル構造

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
    （省略可、デフォルト値を出力）
SECTION
    番号,材料番号,Type,Shape,P1_A,P2_Ix,P3_Iy,P4_Iz,,,Ky,Kz,,,,,0,0,,,,,Comment
    ...
MEM1-SPRING
    番号,Method,K_Theta
    ...
MEMBER
    番号,I端番号,J端番号,Ix,Iy,Iz,Jx,Jy,Jz,断面番号,    0,5,P1,P2,P3,,,,,,,,,,,,,,,
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
    部材番号,LengthMethod,Type,Direction,Scale,LoadCode,UnitLoad,P1,P2,P3,,,,,
    ...
CALCULATION-CASE
    荷重組合せ情報行...
STOP
```

### パース時の注意点

1. 各セクションは `NODE`, `BOUNDARY`, `MATERIAL` 等のキーワード行で区切られる
2. `M-CONTROL` セクションは行数不定 → `NODE` キーワードが出るまでスキップ
3. `M-MATERIAL` セクションも同様 → `SECTION` キーワードまでスキップ
4. `MEM1-SPRING` セクションが存在しない場合がある → `MEMBER` キーワードで直接移行
5. `WALL` セクションが存在しない場合がある → `AI-LOAD` へ直接移行
6. 空文字列のフィールドは 0 として扱う
7. 数値は科学記数法（例: `6.384E+00`）を含む場合がある
8. LOAD-DEFINITION は複数回繰り返される（荷重定義数分）
9. 各 LOAD-DEFINITION 内に F-NODE, F-CMQ, F-MEMBER が順に出現する
10. ゼロの荷重は出力しない（IsZero チェック）

### 数値フォーマット（書出時）

- 浮動小数点の科学記数法: `value.toExponential(3).toUpperCase()` → `6.384E+00`
- 整数の右寄せ: `String(number).padStart(5, ' ')`

---

## UI レイアウト

### メイン画面構成

```
┌─────────────────────────────────────────────────────────┐
│ メニューバー                                              │
│ [ファイル] [表示] [編集] [荷重定義]                          │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│   3Dモデルビュー      │  データグリッドパネル               │
│   (Three.js)         │  (タブ切替)                       │
│                      │                                  │
│   マウス操作:         │  [節点|部材|断面|材料|境界|バネ|壁|  │
│   左ドラッグ = 回転    │   節点荷重|CMQ荷重|部材荷重]       │
│   右ドラッグ = 移動    │                                  │
│   ホイール = ズーム    │  ┌──────────────────────────┐    │
│                      │  │ 編集可能テーブル            │    │
│                      │  │                            │    │
│                      │  └──────────────────────────┘    │
│                      │                                  │
├──────────────────────┴──────────────────────────────────┤
│ ステータスバー                                            │
└─────────────────────────────────────────────────────────┘
```

### メニュー構成

| メニュー | 項目 | 動作 |
|---------|------|------|
| ファイル | 新規作成 | ドキュメント初期化 |
| | 開く | `.dat` ファイルを読込 |
| | 保存 | StructForm フォーマットでダウンロード |
| | サンプル読込 | 内蔵サンプルデータを読込 |
| 表示 | 節点番号表示 | 3Dビュー上の番号表示切替 |
| | 部材番号表示 | 3Dビュー上の番号表示切替 |
| 編集 | ソート | 節点・部材を座標順にソート |
| | 番号再割当 | 番号を1から振り直す |
| | 重複ノード統合 | しきい値以内のノードをマージ |
| 荷重定義 | 荷重定義追加 | 新しい荷重定義を追加 |
| | 荷重定義削除 | 現在の荷重定義を削除 |
| | 荷重定義切替 | ドロップダウンで選択 |

---

## 3D ビュー仕様 (Three.js)

### 描画要素

| 要素 | 描画方法 | 色 |
|------|---------|-----|
| 節点 | Points（8px） | 青 (0, 0.3, 0.8)、選択時は赤 |
| 部材 | LineSegments（I端→J端） | 青、選択時は赤 |
| 壁 | 四角形メッシュ（半透明） | 0x88aacc (opacity 0.3) |
| 境界条件 | 三角形シンボル | 緑 |
| 番号ラベル | Canvas 2Dオーバーレイ | 節点=青、部材=オレンジ |

### マウス操作

| 操作 | 動作 |
|------|------|
| 左ドラッグ | ビュー回転（Orbit） |
| 右ドラッグ | ビュー平行移動（Pan） |
| ホイール | ズーム |

### ビュー制御

- OrbitControls ベースのカメラ制御
- Z軸を上方向に設定
- フィット・トゥ・ビュー機能（全モデルを画面内に収める）
- グリッドヘルパー（XY平面）
- 軸ヘルパー（RGB = XYZ）

---

## データグリッド列定義

### 節点テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 節点番号 | number | int |
| X座標 cm | x | number |
| Y座標 cm | y | number |
| Z座標 cm | z | number |
| 節点温度 | temperature | number |
| 震度グループ | intensityGroup | int |
| 長期荷重用重量 | longWeight | number |
| 地震力用重量 | forceWeight | number |
| 付加重量 | addForceWeight | number |
| 面積 cm² | area | number |

### 部材テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 部材番号 | number | int |
| I端 | iNodeNumber | int |
| J端 | jNodeNumber | int |
| Ix | ixSpring | int |
| Iy | iySpring | int |
| Iz | izSpring | int |
| Jx | jxSpring | int |
| Jy | jySpring | int |
| Jz | jzSpring | int |
| 断面記号 | sectionNumber | int |
| P1 | p1 | number |
| P2 | p2 | number |
| P3 | p3 | number |

### 断面テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 断面番号 | number | int |
| 材料番号 | materialNumber | int |
| 部材種別 | type | int |
| 断面形状 | shape | int |
| 断面積 A | p1_A | number |
| Ix | p2_Ix | number |
| Iy | p3_Iy | number |
| Iz | p4_Iz | number |
| Ky | ky | number |
| Kz | kz | number |
| コメント | comment | text |

### 材料テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 材料番号 | number | int |
| ヤング係数 | young | number |
| せん断弾性係数 | shear | number |
| 熱膨張係数 | expansion | number |
| ポアソン比 | poisson | number |
| 単位荷重 | unitLoad | number |
| 材料名 | name | text |

### 境界条件テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 節点番号 | nodeNumber | int |
| DeltaX | deltaX | int |
| DeltaY | deltaY | int |
| DeltaZ | deltaZ | int |
| ThetaX | thetaX | int |
| ThetaY | thetaY | int |
| ThetaZ | thetaZ | int |

### バネテーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| バネ番号 | number | int |
| 方式 | method | int |
| 回転バネ定数 | kTheta | number |

### 壁テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 壁番号 | number | int |
| 左下節点 | leftBottomNode | int |
| 右下節点 | rightBottomNode | int |
| 左上節点 | leftTopNode | int |
| 右上節点 | rightTopNode | int |
| 材料番号 | materialNumber | int |
| 方式 | method | int |
| P1 | p1 | number |
| P2 | p2 | number |
| P3 | p3 | number |
| P4 | p4 | number |

### 節点荷重テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 節点番号 | nodeNumber | int |
| P1 (X方向力 kN) | p1 | number |
| P2 (Y方向力 kN) | p2 | number |
| P3 (Z方向力 kN) | p3 | number |
| M1 (X軸モーメント) | m1 | number |
| M2 (Y軸モーメント) | m2 | number |
| M3 (Z軸モーメント) | m3 | number |

### CMQ荷重テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 部材番号 | memberNumber | int |
| Moy | moy | number |
| Moz | moz | number |
| iMy | iMy | number |
| iMz | iMz | number |
| iQx | iQx | number |
| iQy | iQy | number |
| iQz | iQz | number |
| jMy | jMy | number |
| jMz | jMz | number |
| jQx | jQx | number |
| jQy | jQy | number |
| jQz | jQz | number |

### 部材荷重テーブル

| 列名 | プロパティ | 型 |
|------|-----------|-----|
| 部材番号 | memberNumber | int |
| 長さ方式 | lengthMethod | int |
| 種別 | type | int |
| 方向 | direction | int |
| 倍率 | scale | number |
| 荷重コード | loadCode | text |
| 単位荷重 | unitLoad | number |
| P1 | p1 | number |
| P2 | p2 | number |
| P3 | p3 | number |

---

## ファイルI/O実装仕様

### 読込（StructFormParser）

Web でのファイル読込:
```typescript
const file = event.target.files[0];
const text = await file.text();
// Shift_JISの場合は TextDecoder('shift_jis') を使用
```

パース順序:
1. `START` → バージョン確認
2. `TITLE` → タイトル取得（クォート除去）
3. `CONTROL` → 1行スキップ
4. `M-CONTROL` → `NODE`キーワードまでスキップ
5. `NODE` → `BOUNDARY`キーワードまで各行をパース
6. `BOUNDARY` → 1行スキップ後、`MATERIAL`まで
7. `MATERIAL` → `M-MATERIAL`まで
8. `M-MATERIAL` → `SECTION`までスキップ
9. `SECTION` → `MEM1-SPRING` または `MEMBER`まで
10. `MEM1-SPRING` → `MEMBER`まで
11. `MEMBER` → `WALL` または `AI-LOAD`まで
12. `WALL` → `AI-LOAD`まで
13. `AI-LOAD` → `LOAD-DEFINITION`まで
14. `LOAD-DEFINITION` → 繰り返しパース（F-NODE, F-CMQ, F-MEMBER）
15. `CALCULATION-CASE` → `STOP`まで（そのまま保存）
16. `STOP` → 終了

### 書出（StructFormWriter）

Web でのファイル保存:
```typescript
const blob = new Blob([content], { type: 'text/plain;charset=shift_jis' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'model.dat';
a.click();
```

---

## サンプルデータ

`StructForm_SampleData1_Ver8.dat`:
- 約150ノード（3階建て建物モデル）
- Z座標: 38.00, 312.50, 599.50, 886.50（各階の高さ cm）
- 8つの荷重定義
- 壁エレメントあり
- CALCULATION-CASE セクションあり

---

## テスト指針

1. **パーサーテスト**: サンプルデータ読込 → 書出 → 再読込 → データ一致確認
2. **3Dビューテスト**: サンプルデータ読込後にモデルが正しく表示されるか
3. **編集テスト**: グリッドでデータ変更 → 3Dビュー更新 → ファイル保存 → 値一致確認
4. **空データテスト**: 新規作成 → ノード・部材を手動追加 → 保存 → 再読込
5. **荷重定義テスト**: 荷重定義の追加・削除・切替が正しく動作するか

---

## 制約事項

1. GitHub Pages は静的ホスティングのみ → サーバー処理なし、全処理はクライアントサイド
2. Shift_JIS エンコーディングの処理は `TextDecoder('shift_jis')` で対応
3. ファイルの「開く」は `<input type="file">`、「保存」は Blob ダウンロード
4. Spring のデフォルト値（剛接合=1、ピン接合=2）は常に存在する前提
5. 番号体系は元アプリに準拠（1始まり、連番不要）
