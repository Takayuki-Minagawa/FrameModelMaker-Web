import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FrameDocument } from '../models/FrameDocument';

// ===== 定数 =====
const CAMERA_FOV = 45;
const CAMERA_NEAR = 1;
const CAMERA_FAR = 100000;
const CAMERA_INITIAL_POS = { x: 500, y: -1000, z: 800 };

const GRID_SIZE = 2000;
const GRID_DIVISIONS = 20;
const AXIS_HELPER_SIZE = 200;

// テーマ別カラー
const THEME = {
  light: {
    background: 0xf0f0f0,
    gridCenter: 0xcccccc,
    gridLine: 0xeeeeee,
    labelNode: '#0044aa',
    labelMember: '#aa4400',
  },
  dark: {
    background: 0x252535,
    gridCenter: 0x3a3a4a,
    gridLine: 0x333344,
    labelNode: '#66aaff',
    labelMember: '#ffaa66',
  },
} as const;

const NODE_POINT_SIZE = 8;
const NODE_COLOR_DEFAULT: [number, number, number] = [0, 0.3, 0.8];
const NODE_COLOR_SELECTED: [number, number, number] = [1, 0, 0];
const MEMBER_COLOR_DEFAULT: [number, number, number] = [0, 0.3, 0.8];
const MEMBER_COLOR_SELECTED: [number, number, number] = [1, 0, 0];
const CLICK_DRAG_THRESHOLD_PX = 4;
const NODE_PICK_RADIUS_PX = 10;
const MEMBER_PICK_RADIUS_PX = 8;

const BOUNDARY_SYMBOL_SIZE = 12;
const BOUNDARY_SYMBOL_COLOR = 0x00aa00;
const BOUNDARY_SYMBOL_OPACITY = 0.6;

const WALL_FILL_COLOR = 0x88aacc;
const WALL_FILL_OPACITY = 0.3;
const WALL_EDGE_COLOR = 0x4477aa;

const LABEL_FONT = '11px sans-serif';

export type ViewerSelection =
  | { kind: 'none' }
  | { kind: 'node'; nodeNumber: number }
  | { kind: 'member'; memberNumber: number };

export class ModelViewer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;

  private nodeGroup: THREE.Group;
  private memberGroup: THREE.Group;
  private wallGroup: THREE.Group;
  private labelGroup: THREE.Group;

  private grid: THREE.GridHelper;

  private doc: FrameDocument;
  private isDark: boolean = false;

  showNodeNumbers: boolean = false;
  showMemberNumbers: boolean = false;
  showWallNumbers: boolean = false;

  private labelCanvas: HTMLCanvasElement;
  private labelCtx: CanvasRenderingContext2D;
  private onResizeBound: () => void;
  private animationId: number = 0;
  private selectedNodeNumber: number | null = null;
  private selectedMemberNumber: number | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;
  private selectionChangedHandler: ((selection: ViewerSelection) => void) | null = null;

  constructor(container: HTMLElement, doc: FrameDocument) {
    this.container = container;
    this.doc = doc;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEME.light.background);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.set(CAMERA_INITIAL_POS.x, CAMERA_INITIAL_POS.y, CAMERA_INITIAL_POS.z);
    this.camera.up.set(0, 0, 1);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // 2D ラベル用オーバーレイキャンバス
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this.labelCanvas.width = container.clientWidth;
    this.labelCanvas.height = container.clientHeight;
    container.appendChild(this.labelCanvas);
    this.labelCtx = this.labelCanvas.getContext('2d')!;

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    // Z軸を上方向に設定
    this.controls.target.set(0, 0, 0);

    // Groups
    this.nodeGroup = new THREE.Group();
    this.memberGroup = new THREE.Group();
    this.wallGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);
    this.scene.add(this.memberGroup);
    this.scene.add(this.wallGroup);
    this.scene.add(this.labelGroup);

    // グリッド（XY平面、Z=0）
    this.grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, THEME.light.gridCenter, THEME.light.gridLine);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);

    // 軸ヘルパー
    const axes = new THREE.AxesHelper(AXIS_HELPER_SIZE);
    this.scene.add(axes);

    // リサイズ対応
    this.onResizeBound = () => this.onResize();
    window.addEventListener('resize', this.onResizeBound);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);

    // アニメーションループ
    this.animate();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  };

  /** コンテナサイズ変更時にレンダラとカメラを更新 */
  resize(): void {
    this.onResize();
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelCanvas.width = w;
    this.labelCanvas.height = h;
  }

  /** モデル全体が表示されるようカメラを調整 */
  fitToView(): void {
    if (this.doc.nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const n of this.doc.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const maxDim = Math.max(dx, dy, dz, 100);

    this.controls.target.set(cx, cy, cz);
    this.camera.position.set(cx + maxDim, cy - maxDim * 1.2, cz + maxDim * 0.8);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** モデルを再描画 */
  updateModel(fitToView: boolean = true): void {
    this.clearGroups();
    this.drawNodes();
    this.drawMembers();
    this.drawWalls();
    if (fitToView) {
      this.fitToView();
    }
  }

  private clearGroups(): void {
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.memberGroup);
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.labelGroup);
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }

  private drawNodes(): void {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const node of this.doc.nodes) {
      positions.push(node.x, node.y, node.z);
      if (node.selected || this.selectedNodeNumber === node.number) {
        colors.push(...NODE_COLOR_SELECTED);
      } else {
        colors.push(...NODE_COLOR_DEFAULT);
      }
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: NODE_POINT_SIZE,
      sizeAttenuation: false,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    this.nodeGroup.add(points);

    // 境界条件のシンボル描画
    for (const bc of this.doc.boundaries) {
      const node = this.doc.findNodeByNumber(bc.nodeNumber);
      if (!node) continue;

      const isFixed = bc.deltaX !== 0 || bc.deltaY !== 0 || bc.deltaZ !== 0;
      if (isFixed) {
        const triGeo = new THREE.BufferGeometry();
        const v = [
          node.x, node.y, node.z - BOUNDARY_SYMBOL_SIZE,
          node.x - BOUNDARY_SYMBOL_SIZE * 0.7, node.y, node.z - BOUNDARY_SYMBOL_SIZE * 2,
          node.x + BOUNDARY_SYMBOL_SIZE * 0.7, node.y, node.z - BOUNDARY_SYMBOL_SIZE * 2,
        ];
        triGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        triGeo.setIndex([0, 1, 2]);
        const triMat = new THREE.MeshBasicMaterial({
          color: BOUNDARY_SYMBOL_COLOR,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: BOUNDARY_SYMBOL_OPACITY,
        });
        const tri = new THREE.Mesh(triGeo, triMat);
        this.nodeGroup.add(tri);
      }
    }
  }

  private drawMembers(): void {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const mem of this.doc.members) {
      const iNode = this.doc.findNodeByNumber(mem.iNodeNumber);
      const jNode = this.doc.findNodeByNumber(mem.jNodeNumber);
      if (!iNode || !jNode) continue;

      positions.push(iNode.x, iNode.y, iNode.z);
      positions.push(jNode.x, jNode.y, jNode.z);

      const color = (mem.selected || this.selectedMemberNumber === mem.number)
        ? MEMBER_COLOR_SELECTED
        : MEMBER_COLOR_DEFAULT;
      colors.push(...color, ...color);
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
    });

    const lines = new THREE.LineSegments(geometry, material);
    this.memberGroup.add(lines);
  }

  private drawWalls(): void {
    for (const wall of this.doc.walls) {
      const lb = this.doc.findNodeByNumber(wall.leftBottomNode);
      const rb = this.doc.findNodeByNumber(wall.rightBottomNode);
      const lt = this.doc.findNodeByNumber(wall.leftTopNode);
      const rt = this.doc.findNodeByNumber(wall.rightTopNode);
      if (!lb || !rb || !lt || !rt) continue;

      const geometry = new THREE.BufferGeometry();
      const positions = [
        lb.x, lb.y, lb.z,
        rb.x, rb.y, rb.z,
        rt.x, rt.y, rt.z,
        lt.x, lt.y, lt.z,
      ];
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);

      const material = new THREE.MeshBasicMaterial({
        color: WALL_FILL_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: WALL_FILL_OPACITY,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.wallGroup.add(mesh);

      // 壁のエッジ線
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        ...positions, lb.x, lb.y, lb.z
      ], 3));
      const edgeMat = new THREE.LineBasicMaterial({ color: WALL_EDGE_COLOR });
      const edgeLine = new THREE.LineLoop(edgeGeo, edgeMat);
      this.wallGroup.add(edgeLine);
    }
  }

  /** 3D座標を2Dスクリーン座標に変換（カメラ背面の場合null） */
  private projectToScreen(worldPos: THREE.Vector3, tempVec: THREE.Vector3): { x: number; y: number } | null {
    tempVec.copy(worldPos);
    tempVec.project(this.camera);
    if (tempVec.z <= 0 || tempVec.z >= 1) return null;
    return {
      x: (tempVec.x * 0.5 + 0.5) * this.labelCanvas.width,
      y: (-tempVec.y * 0.5 + 0.5) * this.labelCanvas.height,
    };
  }

  /** 2Dラベル描画 */
  private drawLabels(): void {
    this.labelCtx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

    if (!this.showNodeNumbers && !this.showMemberNumbers && !this.showWallNumbers) return;

    this.labelCtx.font = LABEL_FONT;
    this.labelCtx.textAlign = 'center';
    this.labelCtx.textBaseline = 'bottom';

    const tempVec = new THREE.Vector3();
    const worldPos = new THREE.Vector3();

    if (this.showNodeNumbers) {
      const colors = this.isDark ? THEME.dark : THEME.light;
      this.labelCtx.fillStyle = colors.labelNode;
      for (const node of this.doc.nodes) {
        worldPos.set(node.x, node.y, node.z);
        const screen = this.projectToScreen(worldPos, tempVec);
        if (screen) {
          this.labelCtx.fillText(String(node.number), screen.x, screen.y - 6);
        }
      }
    }

    if (this.showMemberNumbers) {
      const colors = this.isDark ? THEME.dark : THEME.light;
      this.labelCtx.fillStyle = colors.labelMember;
      for (const mem of this.doc.members) {
        const iNode = this.doc.findNodeByNumber(mem.iNodeNumber);
        const jNode = this.doc.findNodeByNumber(mem.jNodeNumber);
        if (!iNode || !jNode) continue;
        worldPos.set(
          (iNode.x + jNode.x) / 2,
          (iNode.y + jNode.y) / 2,
          (iNode.z + jNode.z) / 2
        );
        const screen = this.projectToScreen(worldPos, tempVec);
        if (screen) {
          this.labelCtx.fillText(String(mem.number), screen.x, screen.y - 4);
        }
      }
    }
  }

  setOnSelectionChanged(handler: ((selection: ViewerSelection) => void) | null): void {
    this.selectionChangedHandler = handler;
  }

  clearSelection(notify: boolean = true): void {
    this.setSelection({ kind: 'none' }, notify);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.pointerDownPos) return;

    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;

    if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_PX * CLICK_DRAG_THRESHOLD_PX) return;
    this.handleClick(e.clientX, e.clientY);
  };

  private handleClick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    const nodeHit = this.pickNodeAtScreen(x, y);
    const memberHit = this.pickMemberAtScreen(x, y);
    if (nodeHit && memberHit) {
      const nodeScore = nodeHit.distanceSq / (NODE_PICK_RADIUS_PX * NODE_PICK_RADIUS_PX);
      const memberScore = memberHit.distanceSq / (MEMBER_PICK_RADIUS_PX * MEMBER_PICK_RADIUS_PX);
      if (nodeScore <= memberScore) {
        this.setSelection({ kind: 'node', nodeNumber: nodeHit.nodeNumber });
      } else {
        this.setSelection({ kind: 'member', memberNumber: memberHit.memberNumber });
      }
      return;
    }

    if (nodeHit) {
      this.setSelection({ kind: 'node', nodeNumber: nodeHit.nodeNumber });
      return;
    }

    if (memberHit) {
      this.setSelection({ kind: 'member', memberNumber: memberHit.memberNumber });
      return;
    }

    this.clearSelection();
  }

  private pickNodeAtScreen(x: number, y: number): { nodeNumber: number; distanceSq: number } | null {
    const tempVec = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    let best: { nodeNumber: number; distanceSq: number } | null = null;
    const radiusSq = NODE_PICK_RADIUS_PX * NODE_PICK_RADIUS_PX;

    for (const node of this.doc.nodes) {
      worldPos.set(node.x, node.y, node.z);
      const screen = this.projectToScreen(worldPos, tempVec);
      if (!screen) continue;

      const dx = screen.x - x;
      const dy = screen.y - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq) continue;
      if (!best || distanceSq < best.distanceSq) {
        best = { nodeNumber: node.number, distanceSq };
      }
    }

    return best;
  }

  private pickMemberAtScreen(x: number, y: number): { memberNumber: number; distanceSq: number } | null {
    const nodeMap = new Map(this.doc.nodes.map(node => [node.number, node] as const));
    const tempVec = new THREE.Vector3();
    const iPos = new THREE.Vector3();
    const jPos = new THREE.Vector3();
    let best: { memberNumber: number; distanceSq: number } | null = null;
    const radiusSq = MEMBER_PICK_RADIUS_PX * MEMBER_PICK_RADIUS_PX;

    for (const member of this.doc.members) {
      const iNode = nodeMap.get(member.iNodeNumber);
      const jNode = nodeMap.get(member.jNodeNumber);
      if (!iNode || !jNode) continue;

      iPos.set(iNode.x, iNode.y, iNode.z);
      jPos.set(jNode.x, jNode.y, jNode.z);
      const a = this.projectToScreen(iPos, tempVec);
      const b = this.projectToScreen(jPos, tempVec);
      if (!a || !b) continue;

      const distanceSq = this.pointToSegmentDistanceSq(x, y, a.x, a.y, b.x, b.y);
      if (distanceSq > radiusSq) continue;
      if (!best || distanceSq < best.distanceSq) {
        best = { memberNumber: member.number, distanceSq };
      }
    }

    return best;
  }

  private pointToSegmentDistanceSq(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq <= 1e-8) {
      const dx = px - ax;
      const dy = py - ay;
      return dx * dx + dy * dy;
    }

    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
    const qx = ax + t * abx;
    const qy = ay + t * aby;
    const dx = px - qx;
    const dy = py - qy;
    return dx * dx + dy * dy;
  }

  private setSelection(selection: ViewerSelection, notify: boolean = true): void {
    const nextNode = selection.kind === 'node' ? selection.nodeNumber : null;
    const nextMember = selection.kind === 'member' ? selection.memberNumber : null;
    const changed = nextNode !== this.selectedNodeNumber || nextMember !== this.selectedMemberNumber;

    this.selectedNodeNumber = nextNode;
    this.selectedMemberNumber = nextMember;

    if (changed) {
      this.updateModel(false);
    }

    if (notify) {
      this.selectionChangedHandler?.(selection);
    }
  }

  /** ダーク/ライトテーマを切替 */
  setTheme(dark: boolean): void {
    this.isDark = dark;
    const colors = dark ? THEME.dark : THEME.light;

    // 背景色
    (this.scene.background as THREE.Color).set(colors.background);

    // グリッド色を更新
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, colors.gridCenter, colors.gridLine);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResizeBound);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.clearGroups();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelCanvas.remove();
  }
}
