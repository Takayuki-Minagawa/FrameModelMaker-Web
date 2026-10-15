import type { FrameDocument } from '../models/FrameDocument';
import type { DrawingCursorInfo, ModelViewer } from '../viewer/ModelViewer';
import {
  applyNumericConstraints,
  byId,
  createButton,
  createElement,
  formatNumber,
  labelled,
  localText,
} from './UiHelpers';

type Tuple = [number, number, number];

/**
 * Numeric companion to the pointer-driven drawing modes (R10): work plane
 * position, snap spacing and toggles, absolute / relative coordinate entry,
 * and a text read-out of the current cursor position and snapped node.
 */
export function createDrawingPanel(context: {
  doc: FrameDocument;
  viewer: ModelViewer;
  notify(kind: 'info' | 'success' | 'error' | 'cancel', message: string): void;
  /** Ends drawing the same way Escape does (toolbar state, hint). */
  onExit?(): void;
}) {
  const { doc, viewer, notify } = context;
  const panel = byId('drawing-panel');
  const body = byId('drawing-panel-body');
  let lastCursor: DrawingCursorInfo | null = null;
  let lastConfirmed: Tuple | null = null;
  let elements: {
    mode: HTMLElement;
    cursor: HTMLElement;
    spacing: HTMLInputElement;
    snapGrid: HTMLInputElement;
    snapNodes: HTMLInputElement;
    planeLabel: HTMLSpanElement;
    plane: HTMLInputElement;
    absolute: HTMLInputElement[];
    relative: HTMLInputElement[];
  } | null = null;

  function planeAxis(): { index: 0 | 1 | 2; label: string } {
    const mode = viewer.getViewMode();
    if (mode.kind === 'elevation-x') return { index: 1, label: localText('作業平面 Y (cm)', 'Work plane Y (cm)') };
    if (mode.kind === 'elevation-y') return { index: 0, label: localText('作業平面 X (cm)', 'Work plane X (cm)') };
    return { index: 2, label: localText('作業平面 Z (cm)', 'Work plane Z (cm)') };
  }

  function planeOffset(): number {
    const mode = viewer.getViewMode();
    if (mode.kind === 'plan') return mode.elevation ?? 0;
    if (mode.kind === 'elevation-x' || mode.kind === 'elevation-y') return mode.offset ?? 0;
    return 0;
  }

  function applyPlaneOffset(value: number): void {
    const mode = viewer.getViewMode();
    if (!Number.isFinite(value)) return;
    if (mode.kind === 'plan') viewer.setViewMode({ kind: 'plan', elevation: value }, false);
    else if (mode.kind === 'elevation-x') viewer.setViewMode({ kind: 'elevation-x', offset: value }, false);
    else if (mode.kind === 'elevation-y') viewer.setViewMode({ kind: 'elevation-y', offset: value }, false);
    else viewer.setViewMode({ kind: 'plan', elevation: value }, false);
    notify('info', localText(`作業平面を ${formatNumber(value)} cm に設定しました。`, `Work plane set to ${formatNumber(value)} cm.`));
    syncMode();
  }

  /** Reference point for relative input: pending member start, selection centre, last confirmed point, or cursor. */
  function basePoint(): Tuple {
    const start = viewer.getDrawingStart();
    if (start) return start.position;
    const mode = viewer.getDrawingMode();
    if (mode === 'move' || mode === 'duplicate') {
      const selection = viewer.getSelection();
      const numbers =
        selection.kind === 'node'
          ? [selection.nodeNumber]
          : selection.kind === 'member'
            ? (() => {
                const member = doc.findMemberByNumber(selection.memberNumber);
                return member ? [member.iNodeNumber, member.jNodeNumber] : [];
              })()
            : selection.kind === 'wall'
              ? (() => {
                  const wall = doc.walls.find((item) => item.number === selection.wallNumber);
                  return wall ? [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode] : [];
                })()
              : [];
      const nodes = [...new Set(numbers)].map((number) => doc.findNodeByNumber(number)).filter((node) => node);
      if (nodes.length)
        return [
          nodes.reduce((sum, node) => sum + node!.x, 0) / nodes.length,
          nodes.reduce((sum, node) => sum + node!.y, 0) / nodes.length,
          nodes.reduce((sum, node) => sum + node!.z, 0) / nodes.length,
        ];
    }
    return lastConfirmed ?? lastCursor?.position ?? [0, 0, 0];
  }

  function confirm(position: Tuple): void {
    if (!position.every(Number.isFinite)) {
      notify('error', localText('座標は有限の数値を入力してください。', 'Enter finite coordinates.'));
      return;
    }
    const mode = viewer.getDrawingMode();
    if (mode === 'none') {
      notify('error', localText('先に作図・移動・複製モードを選択してください。', 'Choose a drawing, move or duplicate mode first.'));
      return;
    }
    if (!viewer.confirmDrawingPoint(position)) return;
    lastConfirmed = position;
    syncMode();
  }

  function build(): void {
    body.replaceChildren();
    const mode = createElement('p', 'panel-subtitle');
    mode.id = 'drawing-mode-text';
    const cursor = createElement('p');
    cursor.id = 'drawing-cursor-text';
    cursor.setAttribute('aria-live', 'polite');
    const form = createElement('div', 'panel-form');
    const options = viewer.getDrawingOptions();
    const spacing = createElement('input');
    spacing.name = 'snap-spacing';
    applyNumericConstraints(spacing, { min: 0 });
    spacing.value = String(options.gridSpacing);
    spacing.addEventListener('change', () => {
      const value = Number(spacing.value);
      if (!Number.isFinite(value) || value <= 0) {
        notify('error', localText('スナップ間隔は正の値を入力してください。', 'Snap spacing must be positive.'));
        return;
      }
      viewer.setDrawingOptions({ gridSpacing: value });
      notify('info', localText(`スナップ間隔を ${formatNumber(value)} cm に設定しました。`, `Snap spacing set to ${formatNumber(value)} cm.`));
    });
    const snapGrid = createElement('input');
    snapGrid.type = 'checkbox';
    snapGrid.name = 'snap-grid';
    snapGrid.checked = options.snapToGrid;
    snapGrid.addEventListener('change', () => viewer.setDrawingOptions({ snapToGrid: snapGrid.checked }));
    const snapNodes = createElement('input');
    snapNodes.type = 'checkbox';
    snapNodes.name = 'snap-nodes';
    snapNodes.checked = options.snapToNodes;
    snapNodes.addEventListener('change', () => viewer.setDrawingOptions({ snapToNodes: snapNodes.checked }));
    const plane = createElement('input');
    plane.name = 'work-plane';
    applyNumericConstraints(plane, {});
    plane.value = String(planeOffset());
    plane.addEventListener('change', () => applyPlaneOffset(Number(plane.value)));
    const planeField = labelled(planeAxis().label, plane);
    const planeLabel = planeField.querySelector('span')!;
    const axisInputs = (prefix: string, defaults: Tuple): HTMLInputElement[] =>
      (['X', 'Y', 'Z'] as const).map((axis, index) => {
        const input = createElement('input');
        input.name = `${prefix}-${axis.toLowerCase()}`;
        applyNumericConstraints(input, {});
        input.value = String(defaults[index]);
        return input;
      });
    const absolute = axisInputs('absolute', [0, 0, 0]);
    const relative = axisInputs('relative', [0, 0, 0]);
    const absoluteRow = createElement('div', 'panel-inline-actions');
    absoluteRow.append(...absolute);
    const relativeRow = createElement('div', 'panel-inline-actions');
    relativeRow.append(...relative);
    const confirmAbsolute = createButton(localText('絶対座標で確定', 'Confirm absolute'), () =>
      confirm(absolute.map((input) => Number(input.value)) as Tuple),
    );
    confirmAbsolute.id = 'drawing-confirm-absolute';
    const confirmRelative = createButton(localText('相対座標で確定（基準点 + Δ）', 'Confirm relative (base + Δ)'), () => {
      const base = basePoint();
      confirm(relative.map((input, index) => base[index] + Number(input.value)) as Tuple);
    });
    confirmRelative.id = 'drawing-confirm-relative';
    const cancel = createButton(
      localText('作図モードを終了', 'Exit drawing mode'),
      () => {
        viewer.setDrawingMode('none');
        hide();
        context.onExit?.();
        notify('cancel', localText('作図モードを終了しました。', 'Drawing mode ended.'));
      },
      'panel-action secondary',
    );
    form.append(
      labelled(localText('スナップ間隔 (cm)', 'Snap spacing (cm)'), spacing),
      labelled(localText('グリッドにスナップ', 'Snap to grid'), snapGrid),
      labelled(localText('節点にスナップ', 'Snap to nodes'), snapNodes),
      planeField,
      labelled(localText('絶対座標 X / Y / Z (cm)', 'Absolute X / Y / Z (cm)'), absoluteRow),
      confirmAbsolute,
      labelled(localText('相対 ΔX / ΔY / ΔZ (cm)', 'Relative ΔX / ΔY / ΔZ (cm)'), relativeRow),
      confirmRelative,
      cancel,
    );
    body.append(mode, cursor, form);
    elements = { mode, cursor, spacing, snapGrid, snapNodes, planeLabel, plane, absolute, relative };
  }

  function syncMode(): void {
    if (!elements) return;
    const mode = viewer.getDrawingMode();
    const labels: Record<string, [string, string]> = {
      none: ['作図モード: なし', 'Drawing mode: none'],
      node: ['作図モード: 節点', 'Drawing mode: node'],
      member: ['作図モード: 部材', 'Drawing mode: member'],
      move: ['作図モード: 移動', 'Drawing mode: move'],
      duplicate: ['作図モード: 複製', 'Drawing mode: duplicate'],
    };
    const start = viewer.getDrawingStart();
    elements.mode.textContent =
      localText(...labels[mode]) +
      (start
        ? ` / ${localText('始点', 'Start')}: (${start.position.map(formatNumber).join(', ')})${start.nodeNumber ? ` ${localText('節点', 'node')} ${start.nodeNumber}` : ''}`
        : '');
    elements.mode.dataset.mode = mode;
    elements.planeLabel.textContent = planeAxis().label;
    elements.plane.value = String(planeOffset());
    const base = basePoint();
    elements.absolute.forEach((input, index) => {
      if (document.activeElement !== input) input.value = String(formatNumber(base[index]));
    });
  }

  function syncCursor(info: DrawingCursorInfo | null): void {
    lastCursor = info;
    if (!elements) return;
    elements.cursor.textContent = info
      ? `${localText('現在座標', 'Cursor')}: (${info.position.map(formatNumber).join(', ')}) cm / ${localText('スナップ先', 'Snap')}: ${
          info.nodeNumber ? `${localText('節点', 'node')} ${info.nodeNumber}` : localText('グリッド', 'grid')
        }`
      : `${localText('現在座標', 'Cursor')}: — / ${localText('スナップ先', 'Snap')}: —`;
    elements.cursor.dataset.nodeNumber = info?.nodeNumber ? String(info.nodeNumber) : '';
  }

  function show(): void {
    if (!elements) build();
    panel.classList.remove('hidden');
    syncMode();
    syncCursor(lastCursor);
  }

  function hide(): void {
    panel.classList.add('hidden');
  }

  byId('drawing-panel-close').addEventListener('click', hide);

  return {
    show,
    hide,
    syncMode,
    syncCursor,
    confirm,
    isOpen: () => !panel.classList.contains('hidden'),
  };
}
