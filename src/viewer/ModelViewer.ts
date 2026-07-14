import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FrameDocument } from '../models/FrameDocument';
import type { Member } from '../models/Member';
import type { Node } from '../models/Node';
import {
  calculateBounds,
  colorForKey,
  pointInPolygon,
  pointToSegmentDistanceSq,
  snapPoint,
  thinLabelCandidates,
  type Bounds3,
  type LabelCandidate,
} from './ViewerMath';
import type {
  AnalysisResultFrame,
  AnalysisResultSet,
  ColorLegendEntry,
  DrawingEvent,
  DrawingMode,
  DrawingOptions,
  LabelDensityOptions,
  LoadDisplayOptions,
  LoadGlyphProvider,
  MemberColorContext,
  MemberColorMode,
  MemberColorResolver,
  ProjectionMode,
  ResultAnimationOptions,
  ResultDisplayOptions,
  SelectionDisplayMode,
  StandardView,
  Vector3Tuple,
  ViewerCameraState,
  ViewerGlyph,
  ViewerLayers,
  ViewerSelection,
  ViewMode,
} from './ViewerTypes';

export type {
  AnalysisResultFrame,
  AnalysisResultSet,
  ColorLegendEntry,
  DrawingEvent,
  DrawingMode,
  DrawingOptions,
  LabelDensityOptions,
  LoadDisplayOptions,
  LoadGlyphProvider,
  MemberColorContext,
  MemberColorMode,
  MemberColorResolver,
  ProjectionMode,
  ResultAnimationOptions,
  ResultDisplayOptions,
  SelectionDisplayMode,
  StandardView,
  ViewerCameraState,
  ViewerGlyph,
  ViewerLayers,
  ViewerSelection,
  ViewMode,
} from './ViewerTypes';

const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1_000_000;
const CAMERA_INITIAL_POS = new THREE.Vector3(500, -1000, 800);
const GRID_SIZE = 2000;
const GRID_DIVISIONS = 20;
const AXIS_HELPER_SIZE = 200;
const NODE_POINT_SIZE = 8;
const CLICK_DRAG_THRESHOLD_PX = 4;
const NODE_PICK_RADIUS_PX = 10;
const MEMBER_PICK_RADIUS_PX = 8;
const WALL_PICK_RADIUS_PX = 5;
const LABEL_FONT = '11px sans-serif';

const COLORS = {
  node: new THREE.Color(0x004ccc),
  member: new THREE.Color(0x004ccc),
  selected: new THREE.Color(0xff2020),
  dimmed: new THREE.Color(0x9aa0a8),
  boundaryX: 0xe53935,
  boundaryY: 0x43a047,
  boundaryZ: 0x1e88e5,
  wall: 0x88aacc,
  wallEdge: 0x4477aa,
  wallSelected: 0xff6633,
  result: 0xeb2f96,
  resultForce: 0xff9800,
} as const;

const THEME = {
  light: {
    background: 0xf0f0f0,
    gridCenter: 0xcccccc,
    gridLine: 0xeeeeee,
    labelNode: '#0044aa',
    labelMember: '#aa4400',
    labelWall: '#36627a',
  },
  dark: {
    background: 0x252535,
    gridCenter: 0x3a3a4a,
    gridLine: 0x333344,
    labelNode: '#66aaff',
    labelMember: '#ffaa66',
    labelWall: '#9fd5ee',
  },
} as const;

const DEFAULT_LAYERS: ViewerLayers = {
  grid: true,
  axes: true,
  nodes: true,
  members: true,
  walls: true,
  boundaries: true,
  loads: true,
  results: true,
  labels: true,
};

const DEFAULT_LABEL_DENSITY: LabelDensityOptions = {
  mode: 'auto',
  maxLabels: 600,
  minSpacingPx: 18,
};

const DEFAULT_LOAD_OPTIONS: LoadDisplayOptions = {
  visible: true,
  showValues: true,
  showForces: true,
  showMoments: true,
  scale: 1,
  forceColor: 0xe65100,
  momentColor: 0x8e24aa,
};

const DEFAULT_DRAWING_OPTIONS: DrawingOptions = {
  gridSpacing: GRID_SIZE / GRID_DIVISIONS,
  snapToGrid: true,
  snapToNodes: true,
  nodeSnapRadiusPx: 12,
};

const DEFAULT_RESULT_OPTIONS: ResultDisplayOptions = {
  showDeformation: true,
  showReactions: false,
  showUndeformed: true,
  deformationScale: 1,
  reactionScale: 1,
  sectionForce: null,
  sectionForceScale: 1,
};

interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CartesianPointLike {
  x: number;
  y: number;
  z: number;
}

/** Convert CSS client coordinates to the viewer's logical pixel coordinates. */
export function clientPointToViewport(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } | null {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (
    ![x, y, rect.width, rect.height, viewportWidth, viewportHeight].every(Number.isFinite)
    || rect.width <= 0
    || rect.height <= 0
    || viewportWidth <= 0
    || viewportHeight <= 0
    || x < 0
    || y < 0
    || x > rect.width
    || y > rect.height
  ) return null;
  return {
    x: x * viewportWidth / rect.width,
    y: y * viewportHeight / rect.height,
  };
}

/** Defensive geometry guard for result diagrams, which may receive invalid models. */
export function hasDrawableMemberSpan(
  i: CartesianPointLike,
  j: CartesianPointLike,
): boolean {
  const dx = j.x - i.x;
  const dy = j.y - i.y;
  const dz = j.z - i.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  return Number.isFinite(lengthSq) && lengthSq > 1e-12;
}

interface OverlayLabel {
  position: THREE.Vector3;
  text: string;
  color: string;
  priority: number;
}

interface DrawingStart {
  position: Vector3Tuple;
  nodeNumber?: number;
}

interface ResultAnimationState {
  fps: number;
  loop: boolean;
  onFrame?: (frameIndex: number, frame: AnalysisResultFrame) => void;
  lastAdvance: number;
}

type ViewerCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/**
 * Three.js model viewer with event-driven rendering. The original public API
 * remains available; richer functionality is exposed through additive APIs.
 */
export class ModelViewer {
  private readonly scene = new THREE.Scene();
  private camera: ViewerCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private readonly container: HTMLElement;
  private readonly doc: FrameDocument;

  private readonly nodeGroup = new THREE.Group();
  private readonly memberGroup = new THREE.Group();
  private readonly wallGroup = new THREE.Group();
  private readonly boundaryGroup = new THREE.Group();
  private readonly loadGroup = new THREE.Group();
  private readonly resultGroup = new THREE.Group();
  private readonly drawingGroup = new THREE.Group();

  private grid: THREE.GridHelper;
  private readonly axes = new THREE.AxesHelper(AXIS_HELPER_SIZE);
  private nodeIndex = new Map<number, FrameDocument['nodes'][number]>();
  private memberIndex = new Map<number, FrameDocument['members'][number]>();
  private linkOrientationIndex = new Map<number, { y?: number[]; vecxz?: number[] }>();

  private readonly labelCanvas: HTMLCanvasElement;
  private readonly labelCtx: CanvasRenderingContext2D;
  private loadLabels: OverlayLabel[] = [];
  private resultLabels: OverlayLabel[] = [];

  private layers: ViewerLayers = { ...DEFAULT_LAYERS };
  private labelDensity: LabelDensityOptions = { ...DEFAULT_LABEL_DENSITY };
  private loadOptions: LoadDisplayOptions = { ...DEFAULT_LOAD_OPTIONS };
  private drawingOptions: DrawingOptions = { ...DEFAULT_DRAWING_OPTIONS };
  private resultOptions: ResultDisplayOptions = { ...DEFAULT_RESULT_OPTIONS };
  private projectionMode: ProjectionMode = 'perspective';
  private viewMode: ViewMode = { kind: '3d' };
  private memberColorMode: MemberColorMode = 'default';
  private memberColorResolver: MemberColorResolver | null = null;
  private selectionDisplayMode: SelectionDisplayMode = 'normal';
  private isDark = false;

  private showNodeNumbersValue = false;
  private showMemberNumbersValue = false;
  private showWallNumbersValue = false;
  private selectedNodeNumber: number | null = null;
  private selectedMemberNumber: number | null = null;
  private selectedWallNumber: number | null = null;
  private selectionChangedHandler: ((selection: ViewerSelection) => void) | null = null;

  private loadCaseIndex: number | null = null;
  private loadGlyphProvider: LoadGlyphProvider | null = null;
  private analysisResults: AnalysisResultSet | null = null;
  private resultFrameIndex = 0;
  private resultAnimation: ResultAnimationState | null = null;

  private drawingMode: DrawingMode = 'none';
  private drawingStart: DrawingStart | null = null;
  private drawingEventHandler: ((event: DrawingEvent) => void) | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;
  private keyboardCursor = { x: 0.5, y: 0.5 };

  private animationId: number | null = null;
  private disposed = false;
  private readonly onResizeBound = (): void => this.onResize();
  private readonly onControlsChange = (): void => this.invalidate();

  constructor(container: HTMLElement, doc: FrameDocument) {
    this.container = container;
    this.doc = doc;
    this.scene.background = new THREE.Color(THEME.light.background);

    const aspect = this.getAspect();
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.copy(CAMERA_INITIAL_POS);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.domElement.classList.add('viewer-canvas');
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive structural model view');
    this.renderer.domElement.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.getWidth(), this.getHeight(), true);
    container.appendChild(this.renderer.domElement);

    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this.resizeLabelCanvas();
    container.appendChild(this.labelCanvas);
    const labelCtx = this.labelCanvas.getContext('2d');
    if (!labelCtx) throw new Error('2D canvas is unavailable.');
    this.labelCtx = labelCtx;

    this.controls = this.createControls(this.camera, new THREE.Vector3());

    this.nodeGroup.name = 'nodes';
    this.memberGroup.name = 'members';
    this.wallGroup.name = 'walls';
    this.boundaryGroup.name = 'boundaries';
    this.loadGroup.name = 'loads';
    this.resultGroup.name = 'results';
    this.drawingGroup.name = 'drawing-preview';
    this.scene.add(
      this.nodeGroup,
      this.memberGroup,
      this.wallGroup,
      this.boundaryGroup,
      this.loadGroup,
      this.resultGroup,
      this.drawingGroup,
    );

    this.grid = this.createGrid();
    this.scene.add(this.grid, this.axes);
    this.applyLayerVisibility();

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('focus', () => this.invalidate());
    this.renderer.domElement.addEventListener('blur', () => this.invalidate());
    this.invalidate();
  }

  get showNodeNumbers(): boolean {
    return this.showNodeNumbersValue;
  }

  setAccessibleLabel(label: string): void {
    this.renderer.domElement.setAttribute('aria-label', label);
  }

  focus(): void {
    this.renderer.domElement.focus();
  }

  set showNodeNumbers(value: boolean) {
    this.showNodeNumbersValue = value;
    this.invalidate();
  }

  get showMemberNumbers(): boolean {
    return this.showMemberNumbersValue;
  }

  set showMemberNumbers(value: boolean) {
    this.showMemberNumbersValue = value;
    this.invalidate();
  }

  get showWallNumbers(): boolean {
    return this.showWallNumbersValue;
  }

  set showWallNumbers(value: boolean) {
    this.showWallNumbersValue = value;
    this.invalidate();
  }

  /** Schedule exactly one frame unless controls or result playback invalidate it again. */
  invalidate(): void {
    if (this.disposed || this.animationId !== null) return;
    this.animationId = requestAnimationFrame(this.renderFrame);
  }

  private readonly renderFrame = (time: number): void => {
    this.animationId = null;
    if (this.disposed) return;

    this.advanceResultAnimation(time);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();

    if (this.resultAnimation) this.invalidate();
  };

  resize(): void {
    this.onResize();
  }

  private onResize(): void {
    const width = this.getWidth();
    const height = this.getHeight();
    const aspect = width / height;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
    } else {
      const halfHeight = Math.max((this.camera.top - this.camera.bottom) / 2, 1);
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
    this.resizeLabelCanvas();
    this.invalidate();
  }

  private getWidth(): number {
    return Math.max(1, this.container.clientWidth || 1);
  }

  private getHeight(): number {
    return Math.max(1, this.container.clientHeight || 1);
  }

  private getAspect(): number {
    return this.getWidth() / this.getHeight();
  }

  private resizeLabelCanvas(): void {
    this.labelCanvas.width = this.getWidth();
    this.labelCanvas.height = this.getHeight();
    this.labelCanvas.style.width = `${this.getWidth()}px`;
    this.labelCanvas.style.height = `${this.getHeight()}px`;
  }

  private createControls(camera: ViewerCamera, target: THREE.Vector3): OrbitControls {
    const controls = new OrbitControls(camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.enableRotate = this.viewMode.kind === '3d';
    controls.target.copy(target);
    controls.addEventListener('change', this.onControlsChange);
    return controls;
  }

  /** Rebuild model geometry. Pass false to preserve the exact current viewpoint. */
  updateModel(fitToView: boolean = true): void {
    if (this.disposed) return;
    const cameraState = fitToView ? null : this.getCameraState();
    this.nodeIndex = new Map(this.doc.nodes.map(node => [node.number, node] as const));
    this.memberIndex = new Map(this.doc.members.map(member => [member.number, member] as const));
    this.linkOrientationIndex = new Map(
      (this.doc.analysisMetadata?.linkElements ?? [])
        .filter(link => link.orientation)
        .map(link => [link.tag, link.orientation!] as const),
    );
    this.clearDynamicGroups();
    this.drawNodes();
    this.drawMembers();
    this.drawWalls();
    this.drawBoundaries();
    this.drawLoads();
    this.drawResults();
    if (fitToView) this.fitToView();
    else if (cameraState) this.restoreCameraState(cameraState);
    this.applyLayerVisibility();
    this.invalidate();
  }

  fitToView(): void {
    const bounds = calculateBounds(this.getVisibleGeometryPoints()) ?? calculateBounds(this.doc.nodes);
    if (!bounds) return;
    this.fitBounds(bounds);
  }

  zoomToSelection(): boolean {
    const points: Array<{ x: number; y: number; z: number }> = [];
    if (this.selectedNodeNumber !== null) {
      const node = this.nodeIndex.get(this.selectedNodeNumber);
      if (node) points.push(node);
    } else if (this.selectedMemberNumber !== null) {
      const member = this.memberIndex.get(this.selectedMemberNumber);
      const iNode = member ? this.nodeIndex.get(member.iNodeNumber) : undefined;
      const jNode = member ? this.nodeIndex.get(member.jNodeNumber) : undefined;
      if (iNode) points.push(iNode);
      if (jNode) points.push(jNode);
    } else if (this.selectedWallNumber !== null) {
      const wall = this.doc.walls.find(item => item.number === this.selectedWallNumber);
      if (wall) {
        for (const number of [wall.leftBottomNode, wall.rightBottomNode, wall.rightTopNode, wall.leftTopNode]) {
          const node = this.nodeIndex.get(number);
          if (node) points.push(node);
        }
      }
    }
    const bounds = calculateBounds(points);
    if (!bounds) return false;
    this.fitBounds(bounds, 2.2);
    return true;
  }

  setStandardView(view: StandardView, fit: boolean = true): void {
    const bounds = calculateBounds(this.getVisibleGeometryPoints()) ?? calculateBounds(this.doc.nodes);
    const target = bounds
      ? new THREE.Vector3(...bounds.center)
      : this.controls.target.clone();
    const distance = Math.max(bounds?.maxDimension ?? 100, 100) * 1.8;
    const direction = new THREE.Vector3();
    switch (view) {
      case 'top':
        direction.set(0, 0, 1);
        this.camera.up.set(0, 1, 0);
        break;
      case 'front':
        direction.set(0, -1, 0);
        this.camera.up.set(0, 0, 1);
        break;
      case 'side':
        direction.set(1, 0, 0);
        this.camera.up.set(0, 0, 1);
        break;
      default:
        direction.set(1, -1.2, 0.8).normalize();
        this.camera.up.set(0, 0, 1);
        break;
    }
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
    if (fit && bounds) this.fitBounds(bounds);
    else {
      this.controls.update();
      this.invalidate();
    }
  }

  resetView(): void {
    this.setProjectionMode('perspective');
    this.viewMode = { kind: '3d' };
    this.updateGridPlane();
    this.setStandardView('isometric', true);
  }

  getProjectionMode(): ProjectionMode {
    return this.projectionMode;
  }

  setProjectionMode(mode: ProjectionMode): void {
    if (mode === this.projectionMode) return;
    const oldCamera = this.camera;
    const target = this.controls.target.clone();
    const direction = oldCamera.position.clone().sub(target).normalize();
    const aspect = this.getAspect();
    let camera: ViewerCamera;

    if (mode === 'orthographic') {
      const distance = Math.max(oldCamera.position.distanceTo(target), 1);
      const halfHeight = Math.max(
        Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * distance,
        1,
      );
      camera = new THREE.OrthographicCamera(
        -halfHeight * aspect,
        halfHeight * aspect,
        halfHeight,
        -halfHeight,
        CAMERA_NEAR,
        CAMERA_FAR,
      );
    } else {
      camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
      const oldOrtho = oldCamera as THREE.OrthographicCamera;
      const halfHeight = Math.max((oldOrtho.top - oldOrtho.bottom) / (2 * oldOrtho.zoom), 1);
      const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
      oldCamera.position.copy(target).addScaledVector(direction, distance);
    }

    camera.position.copy(oldCamera.position);
    camera.quaternion.copy(oldCamera.quaternion);
    camera.up.copy(oldCamera.up);
    camera.zoom = mode === 'perspective' ? 1 : oldCamera.zoom;
    camera.updateProjectionMatrix();

    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();
    this.camera = camera;
    this.controls = this.createControls(camera, target);
    this.projectionMode = mode;
    this.controls.update();
    this.invalidate();
  }

  getCameraState(): ViewerCameraState {
    return {
      projection: this.projectionMode,
      position: this.camera.position.toArray() as Vector3Tuple,
      target: this.controls.target.toArray() as Vector3Tuple,
      up: this.camera.up.toArray() as Vector3Tuple,
      zoom: this.camera.zoom,
      orthographicHeight: this.camera instanceof THREE.OrthographicCamera
        ? this.camera.top - this.camera.bottom
        : undefined,
    };
  }

  restoreCameraState(state: ViewerCameraState): void {
    if (state.projection !== this.projectionMode) this.setProjectionMode(state.projection);
    this.camera.position.fromArray(state.position);
    this.camera.up.fromArray(state.up);
    this.camera.zoom = Math.max(state.zoom, Number.EPSILON);
    if (this.camera instanceof THREE.OrthographicCamera && state.orthographicHeight) {
      const halfHeight = Math.max(state.orthographicHeight / 2, Number.EPSILON);
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.left = -halfHeight * this.getAspect();
      this.camera.right = halfHeight * this.getAspect();
    }
    this.controls.target.fromArray(state.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  private fitBounds(bounds: Bounds3, padding: number = 1.35): void {
    const target = new THREE.Vector3(...bounds.center);
    const radius = Math.max(bounds.maxDimension / 2, 50) * padding;
    let direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-12) direction.set(1, -1.2, 0.8);
    direction.normalize();
    this.controls.target.copy(target);

    if (this.camera instanceof THREE.PerspectiveCamera) {
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
      this.camera.position.copy(target).addScaledVector(direction, distance);
    } else {
      const halfHeight = radius;
      const aspect = this.getAspect();
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.zoom = 1;
      this.camera.position.copy(target).addScaledVector(direction, Math.max(radius * 3, 100));
    }
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.controls.update();
    this.invalidate();
  }

  setLayerVisibility(layers: Partial<ViewerLayers>): void {
    this.layers = { ...this.layers, ...layers };
    this.applyLayerVisibility();
    this.invalidate();
  }

  getLayerVisibility(): ViewerLayers {
    return { ...this.layers };
  }

  private applyLayerVisibility(): void {
    this.grid.visible = this.layers.grid;
    this.axes.visible = this.layers.axes;
    const hasResultFrame = !!this.analysisResults?.frames[this.resultFrameIndex];
    const showUndeformed = !hasResultFrame || this.resultOptions.showUndeformed;
    this.nodeGroup.visible = this.layers.nodes && showUndeformed;
    this.memberGroup.visible = this.layers.members && showUndeformed;
    this.wallGroup.visible = this.layers.walls;
    this.boundaryGroup.visible = this.layers.boundaries;
    this.loadGroup.visible = this.layers.loads && this.loadOptions.visible;
    this.resultGroup.visible = this.layers.results;
  }

  resetDisplay(): void {
    this.layers = { ...DEFAULT_LAYERS };
    this.labelDensity = { ...DEFAULT_LABEL_DENSITY };
    this.selectionDisplayMode = 'normal';
    this.memberColorMode = 'default';
    this.memberColorResolver = null;
    this.applyLayerVisibility();
    this.updateModel(false);
  }

  setSelectionDisplayMode(mode: SelectionDisplayMode): void {
    if (mode === this.selectionDisplayMode) return;
    this.selectionDisplayMode = mode;
    this.updateModel(false);
  }

  getSelectionDisplayMode(): SelectionDisplayMode {
    return this.selectionDisplayMode;
  }

  setMemberColorMode(mode: MemberColorMode, resolver: MemberColorResolver | null = null): void {
    this.memberColorMode = mode;
    this.memberColorResolver = resolver;
    this.updateModel(false);
  }

  getMemberColorMode(): MemberColorMode {
    return this.memberColorMode;
  }

  setMemberColorResolver(resolver: MemberColorResolver | null): void {
    this.memberColorResolver = resolver;
    this.updateModel(false);
  }

  getColorLegend(): ColorLegendEntry[] {
    if (this.memberColorMode === 'default' && !this.memberColorResolver) return [];
    const entries = new Map<string, ColorLegendEntry>();
    for (const member of this.doc.members) {
      if (!member.isShown) continue;
      const context = this.getMemberColorContext(member);
      const key = this.memberColorKey(context);
      if (entries.has(key)) continue;
      entries.set(key, {
        key,
        label: this.memberColorLabel(context),
        color: `#${this.resolveMemberColor(member).getHexString()}`,
      });
    }
    return [...entries.values()];
  }

  setLabelDensity(options: Partial<LabelDensityOptions>): void {
    this.labelDensity = {
      ...this.labelDensity,
      ...options,
      maxLabels: Math.max(0, Math.floor(options.maxLabels ?? this.labelDensity.maxLabels)),
      minSpacingPx: Math.max(0, options.minSpacingPx ?? this.labelDensity.minSpacingPx),
    };
    this.invalidate();
  }

  getLabelDensity(): LabelDensityOptions {
    return { ...this.labelDensity };
  }

  setLoadCase(index: number | null): void {
    this.loadCaseIndex = index === null ? null : Math.max(0, Math.floor(index));
    this.redrawLoads();
  }

  setLoadDisplay(options: Partial<LoadDisplayOptions>): void {
    this.loadOptions = { ...this.loadOptions, ...options };
    this.applyLayerVisibility();
    this.redrawLoads();
  }

  setLoadGlyphProvider(provider: LoadGlyphProvider | null): void {
    this.loadGlyphProvider = provider;
    this.redrawLoads();
  }

  private redrawLoads(): void {
    this.clearGroup(this.loadGroup);
    this.loadLabels = [];
    this.drawLoads();
    this.invalidate();
  }

  setViewMode(mode: ViewMode, fit: boolean = true): void {
    this.viewMode = { ...mode };
    this.controls.enableRotate = mode.kind === '3d';
    if (mode.kind === '3d') {
      this.updateGridPlane();
      if (fit) this.setStandardView('isometric', true);
      return;
    }
    this.setProjectionMode('orthographic');
    this.updateGridPlane();
    if (mode.kind === 'plan') this.setStandardView('top', fit);
    else if (mode.kind === 'elevation-x') this.setStandardView('front', fit);
    else this.setStandardView('side', fit);
  }

  getViewMode(): ViewMode {
    return { ...this.viewMode };
  }

  setDrawingMode(mode: DrawingMode, options: Partial<DrawingOptions> = {}): void {
    this.cancelDrawing(false);
    this.drawingMode = mode;
    this.drawingOptions = { ...this.drawingOptions, ...options };
    this.renderer.domElement.style.cursor = mode === 'none' ? '' : 'crosshair';
  }

  getDrawingMode(): DrawingMode {
    return this.drawingMode;
  }

  setOnDrawingEvent(handler: ((event: DrawingEvent) => void) | null): void {
    this.drawingEventHandler = handler;
  }

  cancelDrawing(notify: boolean = true): void {
    const hadStart = this.drawingStart !== null;
    this.drawingStart = null;
    this.clearGroup(this.drawingGroup);
    if (notify && hadStart) this.drawingEventHandler?.({ type: 'cancel' });
    this.invalidate();
  }

  setAnalysisResults(results: AnalysisResultSet | null): void {
    this.pauseResults();
    this.analysisResults = results;
    this.resultFrameIndex = 0;
    this.applyLayerVisibility();
    this.redrawResults();
  }

  getAnalysisResults(): AnalysisResultSet | null {
    return this.analysisResults;
  }

  setResultDisplay(options: Partial<ResultDisplayOptions>): void {
    this.resultOptions = { ...this.resultOptions, ...options };
    this.applyLayerVisibility();
    this.redrawResults();
  }

  getResultDisplay(): ResultDisplayOptions {
    return { ...this.resultOptions };
  }

  setResultFrame(index: number): boolean {
    const frames = this.analysisResults?.frames;
    if (!frames || frames.length === 0) return false;
    const next = Math.max(0, Math.min(frames.length - 1, Math.floor(index)));
    this.resultFrameIndex = next;
    this.redrawResults();
    this.resultAnimation?.onFrame?.(next, frames[next]);
    return true;
  }

  getResultFrameIndex(): number {
    return this.resultFrameIndex;
  }

  playResults(options: ResultAnimationOptions = {}): boolean {
    if (!this.analysisResults || this.analysisResults.frames.length < 2) return false;
    this.resultAnimation = {
      fps: Math.max(0.1, options.fps ?? 12),
      loop: options.loop ?? true,
      onFrame: options.onFrame,
      lastAdvance: 0,
    };
    this.invalidate();
    return true;
  }

  pauseResults(): void {
    this.resultAnimation = null;
  }

  isResultAnimationPlaying(): boolean {
    return this.resultAnimation !== null;
  }

  private advanceResultAnimation(time: number): void {
    const state = this.resultAnimation;
    const frames = this.analysisResults?.frames;
    if (!state || !frames || frames.length < 2) return;
    if (state.lastAdvance === 0) {
      state.lastAdvance = time;
      return;
    }
    if (time - state.lastAdvance < 1000 / state.fps) return;
    state.lastAdvance = time;
    const next = this.resultFrameIndex + 1;
    if (next >= frames.length && !state.loop) {
      this.pauseResults();
      return;
    }
    this.resultFrameIndex = next % frames.length;
    this.redrawResults();
    state.onFrame?.(this.resultFrameIndex, frames[this.resultFrameIndex]);
  }

  private redrawResults(): void {
    this.clearGroup(this.resultGroup);
    this.resultLabels = [];
    this.drawResults();
    this.invalidate();
  }

  setOnSelectionChanged(handler: ((selection: ViewerSelection) => void) | null): void {
    this.selectionChangedHandler = handler;
  }

  getSelection(): ViewerSelection {
    if (this.selectedNodeNumber !== null) return { kind: 'node', nodeNumber: this.selectedNodeNumber };
    if (this.selectedMemberNumber !== null) return { kind: 'member', memberNumber: this.selectedMemberNumber };
    if (this.selectedWallNumber !== null) return { kind: 'wall', wallNumber: this.selectedWallNumber };
    return { kind: 'none' };
  }

  setSelection(selection: ViewerSelection, notify: boolean = true): void {
    const nextNode = selection.kind === 'node' ? selection.nodeNumber : null;
    const nextMember = selection.kind === 'member' ? selection.memberNumber : null;
    const nextWall = selection.kind === 'wall' ? selection.wallNumber : null;
    const changed = nextNode !== this.selectedNodeNumber
      || nextMember !== this.selectedMemberNumber
      || nextWall !== this.selectedWallNumber;
    this.selectedNodeNumber = nextNode;
    this.selectedMemberNumber = nextMember;
    this.selectedWallNumber = nextWall;
    if (changed) this.updateModel(false);
    if (notify) this.selectionChangedHandler?.(selection);
  }

  clearSelection(notify: boolean = true): void {
    this.setSelection({ kind: 'none' }, notify);
  }

  setTheme(dark: boolean): void {
    this.isDark = dark;
    const colors = dark ? THEME.dark : THEME.light;
    (this.scene.background as THREE.Color).set(colors.background);
    this.scene.remove(this.grid);
    this.disposeObject3D(this.grid);
    this.grid = this.createGrid();
    this.updateGridPlane();
    this.scene.add(this.grid);
    this.applyLayerVisibility();
    this.invalidate();
  }

  private createGrid(): THREE.GridHelper {
    const colors = this.isDark ? THEME.dark : THEME.light;
    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, colors.gridCenter, colors.gridLine);
    grid.name = 'grid';
    return grid;
  }

  private updateGridPlane(): void {
    this.grid.rotation.set(0, 0, 0);
    this.grid.position.set(0, 0, 0);
    if (this.viewMode.kind === 'plan' || this.viewMode.kind === '3d') {
      this.grid.rotation.x = Math.PI / 2;
      this.grid.position.z = this.viewMode.kind === 'plan' ? this.viewMode.elevation ?? 0 : 0;
    } else if (this.viewMode.kind === 'elevation-x') {
      this.grid.position.y = this.viewMode.offset ?? 0;
    } else {
      this.grid.rotation.z = Math.PI / 2;
      this.grid.position.x = this.viewMode.offset ?? 0;
    }
    this.invalidate();
  }

  private drawNodes(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const numbers: number[] = [];
    for (const node of this.doc.nodes) {
      if (!node.isShown || !this.entityPassesIsolation('node', node.number)) continue;
      positions.push(node.x, node.y, node.z);
      const selected = node.selected || this.selectedNodeNumber === node.number;
      const color = selected
        ? COLORS.selected
        : this.selectionDisplayMode === 'dim-others' && this.hasSelection()
          ? COLORS.dimmed
          : COLORS.node;
      colors.push(color.r, color.g, color.b);
      numbers.push(node.number);
    }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: NODE_POINT_SIZE,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: this.selectionDisplayMode === 'dim-others' && this.hasSelection(),
      opacity: this.selectionDisplayMode === 'dim-others' && this.hasSelection() ? 0.75 : 1,
    });
    const points = new THREE.Points(geometry, material);
    points.userData.nodeNumbers = numbers;
    this.nodeGroup.add(points);
  }

  private drawMembers(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const numbers: number[] = [];
    for (const member of this.doc.members) {
      if (!member.isShown || !this.entityPassesIsolation('member', member.number)) continue;
      const iNode = this.nodeIndex.get(member.iNodeNumber);
      const jNode = this.nodeIndex.get(member.jNodeNumber);
      if (!iNode || !jNode) continue;
      positions.push(iNode.x, iNode.y, iNode.z, jNode.x, jNode.y, jNode.z);
      const selected = member.selected || this.selectedMemberNumber === member.number;
      const color = selected
        ? COLORS.selected
        : this.selectionDisplayMode === 'dim-others' && this.hasSelection()
          ? COLORS.dimmed
          : this.resolveMemberColor(member);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      numbers.push(member.number);
    }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const lines = new THREE.LineSegments(geometry, material);
    lines.userData.memberNumbers = numbers;
    this.memberGroup.add(lines);
  }

  private drawWalls(): void {
    for (const wall of this.doc.walls) {
      if (!wall.isShown || !this.entityPassesIsolation('wall', wall.number)) continue;
      const nodes = [
        this.nodeIndex.get(wall.leftBottomNode),
        this.nodeIndex.get(wall.rightBottomNode),
        this.nodeIndex.get(wall.rightTopNode),
        this.nodeIndex.get(wall.leftTopNode),
      ];
      if (nodes.some(node => !node)) continue;
      const positions = nodes.flatMap(node => [node!.x, node!.y, node!.z]);
      const selected = this.selectedWallNumber === wall.number;
      const dimmed = this.selectionDisplayMode === 'dim-others' && this.hasSelection() && !selected;
      const fillColor = selected
        ? COLORS.wallSelected
        : this.memberColorMode === 'material'
          ? colorForKey(`material:${wall.materialNumber}`)
          : dimmed ? COLORS.dimmed : COLORS.wall;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      const material = new THREE.MeshBasicMaterial({
        color: fillColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: selected ? 0.55 : dimmed ? 0.12 : 0.3,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.wallNumber = wall.number;
      this.wallGroup.add(mesh);

      const edgeGeometry = new THREE.BufferGeometry();
      const edgePositions = [...positions, ...positions.slice(0, 3)];
      edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: selected ? COLORS.wallSelected : COLORS.wallEdge,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      });
      const edge = new THREE.Line(edgeGeometry, edgeMaterial);
      edge.userData.wallNumber = wall.number;
      this.wallGroup.add(edge);
    }
  }

  private drawBoundaries(): void {
    const size = this.getSymbolSize();
    const seen = new Set<number>();
    const boundaries = [
      ...this.doc.boundaries.map(boundary => ({ boundary, nodeNumber: boundary.nodeNumber })),
      ...this.doc.nodes.flatMap(node => node.boundaryCondition
        ? [{ boundary: node.boundaryCondition, nodeNumber: node.number }]
        : []),
    ];
    for (const { boundary, nodeNumber } of boundaries) {
      if (seen.has(nodeNumber)) continue;
      seen.add(nodeNumber);
      const node = this.nodeIndex.get(nodeNumber);
      if (!node?.isShown || !this.entityPassesIsolation('node', node.number)) continue;
      const origin = new THREE.Vector3(node.x, node.y, node.z);
      const translations = [boundary.deltaX, boundary.deltaY, boundary.deltaZ];
      const rotations = [boundary.thetaX, boundary.thetaY, boundary.thetaZ];
      const axes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ];
      const colors = [COLORS.boundaryX, COLORS.boundaryY, COLORS.boundaryZ];
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        if (translations[axisIndex] !== 0) {
          this.drawTranslationConstraint(origin, axes[axisIndex], size, colors[axisIndex], axisIndex);
        }
        if (rotations[axisIndex] !== 0) {
          this.drawRotationConstraint(origin, axes[axisIndex], size, colors[axisIndex], axisIndex);
        }
      }
    }
  }

  private drawTranslationConstraint(
    origin: THREE.Vector3,
    axis: THREE.Vector3,
    size: number,
    color: THREE.ColorRepresentation,
    axisIndex: number,
  ): void {
    const end = origin.clone().addScaledVector(axis, -size);
    const cross = new THREE.Vector3(axis.y || axis.z, axis.z || axis.x, axis.x || axis.y)
      .cross(axis)
      .normalize()
      .multiplyScalar(size * 0.3);
    const positions = [
      ...origin.toArray(), ...end.toArray(),
      ...end.clone().sub(cross).toArray(), ...end.clone().add(cross).toArray(),
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
    line.userData.boundaryDof = ['dx', 'dy', 'dz'][axisIndex];
    this.boundaryGroup.add(line);
  }

  private drawRotationConstraint(
    origin: THREE.Vector3,
    axis: THREE.Vector3,
    size: number,
    color: THREE.ColorRepresentation,
    axisIndex: number,
  ): void {
    const basisA = Math.abs(axis.z) < 0.9
      ? axis.clone().cross(new THREE.Vector3(0, 0, 1)).normalize()
      : new THREE.Vector3(1, 0, 0);
    const basisB = axis.clone().cross(basisA).normalize();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const angle = (i / 28) * Math.PI * 1.75;
      points.push(origin.clone()
        .addScaledVector(basisA, Math.cos(angle) * size * 0.55)
        .addScaledVector(basisB, Math.sin(angle) * size * 0.55));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    line.userData.boundaryDof = ['rx', 'ry', 'rz'][axisIndex];
    this.boundaryGroup.add(line);
  }

  private drawLoads(): void {
    if (!this.loadOptions.visible) return;
    const caseIndex = this.loadCaseIndex ?? this.doc.loadCaseIndex;
    const symbolSize = this.getSymbolSize();
    const forceColor = this.loadOptions.forceColor;
    const momentColor = this.loadOptions.momentColor;
    for (const node of this.doc.nodes) {
      if (!node.isShown || !this.entityPassesIsolation('node', node.number)) continue;
      const load = node.loads[caseIndex];
      if (!load || load.isZero) continue;
      const origin = new THREE.Vector3(node.x, node.y, node.z);
      const force = new THREE.Vector3(load.p1, load.p2, load.p3);
      const moment = new THREE.Vector3(load.m1, load.m2, load.m3);
      if (this.loadOptions.showForces && force.lengthSq() > 0) {
        this.addScaledArrow(origin, force, symbolSize, this.loadOptions.scale, forceColor, this.loadGroup);
        if (this.loadOptions.showValues) {
          this.loadLabels.push({
            position: origin.clone().addScaledVector(force.clone().normalize(), symbolSize),
            text: `F ${this.formatVector(force)}`,
            color: new THREE.Color(forceColor).getStyle(),
            priority: 80,
          });
        }
      }
      if (this.loadOptions.showMoments && moment.lengthSq() > 0) {
        this.drawMomentGlyph(origin, moment, symbolSize, momentColor, this.loadGroup);
        if (this.loadOptions.showValues) {
          this.loadLabels.push({
            position: origin.clone().add(new THREE.Vector3(0, 0, symbolSize)),
            text: `M ${this.formatVector(moment)}`,
            color: new THREE.Color(momentColor).getStyle(),
            priority: 75,
          });
        }
      }
    }

    const glyphs = this.loadGlyphProvider?.(this.doc, caseIndex) ?? [];
    for (const glyph of glyphs) this.drawGlyph(glyph);
  }

  private drawMomentGlyph(
    origin: THREE.Vector3,
    moment: THREE.Vector3,
    size: number,
    color: THREE.ColorRepresentation,
    group: THREE.Group,
  ): void {
    const axis = moment.clone().normalize();
    const basisA = Math.abs(axis.z) < 0.9
      ? axis.clone().cross(new THREE.Vector3(0, 0, 1)).normalize()
      : new THREE.Vector3(1, 0, 0);
    const basisB = axis.clone().cross(basisA).normalize();
    const sign = Math.sign(moment.dot(axis)) || 1;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const angle = sign * (i / 24) * Math.PI * 1.65;
      points.push(origin.clone()
        .addScaledVector(basisA, Math.cos(angle) * size * 0.75)
        .addScaledVector(basisB, Math.sin(angle) * size * 0.75));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color }),
    );
    group.add(line);
    const lastPoint = points[points.length - 1];
    const previousPoint = points[points.length - 2];
    const tangent = lastPoint.clone().sub(previousPoint).normalize();
    const arrow = new THREE.ArrowHelper(tangent, lastPoint, size * 0.35, color, size * 0.18, size * 0.12);
    group.add(arrow);
  }

  private drawGlyph(glyph: ViewerGlyph): void {
    if (glyph.kind === 'arrow') {
      const origin = new THREE.Vector3(...glyph.origin);
      const vector = new THREE.Vector3(...glyph.vector);
      this.addArrow(origin, vector, glyph.color ?? 0xff9800, this.loadGroup);
      if (glyph.label) {
        this.loadLabels.push({
          position: origin.clone().add(vector),
          text: glyph.label,
          color: new THREE.Color(glyph.color ?? 0xff9800).getStyle(),
          priority: 60,
        });
      }
    } else if (glyph.kind === 'polyline') {
      if (glyph.points.length < 2) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(glyph.points.map(point => new THREE.Vector3(...point)));
      const material = new THREE.LineBasicMaterial({ color: glyph.color ?? 0xff9800 });
      const line = glyph.closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
      this.loadGroup.add(line);
      if (glyph.label) {
        const middle = glyph.points[Math.floor(glyph.points.length / 2)];
        this.loadLabels.push({
          position: new THREE.Vector3(...middle),
          text: glyph.label,
          color: new THREE.Color(glyph.color ?? 0xff9800).getStyle(),
          priority: 55,
        });
      }
    } else {
      this.loadLabels.push({
        position: new THREE.Vector3(...glyph.position),
        text: glyph.text,
        color: glyph.color ?? '#d06b00',
        priority: 50,
      });
    }
  }

  private drawResults(): void {
    const frame = this.analysisResults?.frames[this.resultFrameIndex];
    if (!frame) return;
    const nodeResults = new Map(frame.nodes.map(result => [result.nodeNumber, result] as const));
    const deformedPosition = (nodeNumber: number): THREE.Vector3 | null => {
      const node = this.nodeIndex.get(nodeNumber);
      if (!node) return null;
      const displacement = nodeResults.get(nodeNumber)?.displacement ?? [0, 0, 0];
      return new THREE.Vector3(node.x, node.y, node.z).addScaledVector(
        new THREE.Vector3(...displacement),
        this.resultOptions.deformationScale,
      );
    };

    if (this.resultOptions.showDeformation) {
      const positions: number[] = [];
      const nodePositions: number[] = [];
      for (const node of this.doc.nodes) {
        if (!node.isShown) continue;
        const position = deformedPosition(node.number);
        if (position) nodePositions.push(...position.toArray());
      }
      for (const member of this.doc.members) {
        if (!member.isShown) continue;
        const i = deformedPosition(member.iNodeNumber);
        const j = deformedPosition(member.jNodeNumber);
        if (!i || !j) continue;
        positions.push(...i.toArray(), ...j.toArray());
      }
      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.resultGroup.add(new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: COLORS.result }),
        ));
      }
      if (nodePositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
        this.resultGroup.add(new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ color: COLORS.result, size: NODE_POINT_SIZE, sizeAttenuation: false }),
        ));
      }
    }

    if (this.resultOptions.showReactions) {
      const symbolSize = this.getSymbolSize();
      for (const result of frame.nodes) {
        const node = this.nodeIndex.get(result.nodeNumber);
        if (!node) continue;
        const origin = new THREE.Vector3(node.x, node.y, node.z);
        if (result.reaction) {
          const reaction = new THREE.Vector3(...result.reaction);
          if (reaction.lengthSq() > 0) {
            this.addScaledArrow(
              origin,
              reaction,
              symbolSize,
              this.resultOptions.reactionScale,
              COLORS.resultForce,
              this.resultGroup,
            );
          }
        }
        if (result.reactionMoment) {
          const moment = new THREE.Vector3(...result.reactionMoment);
          if (moment.lengthSq() > 0) {
            this.drawMomentGlyph(
              origin,
              moment,
              symbolSize * Math.max(this.resultOptions.reactionScale, 0.01),
              COLORS.resultForce,
              this.resultGroup,
            );
          }
        }
      }
    }

    const forceComponent = this.resultOptions.sectionForce;
    if (forceComponent) {
      for (const result of frame.members ?? []) {
        const member = this.memberIndex.get(result.memberNumber);
        const iNode = member ? this.nodeIndex.get(member.iNodeNumber) : undefined;
        const jNode = member ? this.nodeIndex.get(member.jNodeNumber) : undefined;
        if (!iNode || !jNode || !result.stations || result.stations.length === 0) continue;
        if (!hasDrawableMemberSpan(iNode, jNode)) continue;
        const i = new THREE.Vector3(iNode.x, iNode.y, iNode.z);
        const j = new THREE.Vector3(jNode.x, jNode.y, jNode.z);
        const localX = j.clone().sub(i).normalize();
        const localAxisMetadata = this.doc.analysisMetadata?.localAxes[String(result.memberNumber)]
          ?? this.linkOrientationIndex.get(result.memberNumber);
        const metadataY = localAxisMetadata?.y && localAxisMetadata.y.length >= 3
          ? new THREE.Vector3(localAxisMetadata.y[0], localAxisMetadata.y[1], localAxisMetadata.y[2])
          : null;
        const metadataVecXZ = localAxisMetadata?.vecxz && localAxisMetadata.vecxz.length >= 3
          ? new THREE.Vector3(localAxisMetadata.vecxz[0], localAxisMetadata.vecxz[1], localAxisMetadata.vecxz[2])
          : null;
        let localY = metadataY?.clone().sub(localX.clone().multiplyScalar(metadataY.dot(localX)));
        if (!localY || localY.lengthSq() < 1e-12) {
          localY = metadataVecXZ?.clone().cross(localX);
        }
        if (!localY || localY.lengthSq() < 1e-12) {
          const reference = Math.abs(localX.z) < 0.9
            ? new THREE.Vector3(0, 0, 1)
            : new THREE.Vector3(0, 1, 0);
          localY = reference.cross(localX);
        }
        localY.normalize();
        const localZ = localX.clone().cross(localY).normalize();
        const diagramAxis = forceComponent === 'shearZ' || forceComponent === 'momentY'
          ? localZ
          : localY;
        const points: THREE.Vector3[] = [];
        const stems: number[] = [];
        for (const station of result.stations) {
          const t = THREE.MathUtils.clamp(station.position, 0, 1);
          const base = i.clone().lerp(j, t);
          const value = station[forceComponent] ?? 0;
          const offset = diagramAxis.clone().multiplyScalar(value * this.resultOptions.sectionForceScale);
          const tip = base.clone().add(offset);
          points.push(tip);
          stems.push(...base.toArray(), ...tip.toArray());
        }
        if (points.length > 1) {
          this.resultGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: COLORS.resultForce }),
          ));
        }
        if (stems.length > 0) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(stems, 3));
          this.resultGroup.add(new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({ color: COLORS.resultForce, transparent: true, opacity: 0.6 }),
          ));
        }
      }
    }

    if (frame.time !== undefined) {
      this.resultLabels.push({
        position: this.controls.target.clone(),
        text: `t = ${frame.time}${this.analysisResults?.units?.time ? ` ${this.analysisResults.units.time}` : ''}`,
        color: this.isDark ? '#ff9ad5' : '#a00064',
        priority: 100,
      });
    }
  }

  private addScaledArrow(
    origin: THREE.Vector3,
    vector: THREE.Vector3,
    symbolSize: number,
    scale: number,
    color: THREE.ColorRepresentation,
    group: THREE.Group,
  ): void {
    const magnitude = vector.length();
    if (magnitude <= 0) return;
    const length = symbolSize * Math.max(0.35, Math.log10(1 + magnitude)) * Math.max(scale, 0.01);
    this.addArrow(origin, vector.clone().normalize().multiplyScalar(length), color, group);
  }

  private addArrow(
    origin: THREE.Vector3,
    vector: THREE.Vector3,
    color: THREE.ColorRepresentation,
    group: THREE.Group,
  ): void {
    const length = vector.length();
    if (length <= 1e-12) return;
    const arrow = new THREE.ArrowHelper(
      vector.clone().normalize(),
      origin,
      length,
      color,
      Math.min(length * 0.28, this.getSymbolSize() * 0.5),
      Math.min(length * 0.16, this.getSymbolSize() * 0.28),
    );
    group.add(arrow);
  }

  private resolveMemberColor(member: Member): THREE.Color {
    const context = this.getMemberColorContext(member);
    const custom = this.memberColorResolver?.(context, this.doc);
    if (custom !== null && custom !== undefined) return new THREE.Color(custom);
    const key = this.memberColorKey(context);
    return this.memberColorMode === 'default' ? COLORS.member.clone() : new THREE.Color(colorForKey(key));
  }

  private getMemberColorContext(member: Member): MemberColorContext {
    const section = this.doc.findSectionByNumber(member.sectionNumber);
    return {
      memberNumber: member.number,
      sectionNumber: member.sectionNumber,
      materialNumber: section?.materialNumber ?? 0,
      elementType: section?.type ?? null,
    };
  }

  private memberColorKey(context: MemberColorContext): string {
    switch (this.memberColorMode) {
      case 'section': return `section:${context.sectionNumber}`;
      case 'material': return `material:${context.materialNumber}`;
      case 'element-type': return `element-type:${context.elementType ?? 'unknown'}`;
      default: return 'default';
    }
  }

  private memberColorLabel(context: MemberColorContext): string {
    switch (this.memberColorMode) {
      case 'section': return `Section ${context.sectionNumber}`;
      case 'material': {
        const name = this.doc.findMaterialByNumber(context.materialNumber)?.name;
        return name || `Material ${context.materialNumber}`;
      }
      case 'element-type': return `Element type ${context.elementType ?? 'unknown'}`;
      default: return 'Member';
    }
  }

  private drawLabels(): void {
    this.labelCtx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    if (document.activeElement === this.renderer.domElement) {
      const x = this.keyboardCursor.x * this.labelCanvas.width;
      const y = this.keyboardCursor.y * this.labelCanvas.height;
      this.labelCtx.save();
      this.labelCtx.strokeStyle = this.isDark ? '#8fd3ff' : '#00689f';
      this.labelCtx.lineWidth = 2;
      this.labelCtx.beginPath();
      this.labelCtx.moveTo(x - 9, y);
      this.labelCtx.lineTo(x + 9, y);
      this.labelCtx.moveTo(x, y - 9);
      this.labelCtx.lineTo(x, y + 9);
      this.labelCtx.stroke();
      this.labelCtx.restore();
    }
    if (!this.layers.labels) return;
    const candidates: Array<LabelCandidate<{
      text: string;
      color: string;
      baselineOffset: number;
    }>> = [];
    const temp = new THREE.Vector3();
    const world = new THREE.Vector3();
    const theme = this.isDark ? THEME.dark : THEME.light;

    const add = (
      position: THREE.Vector3,
      text: string,
      color: string,
      priority: number,
      baselineOffset: number = 4,
    ): void => {
      const screen = this.projectToScreen(position, temp);
      if (!screen) return;
      candidates.push({
        value: { text, color, baselineOffset },
        x: screen.x,
        y: screen.y,
        priority,
      });
    };

    if (this.showNodeNumbersValue && this.layers.nodes) {
      for (const node of this.doc.nodes) {
        if (!node.isShown || !this.entityPassesIsolation('node', node.number)) continue;
        const selected = this.selectedNodeNumber === node.number;
        if (this.labelDensity.mode === 'selected-only' && !selected) continue;
        add(world.set(node.x, node.y, node.z).clone(), String(node.number), theme.labelNode, selected ? 100 : 10, 6);
      }
    }

    if (this.showMemberNumbersValue && this.layers.members) {
      for (const member of this.doc.members) {
        if (!member.isShown || !this.entityPassesIsolation('member', member.number)) continue;
        const i = this.nodeIndex.get(member.iNodeNumber);
        const j = this.nodeIndex.get(member.jNodeNumber);
        if (!i || !j) continue;
        const selected = this.selectedMemberNumber === member.number;
        if (this.labelDensity.mode === 'selected-only' && !selected) continue;
        add(
          world.set((i.x + j.x) / 2, (i.y + j.y) / 2, (i.z + j.z) / 2).clone(),
          String(member.number),
          theme.labelMember,
          selected ? 100 : 8,
        );
      }
    }

    if (this.showWallNumbersValue && this.layers.walls) {
      for (const wall of this.doc.walls) {
        if (!wall.isShown || !this.entityPassesIsolation('wall', wall.number)) continue;
        const nodes = [wall.leftBottomNode, wall.rightBottomNode, wall.rightTopNode, wall.leftTopNode]
          .map(number => this.nodeIndex.get(number))
          .filter((node): node is NonNullable<typeof node> => !!node);
        if (nodes.length !== 4) continue;
        const selected = this.selectedWallNumber === wall.number;
        if (this.labelDensity.mode === 'selected-only' && !selected) continue;
        add(
          new THREE.Vector3(
            nodes.reduce((sum, node) => sum + node.x, 0) / 4,
            nodes.reduce((sum, node) => sum + node.y, 0) / 4,
            nodes.reduce((sum, node) => sum + node.z, 0) / 4,
          ),
          String(wall.number),
          theme.labelWall,
          selected ? 100 : 9,
        );
      }
    }

    if (this.layers.loads && this.loadOptions.showValues) {
      for (const label of this.loadLabels) add(label.position, label.text, label.color, label.priority);
    }
    if (this.layers.results) {
      for (const label of this.resultLabels) add(label.position, label.text, label.color, label.priority);
    }

    const accepted = this.labelDensity.mode === 'all'
      ? thinLabelCandidates(candidates, this.labelDensity.maxLabels, 0)
      : thinLabelCandidates(candidates, this.labelDensity.maxLabels, this.labelDensity.minSpacingPx);
    this.labelCtx.font = LABEL_FONT;
    this.labelCtx.textAlign = 'center';
    this.labelCtx.textBaseline = 'bottom';
    for (const candidate of accepted) {
      this.labelCtx.fillStyle = candidate.value.color;
      this.labelCtx.fillText(
        candidate.value.text,
        candidate.x,
        candidate.y - candidate.value.baselineOffset,
      );
    }

    const hudLines: string[] = [];
    if (this.layers.loads && this.loadOptions.visible) {
      hudLines.push(`Load case ${(this.loadCaseIndex ?? this.doc.loadCaseIndex) + 1}`);
    }
    const resultFrame = this.analysisResults?.frames[this.resultFrameIndex];
    if (this.layers.results && resultFrame) {
      const time = resultFrame.time === undefined
        ? ''
        : `, t=${this.formatNumber(resultFrame.time)}${this.analysisResults?.units?.time ? ` ${this.analysisResults.units.time}` : ''}`;
      hudLines.push(`Result ${this.resultFrameIndex + 1}/${this.analysisResults!.frames.length}${time}`);
    }
    if (hudLines.length > 0) {
      this.labelCtx.save();
      this.labelCtx.font = LABEL_FONT;
      this.labelCtx.textAlign = 'left';
      this.labelCtx.textBaseline = 'top';
      this.labelCtx.fillStyle = this.isDark ? '#f2f2f2' : '#333333';
      hudLines.forEach((line, index) => this.labelCtx.fillText(line, 8, 8 + index * 16));
      this.labelCtx.restore();
    }
  }

  private projectToScreen(
    worldPosition: THREE.Vector3,
    temp: THREE.Vector3,
  ): { x: number; y: number } | null {
    temp.copy(worldPosition).project(this.camera);
    if (temp.z < -1 || temp.z > 1) return null;
    return {
      x: (temp.x * 0.5 + 0.5) * this.labelCanvas.width,
      y: (-temp.y * 0.5 + 0.5) * this.labelCanvas.height,
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.pointerDownPos) return;
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;
    if (dx * dx + dy * dy > CLICK_DRAG_THRESHOLD_PX ** 2) return;
    if (this.drawingMode !== 'none') this.handleDrawingClick(event.clientX, event.clientY);
    else this.handleSelectionClick(event.clientX, event.clientY);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.drawingStart || this.drawingMode !== 'member') return;
    const point = this.screenToDrawingPoint(event.clientX, event.clientY);
    if (!point) return;
    this.clearGroup(this.drawingGroup);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...this.drawingStart.position),
      new THREE.Vector3(...point.position),
    ]);
    this.drawingGroup.add(new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({ color: 0xff9800, dashSize: 8, gapSize: 5 }),
    ));
    const preview = this.drawingGroup.children[0] as THREE.Line;
    preview.computeLineDistances();
    this.invalidate();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (document.activeElement !== this.renderer.domElement) {
      if (event.key === 'Escape' && this.drawingMode !== 'none') this.cancelDrawing();
      return;
    }
    const stepX = 12 / this.getWidth();
    const stepY = 12 / this.getHeight();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (event.key === 'ArrowLeft') this.keyboardCursor.x -= stepX;
      else if (event.key === 'ArrowRight') this.keyboardCursor.x += stepX;
      else if (event.key === 'ArrowUp') this.keyboardCursor.y -= stepY;
      else this.keyboardCursor.y += stepY;
      this.keyboardCursor.x = THREE.MathUtils.clamp(this.keyboardCursor.x, 0, 1);
      this.keyboardCursor.y = THREE.MathUtils.clamp(this.keyboardCursor.y, 0, 1);
      this.invalidate();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const rect = this.renderer.domElement.getBoundingClientRect();
      const clientX = rect.left + rect.width * this.keyboardCursor.x;
      const clientY = rect.top + rect.height * this.keyboardCursor.y;
      if (this.drawingMode === 'none') this.handleSelectionClick(clientX, clientY);
      else this.handleDrawingClick(clientX, clientY);
    } else if (event.key === 'Escape' && this.drawingMode !== 'none') {
      event.preventDefault();
      this.cancelDrawing();
    }
  };

  private handleSelectionClick(clientX: number, clientY: number): void {
    const local = this.clientToLocal(clientX, clientY);
    if (!local) return;
    const node = this.layers.nodes ? this.pickNodeAtScreen(local.x, local.y) : null;
    const member = this.layers.members ? this.pickMemberAtScreen(local.x, local.y) : null;
    if (node && member) {
      const nodeScore = node.distanceSq / NODE_PICK_RADIUS_PX ** 2;
      const memberScore = member.distanceSq / MEMBER_PICK_RADIUS_PX ** 2;
      this.setSelection(nodeScore <= memberScore
        ? { kind: 'node', nodeNumber: node.nodeNumber }
        : { kind: 'member', memberNumber: member.memberNumber });
      return;
    }
    if (node) {
      this.setSelection({ kind: 'node', nodeNumber: node.nodeNumber });
      return;
    }
    if (member) {
      this.setSelection({ kind: 'member', memberNumber: member.memberNumber });
      return;
    }
    const wall = this.layers.walls ? this.pickWallAtScreen(local.x, local.y) : null;
    if (wall) {
      this.setSelection({ kind: 'wall', wallNumber: wall.wallNumber });
      return;
    }
    this.clearSelection();
  }

  private handleDrawingClick(clientX: number, clientY: number): void {
    const point = this.screenToDrawingPoint(clientX, clientY);
    if (!point) return;
    if (this.drawingMode === 'node') {
      this.drawingEventHandler?.({
        type: 'node-create',
        position: point.position,
        existingNodeNumber: point.nodeNumber,
      });
    } else if (this.drawingMode === 'member') {
      if (!this.drawingStart) {
        this.drawingStart = point;
        this.drawingEventHandler?.({
          type: 'member-start',
          position: point.position,
          nodeNumber: point.nodeNumber,
        });
      } else {
        const start = this.drawingStart;
        this.drawingStart = null;
        this.clearGroup(this.drawingGroup);
        if (new THREE.Vector3(...start.position).distanceToSquared(new THREE.Vector3(...point.position)) > 1e-12) {
          this.drawingEventHandler?.({
            type: 'member-create',
            start: start.position,
            end: point.position,
            startNodeNumber: start.nodeNumber,
            endNodeNumber: point.nodeNumber,
          });
        }
      }
    } else if (this.drawingMode === 'move' || this.drawingMode === 'duplicate') {
      const selection = this.getSelection();
      if (selection.kind !== 'none') {
        this.drawingEventHandler?.({
          type: 'selection-move',
          selection,
          target: point.position,
          duplicate: this.drawingMode === 'duplicate',
        });
      }
    }
    this.invalidate();
  }

  private screenToDrawingPoint(clientX: number, clientY: number): DrawingStart | null {
    const local = this.clientToLocal(clientX, clientY);
    if (!local) return null;
    const plane = this.getDrawingPlane();
    if (this.drawingOptions.snapToNodes) {
      const hit = this.pickNodeAtScreen(
        local.x,
        local.y,
        this.drawingOptions.nodeSnapRadiusPx,
        node => Math.abs(plane.distanceToPoint(new THREE.Vector3(node.x, node.y, node.z))) < 1e-6,
      );
      if (hit) {
        const node = this.nodeIndex.get(hit.nodeNumber);
        if (node) return { position: [node.x, node.y, node.z], nodeNumber: node.number };
      }
    }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(
        (local.x / this.getWidth()) * 2 - 1,
        -(local.y / this.getHeight()) * 2 + 1,
      ),
      this.camera,
    );
    const intersection = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, intersection)) return null;
    let position = intersection.toArray() as Vector3Tuple;
    if (this.drawingOptions.snapToGrid) {
      position = snapPoint(position, this.drawingOptions.gridSpacing, this.getDrawingAxes());
    }
    return { position };
  }

  private getDrawingPlane(): THREE.Plane {
    const transformCenter = this.drawingMode === 'move' || this.drawingMode === 'duplicate'
      ? this.getSelectionCenter()
      : null;
    if (this.viewMode.kind === 'elevation-x') {
      return new THREE.Plane(new THREE.Vector3(0, 1, 0), -(transformCenter?.y ?? this.viewMode.offset ?? 0));
    }
    if (this.viewMode.kind === 'elevation-y') {
      return new THREE.Plane(new THREE.Vector3(1, 0, 0), -(transformCenter?.x ?? this.viewMode.offset ?? 0));
    }
    const elevation = transformCenter?.z ?? (this.viewMode.kind === 'plan' ? this.viewMode.elevation ?? 0 : 0);
    return new THREE.Plane(new THREE.Vector3(0, 0, 1), -elevation);
  }

  private getSelectionCenter(): THREE.Vector3 | null {
    const selection = this.getSelection();
    const nodeNumbers = selection.kind === 'node'
      ? [selection.nodeNumber]
      : selection.kind === 'member'
        ? (() => {
            const member = this.memberIndex.get(selection.memberNumber);
            return member ? [member.iNodeNumber, member.jNodeNumber] : [];
          })()
        : selection.kind === 'wall'
          ? (() => {
              const wall = this.doc.walls.find(item => item.number === selection.wallNumber);
              return wall ? [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode] : [];
            })()
          : [];
    const nodes = [...new Set(nodeNumbers)]
      .map(number => this.nodeIndex.get(number))
      .filter((node): node is Node => node !== undefined);
    if (nodes.length === 0) return null;
    return new THREE.Vector3(
      nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length,
      nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length,
      nodes.reduce((sum, node) => sum + node.z, 0) / nodes.length,
    );
  }

  private getDrawingAxes(): Array<0 | 1 | 2> {
    if (this.viewMode.kind === 'elevation-x') return [0, 2];
    if (this.viewMode.kind === 'elevation-y') return [1, 2];
    return [0, 1];
  }

  private clientToLocal(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return clientPointToViewport(clientX, clientY, rect, this.getWidth(), this.getHeight());
  }

  private pickNodeAtScreen(
    x: number,
    y: number,
    radius: number = NODE_PICK_RADIUS_PX,
    predicate?: (node: Node) => boolean,
  ): { nodeNumber: number; distanceSq: number } | null {
    const temp = new THREE.Vector3();
    const position = new THREE.Vector3();
    let best: { nodeNumber: number; distanceSq: number } | null = null;
    for (const node of this.doc.nodes) {
      if (!node.isShown || !this.entityPassesIsolation('node', node.number)) continue;
      if (predicate && !predicate(node)) continue;
      const screen = this.projectToScreen(position.set(node.x, node.y, node.z), temp);
      if (!screen) continue;
      const distanceSq = (screen.x - x) ** 2 + (screen.y - y) ** 2;
      if (distanceSq > radius ** 2 || (best && distanceSq >= best.distanceSq)) continue;
      best = { nodeNumber: node.number, distanceSq };
    }
    return best;
  }

  private pickMemberAtScreen(x: number, y: number): { memberNumber: number; distanceSq: number } | null {
    const temp = new THREE.Vector3();
    const world = new THREE.Vector3();
    let best: { memberNumber: number; distanceSq: number } | null = null;
    for (const member of this.doc.members) {
      if (!member.isShown || !this.entityPassesIsolation('member', member.number)) continue;
      const i = this.nodeIndex.get(member.iNodeNumber);
      const j = this.nodeIndex.get(member.jNodeNumber);
      if (!i || !j) continue;
      const a = this.projectToScreen(world.set(i.x, i.y, i.z), temp);
      const b = this.projectToScreen(world.set(j.x, j.y, j.z), temp);
      if (!a || !b) continue;
      const distanceSq = pointToSegmentDistanceSq(x, y, a.x, a.y, b.x, b.y);
      if (distanceSq > MEMBER_PICK_RADIUS_PX ** 2 || (best && distanceSq >= best.distanceSq)) continue;
      best = { memberNumber: member.number, distanceSq };
    }
    return best;
  }

  private pickWallAtScreen(x: number, y: number): { wallNumber: number; distanceSq: number } | null {
    const temp = new THREE.Vector3();
    const world = new THREE.Vector3();
    let best: { wallNumber: number; distanceSq: number } | null = null;
    for (const wall of this.doc.walls) {
      if (!wall.isShown || !this.entityPassesIsolation('wall', wall.number)) continue;
      const nodes = [wall.leftBottomNode, wall.rightBottomNode, wall.rightTopNode, wall.leftTopNode]
        .map(number => this.nodeIndex.get(number));
      if (nodes.some(node => !node)) continue;
      const polygon = nodes.map(node => this.projectToScreen(world.set(node!.x, node!.y, node!.z), temp));
      if (polygon.some(point => !point)) continue;
      const screenPolygon = polygon as Array<{ x: number; y: number }>;
      let distanceSq = pointInPolygon({ x, y }, screenPolygon) ? 0 : Infinity;
      for (let index = 0; index < screenPolygon.length; index++) {
        const a = screenPolygon[index];
        const b = screenPolygon[(index + 1) % screenPolygon.length];
        distanceSq = Math.min(distanceSq, pointToSegmentDistanceSq(x, y, a.x, a.y, b.x, b.y));
      }
      if (distanceSq > WALL_PICK_RADIUS_PX ** 2 || (best && distanceSq >= best.distanceSq)) continue;
      best = { wallNumber: wall.number, distanceSq };
    }
    return best;
  }

  private hasSelection(): boolean {
    return this.selectedNodeNumber !== null
      || this.selectedMemberNumber !== null
      || this.selectedWallNumber !== null;
  }

  private entityPassesIsolation(kind: 'node' | 'member' | 'wall', number: number): boolean {
    if (this.selectionDisplayMode !== 'selected-only' || !this.hasSelection()) return true;
    if (kind === 'node') return number === this.selectedNodeNumber;
    if (kind === 'member') return number === this.selectedMemberNumber;
    return number === this.selectedWallNumber;
  }

  private getSymbolSize(): number {
    const bounds = calculateBounds(this.doc.nodes);
    return Math.max(8, (bounds?.maxDimension ?? 200) * 0.035);
  }

  private getVisibleGeometryPoints(): Array<{ x: number; y: number; z: number }> {
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (const node of this.doc.nodes) {
      if (node.isShown) points.push(node);
    }
    for (const member of this.doc.members) {
      if (!member.isShown) continue;
      const i = this.nodeIndex.get(member.iNodeNumber) ?? this.doc.findNodeByNumber(member.iNodeNumber);
      const j = this.nodeIndex.get(member.jNodeNumber) ?? this.doc.findNodeByNumber(member.jNodeNumber);
      if (i) points.push(i);
      if (j) points.push(j);
    }
    for (const wall of this.doc.walls) {
      if (!wall.isShown) continue;
      for (const number of [wall.leftBottomNode, wall.rightBottomNode, wall.rightTopNode, wall.leftTopNode]) {
        const node = this.nodeIndex.get(number) ?? this.doc.findNodeByNumber(number);
        if (node) points.push(node);
      }
    }
    return points;
  }

  private formatVector(vector: THREE.Vector3): string {
    return `(${this.formatNumber(vector.x)}, ${this.formatNumber(vector.y)}, ${this.formatNumber(vector.z)})`;
  }

  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '-';
    return Number(value.toPrecision(4)).toString();
  }

  private clearDynamicGroups(): void {
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.memberGroup);
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.boundaryGroup);
    this.clearGroup(this.loadGroup);
    this.clearGroup(this.resultGroup);
    this.loadLabels = [];
    this.resultLabels = [];
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      this.disposeObject3D(child);
    }
  }

  /** Recursively releases geometries, every material, textures and uniforms. */
  private disposeObject3D(object: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    object.traverse(child => {
      const renderable = child as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.geometry) geometries.add(renderable.geometry);
      const childMaterials = Array.isArray(renderable.material)
        ? renderable.material
        : renderable.material ? [renderable.material] : [];
      for (const material of childMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
        const uniforms = (material as THREE.ShaderMaterial).uniforms;
        if (uniforms) {
          for (const uniform of Object.values(uniforms)) {
            if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
          }
        }
      }
    });
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.resultAnimation = null;
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();

    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
      this.disposeObject3D(child);
    }
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelCanvas.remove();
  }
}
