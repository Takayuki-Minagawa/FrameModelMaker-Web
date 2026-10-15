import type { FrameDocument } from '../../../src/models/FrameDocument';
import type {
  AnalysisResultSet,
  ColorLegendEntry,
  DrawingCursorInfo,
  DrawingEvent,
  DrawingMode,
  DrawingOptions,
  LabelDensityOptions,
  MemberColorMode,
  ProjectionMode,
  ResultAnimationOptions,
  ResultDisplayOptions,
  SelectionDisplayMode,
  StandardView,
  ViewerCameraState,
  ViewerLayers,
  ViewerSelection,
  ViewMode,
} from '../../../src/viewer/ViewerTypes';

/**
 * Headless stand-in for ModelViewer (which needs WebGL). It records state and
 * lets tests emit selection / drawing events exactly like the real viewer.
 */
export class FakeModelViewer {
  showNodeNumbers = true;
  showMemberNumbers = false;
  showWallNumbers = false;
  calls: string[] = [];
  private selection: ViewerSelection = { kind: 'none' };
  private selectionHandler: ((selection: ViewerSelection) => void) | null = null;
  private drawingHandler: ((event: DrawingEvent) => void) | null = null;
  private cursorHandler: ((info: DrawingCursorInfo | null) => void) | null = null;
  private drawingMode: DrawingMode = 'none';
  private drawingStart: DrawingCursorInfo | null = null;
  private drawingOptions: DrawingOptions = { gridSpacing: 100, snapToGrid: true, snapToNodes: true, nodeSnapRadiusPx: 12 };
  private viewMode: ViewMode = { kind: '3d' };
  private projection: ProjectionMode = 'perspective';
  private layers: ViewerLayers = {
    grid: true,
    axes: true,
    nodes: true,
    members: true,
    walls: true,
    boundaries: true,
    loads: false,
    results: false,
    labels: true,
  };
  private localAxes = false;
  private labelDensity: LabelDensityOptions = { mode: 'auto', maxLabels: 600, minSpacingPx: 28 };
  private colorMode: MemberColorMode = 'default';
  private selectionDisplay: SelectionDisplayMode = 'normal';
  private results: AnalysisResultSet | null = null;
  private frameIndex = 0;
  private playing = false;
  private display: ResultDisplayOptions = {
    showDeformation: true,
    showReactions: false,
    showUndeformed: true,
    deformationScale: 1,
    reactionScale: 1,
    sectionForce: null,
    sectionForceScale: 1,
  };
  loadCaseIndex: number | null = null;
  lastAnimation: ResultAnimationOptions | null = null;

  constructor(
    readonly container: HTMLElement,
    readonly doc: FrameDocument,
  ) {
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    container.appendChild(canvas);
    this.canvas = canvas;
  }

  readonly canvas: HTMLCanvasElement;

  private record(name: string): void {
    this.calls.push(name);
  }

  setAccessibleLabel(label: string): void {
    this.canvas.setAttribute('aria-label', label);
  }
  focus(): void {
    this.canvas.focus();
  }
  invalidate(): void {}
  resize(): void {
    this.record('resize');
  }
  updateModel(fit = true): void {
    this.record(`updateModel:${fit}`);
  }
  updateAttributes(kind: string): void {
    this.record(`updateAttributes:${kind}`);
  }
  setLocalAxesVisible(visible: boolean): void {
    this.localAxes = visible;
  }
  getLocalAxesVisible(): boolean {
    return this.localAxes;
  }
  fitToView(): void {
    this.record('fitToView');
  }
  zoomToSelection(): boolean {
    this.record('zoomToSelection');
    return this.selection.kind !== 'none';
  }
  setStandardView(view: StandardView): void {
    this.record(`setStandardView:${view}`);
  }
  getProjectionMode(): ProjectionMode {
    return this.projection;
  }
  setProjectionMode(mode: ProjectionMode): void {
    this.projection = mode;
  }
  getCameraState(): ViewerCameraState {
    return { projection: this.projection, position: [1, 1, 1], target: [0, 0, 0], up: [0, 0, 1], zoom: 1 };
  }
  restoreCameraState(state: ViewerCameraState): void {
    this.projection = state.projection;
    this.record('restoreCameraState');
  }
  setLayerVisibility(layers: Partial<ViewerLayers>): void {
    this.layers = { ...this.layers, ...layers };
  }
  getLayerVisibility(): ViewerLayers {
    return { ...this.layers };
  }
  resetDisplay(): void {
    this.record('resetDisplay');
  }
  setSelectionDisplayMode(mode: SelectionDisplayMode): void {
    this.selectionDisplay = mode;
  }
  getSelectionDisplayMode(): SelectionDisplayMode {
    return this.selectionDisplay;
  }
  setMemberColorMode(mode: MemberColorMode): void {
    this.colorMode = mode;
  }
  getMemberColorMode(): MemberColorMode {
    return this.colorMode;
  }
  getColorLegend(): ColorLegendEntry[] {
    if (this.colorMode === 'material')
      return this.doc.materials.map((material) => ({
        key: `material:${material.number}`,
        label: `Material ${material.number}${material.name ? `: ${material.name}` : ''}`,
        color: '#123456',
      }));
    return [{ key: 'default', label: 'Member', color: '#000000' }];
  }
  setLabelDensity(options: Partial<LabelDensityOptions>): void {
    this.labelDensity = { ...this.labelDensity, ...options };
  }
  getLabelDensity(): LabelDensityOptions {
    return { ...this.labelDensity };
  }
  setLoadCase(index: number | null): void {
    this.loadCaseIndex = index;
  }
  setLoadDisplay(): void {}
  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }
  getViewMode(): ViewMode {
    return this.viewMode;
  }
  setDrawingMode(mode: DrawingMode, options: Partial<DrawingOptions> = {}): void {
    this.drawingMode = mode;
    this.drawingStart = null;
    this.drawingOptions = { ...this.drawingOptions, ...options };
  }
  getDrawingMode(): DrawingMode {
    return this.drawingMode;
  }
  getDrawingOptions(): DrawingOptions {
    return { ...this.drawingOptions };
  }
  setDrawingOptions(options: Partial<DrawingOptions>): void {
    this.drawingOptions = { ...this.drawingOptions, ...options };
  }
  setOnDrawingEvent(handler: ((event: DrawingEvent) => void) | null): void {
    this.drawingHandler = handler;
  }
  setOnDrawingCursor(handler: ((info: DrawingCursorInfo | null) => void) | null): void {
    this.cursorHandler = handler;
  }
  getDrawingStart(): DrawingCursorInfo | null {
    return this.drawingStart;
  }
  cancelDrawing(): void {
    this.drawingStart = null;
  }
  /** Mirrors ModelViewer.confirmDrawingPoint for the fake: emits the same events. */
  confirmDrawingPoint(position: [number, number, number]): boolean {
    if (this.drawingMode === 'none') return false;
    const existing = this.doc.nodes.find(
      (node) => Math.abs(node.x - position[0]) < 1e-6 && Math.abs(node.y - position[1]) < 1e-6 && Math.abs(node.z - position[2]) < 1e-6,
    );
    const nodeNumber = existing?.number;
    if (this.drawingMode === 'node') {
      this.drawingHandler?.({ type: 'node-create', position, existingNodeNumber: nodeNumber });
    } else if (this.drawingMode === 'member') {
      if (!this.drawingStart) {
        this.drawingStart = { position, nodeNumber };
        this.drawingHandler?.({ type: 'member-start', position, nodeNumber });
      } else {
        const start = this.drawingStart;
        this.drawingStart = null;
        this.drawingHandler?.({
          type: 'member-create',
          start: start.position,
          end: position,
          startNodeNumber: start.nodeNumber,
          endNodeNumber: nodeNumber,
        });
      }
    } else if (this.selection.kind !== 'none') {
      this.drawingHandler?.({
        type: 'selection-move',
        selection: this.selection,
        target: position,
        duplicate: this.drawingMode === 'duplicate',
      });
    }
    return true;
  }
  setAnalysisResults(results: AnalysisResultSet | null): void {
    this.results = results;
    this.frameIndex = 0;
  }
  getAnalysisResults(): AnalysisResultSet | null {
    return this.results;
  }
  setResultDisplay(options: Partial<ResultDisplayOptions>): void {
    this.display = { ...this.display, ...options };
  }
  getResultDisplay(): ResultDisplayOptions {
    return { ...this.display };
  }
  setResultFrame(index: number): boolean {
    if (!this.results) return false;
    this.frameIndex = Math.max(0, Math.min(this.results.frames.length - 1, index));
    return true;
  }
  getResultFrameIndex(): number {
    return this.frameIndex;
  }
  playResults(options: ResultAnimationOptions = {}): boolean {
    if (!this.results || this.results.frames.length < 2) return false;
    this.playing = true;
    this.lastAnimation = options;
    return true;
  }
  pauseResults(): void {
    this.playing = false;
  }
  isResultAnimationPlaying(): boolean {
    return this.playing;
  }
  setOnSelectionChanged(handler: ((selection: ViewerSelection) => void) | null): void {
    this.selectionHandler = handler;
  }
  getSelection(): ViewerSelection {
    return this.selection;
  }
  setSelection(selection: ViewerSelection, notify = true): void {
    this.selection = selection;
    if (notify) this.selectionHandler?.(selection);
  }
  clearSelection(notify = true): void {
    this.setSelection({ kind: 'none' }, notify);
  }
  setTheme(): void {}
  dispose(): void {}

  // --- test helpers ---
  /** Simulates a click on an entity in the 3D view. */
  emitSelection(selection: ViewerSelection): void {
    this.setSelection(selection, true);
  }
  emitDrawingEvent(event: DrawingEvent): void {
    this.drawingHandler?.(event);
  }
  emitCursor(info: DrawingCursorInfo | null): void {
    this.cursorHandler?.(info);
  }
  /** Advances playback like the animation loop would. */
  tickAnimation(index: number): void {
    const frame = this.results?.frames[index];
    if (!frame) return;
    this.frameIndex = index;
    this.lastAnimation?.onFrame?.(index, frame);
  }
}
