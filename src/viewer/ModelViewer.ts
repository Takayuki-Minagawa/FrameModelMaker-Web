import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FrameDocument } from '../models/FrameDocument';

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

  private doc: FrameDocument;

  showNodeNumbers: boolean = false;
  showMemberNumbers: boolean = false;
  showWallNumbers: boolean = false;

  private labelCanvas: HTMLCanvasElement;
  private labelCtx: CanvasRenderingContext2D;

  constructor(container: HTMLElement, doc: FrameDocument) {
    this.container = container;
    this.doc = doc;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 100000);
    this.camera.position.set(500, -1000, 800);
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
    const grid = new THREE.GridHelper(2000, 20, 0xcccccc, 0xeeeeee);
    grid.rotation.x = Math.PI / 2;
    this.scene.add(grid);

    // 軸ヘルパー
    const axes = new THREE.AxesHelper(200);
    this.scene.add(axes);

    // リサイズ対応
    window.addEventListener('resize', () => this.onResize());

    // アニメーションループ
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  };

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
  updateModel(): void {
    this.clearGroups();
    this.drawNodes();
    this.drawMembers();
    this.drawWalls();
    this.fitToView();
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
      if (node.selected) {
        colors.push(1, 0, 0); // 赤
      } else {
        colors.push(0, 0.3, 0.8); // 青
      }
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 8,
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
        const size = 12;
        const triGeo = new THREE.BufferGeometry();
        const v = [
          node.x, node.y, node.z - size,
          node.x - size * 0.7, node.y, node.z - size * 2,
          node.x + size * 0.7, node.y, node.z - size * 2,
        ];
        triGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        triGeo.setIndex([0, 1, 2]);
        const triMat = new THREE.MeshBasicMaterial({
          color: 0x00aa00,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
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

      const color = mem.selected ? [1, 0, 0] : [0, 0.3, 0.8];
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
        color: 0x88aacc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.wallGroup.add(mesh);

      // 壁のエッジ線
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        ...positions, lb.x, lb.y, lb.z
      ], 3));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x4477aa });
      const edgeLine = new THREE.LineLoop(edgeGeo, edgeMat);
      this.wallGroup.add(edgeLine);
    }
  }

  /** 2Dラベル描画 */
  private drawLabels(): void {
    this.labelCtx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

    if (!this.showNodeNumbers && !this.showMemberNumbers && !this.showWallNumbers) return;

    this.labelCtx.font = '11px sans-serif';
    this.labelCtx.textAlign = 'center';
    this.labelCtx.textBaseline = 'bottom';

    const tempVec = new THREE.Vector3();

    if (this.showNodeNumbers) {
      this.labelCtx.fillStyle = '#0044aa';
      for (const node of this.doc.nodes) {
        tempVec.set(node.x, node.y, node.z);
        tempVec.project(this.camera);
        const sx = (tempVec.x * 0.5 + 0.5) * this.labelCanvas.width;
        const sy = (-tempVec.y * 0.5 + 0.5) * this.labelCanvas.height;
        if (tempVec.z > 0 && tempVec.z < 1) {
          this.labelCtx.fillText(String(node.number), sx, sy - 6);
        }
      }
    }

    if (this.showMemberNumbers) {
      this.labelCtx.fillStyle = '#aa4400';
      for (const mem of this.doc.members) {
        const iNode = this.doc.findNodeByNumber(mem.iNodeNumber);
        const jNode = this.doc.findNodeByNumber(mem.jNodeNumber);
        if (!iNode || !jNode) continue;
        const cx = (iNode.x + jNode.x) / 2;
        const cy = (iNode.y + jNode.y) / 2;
        const cz = (iNode.z + jNode.z) / 2;
        tempVec.set(cx, cy, cz);
        tempVec.project(this.camera);
        const sx = (tempVec.x * 0.5 + 0.5) * this.labelCanvas.width;
        const sy = (-tempVec.y * 0.5 + 0.5) * this.labelCanvas.height;
        if (tempVec.z > 0 && tempVec.z < 1) {
          this.labelCtx.fillText(String(mem.number), sx, sy - 4);
        }
      }
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.controls.dispose();
  }
}
