import './styles/main.css';
import { FrameDocument } from './models/FrameDocument';
import { parseStructForm } from './io/StructFormParser';
import { writeStructForm } from './io/StructFormWriter';
import { ModelViewer } from './viewer/ModelViewer';
import { DataGrid, ColumnDef } from './ui/DataGrid';
import { Node } from './models/Node';
import { Member } from './models/Member';
import { Section } from './models/Section';
import { Material } from './models/Material';
import { BoundaryCondition } from './models/BoundaryCondition';
import { Spring } from './models/Spring';
import { Wall } from './models/Wall';
import { NodeLoad } from './models/NodeLoad';
import { CMQLoad } from './models/CMQLoad';
import { MemberLoad } from './models/MemberLoad';
import { t, getLang, setLang, Lang } from './i18n';

// ===== 定数 =====
const MERGE_NODE_THRESHOLD = 2.0;
const MIN_DATA_PANEL_WIDTH = 200;

// ===== グローバルドキュメント =====
const doc = new FrameDocument();

let viewer: ModelViewer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentGrid: DataGrid<any> | null = null;
let activeTab = 'nodes';

// ===== タブ定義 =====
const tabDefs = [
  { id: 'nodes', i18nKey: 'tab.nodes' },
  { id: 'boundaries', i18nKey: 'tab.boundaries' },
  { id: 'materials', i18nKey: 'tab.materials' },
  { id: 'sections', i18nKey: 'tab.sections' },
  { id: 'springs', i18nKey: 'tab.springs' },
  { id: 'members', i18nKey: 'tab.members' },
  { id: 'walls', i18nKey: 'tab.walls' },
  { id: 'nodeloads', i18nKey: 'tab.nodeloads' },
  { id: 'cmqloads', i18nKey: 'tab.cmqloads' },
  { id: 'memberloads', i18nKey: 'tab.memberloads' },
];

// ===== 初期化 =====
function init(): void {
  setupMenu();
  setupTabs();
  setupToolbar();
  setupViewer();
  setupResizer();
  setupThemeToggle();
  setupLangToggle();
  setupHelp();
  applyI18n();
  updateStatus(t('status.ready'));
  showTab('nodes');
}

// ===== i18n 適用 =====
function applyI18n(): void {
  // data-i18n 属性を持つ全要素のテキストを更新
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  });

  // タブラベルを更新
  document.querySelectorAll<HTMLElement>('#tab-bar .tab').forEach(el => {
    const tabId = el.dataset.tabId;
    const def = tabDefs.find(td => td.id === tabId);
    if (def) el.textContent = t(def.i18nKey);
  });

  // 荷重定義セレクタを更新
  updateLoadCaseSelector();

  // テーマボタンのラベルを更新
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btnTheme.textContent = isDark ? t('theme.light') : t('theme.dark');
  }

  // 言語ボタンのラベルを更新
  const btnLang = document.getElementById('btn-lang');
  if (btnLang) {
    btnLang.textContent = getLang() === 'ja' ? 'EN' : 'JA';
  }

  // ヘルプダイアログのタイトルを更新
  const helpTitle = document.getElementById('help-title');
  if (helpTitle) helpTitle.textContent = t('help.title');

  // ツールバーボタンのラベルを更新
  const btnAdd = document.getElementById('btn-add-row');
  if (btnAdd) btnAdd.textContent = '+ ' + t('toolbar.addRow');
  const btnDel = document.getElementById('btn-delete-row');
  if (btnDel) btnDel.textContent = '- ' + t('toolbar.deleteRow');

  // グリッドを更新（列ヘッダーの言語を反映）
  refreshGrid();
}

// ===== メニュー =====
function setupMenu(): void {
  // ファイルメニュー
  on('menu-new', () => {
    doc.init(); viewer.updateModel(); refreshGrid();
    updateStatus(t('status.newCreated'));
  });
  on('menu-open', () => openFile());
  on('menu-save', () => saveFile());
  on('menu-sample', () => loadSample());

  // 表示メニュー
  on('menu-show-node-num', () => {
    viewer.showNodeNumbers = !viewer.showNodeNumbers;
    updateStatus(t(viewer.showNodeNumbers ? 'status.nodeNumOn' : 'status.nodeNumOff'));
  });
  on('menu-show-member-num', () => {
    viewer.showMemberNumbers = !viewer.showMemberNumbers;
    updateStatus(t(viewer.showMemberNumbers ? 'status.memberNumOn' : 'status.memberNumOff'));
  });

  // 編集メニュー
  on('menu-sort', () => {
    doc.sort(); viewer.updateModel(); refreshGrid();
    updateStatus(t('status.sorted'));
  });
  on('menu-renumber', () => {
    doc.assignNumbers(); viewer.updateModel(); refreshGrid();
    updateStatus(t('status.renumbered'));
  });
  on('menu-merge', () => {
    doc.mergeOverlappingNodes(MERGE_NODE_THRESHOLD); viewer.updateModel(); refreshGrid();
    updateStatus(t('status.merged'));
  });

  // 荷重定義
  on('menu-add-loadcase', () => {
    doc.addLoadCase();
    updateLoadCaseSelector();
    updateStatus(t('status.loadcaseAdded', doc.loadCaseCount));
  });
  on('menu-remove-loadcase', () => {
    if (doc.loadCaseCount > 1) {
      doc.removeLoadCase(doc.loadCaseIndex);
      updateLoadCaseSelector();
      refreshGrid();
      updateStatus(t('status.loadcaseDeleted'));
    }
  });
}

function on(id: string, handler: () => void): void {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

// ===== テーマ切替 =====
function setupThemeToggle(): void {
  // localStorage から復元
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  on('btn-theme', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    viewer.setTheme(newTheme === 'dark');

    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
      btnTheme.textContent = newTheme === 'dark' ? t('theme.light') : t('theme.dark');
    }
  });

  // 初期テーマをビューアに反映
  if (saved === 'dark') {
    // ビューアの初期化後に呼ぶため setTimeout で遅延
    setTimeout(() => viewer.setTheme(true), 0);
  }
}

// ===== 言語切替 =====
function setupLangToggle(): void {
  on('btn-lang', () => {
    const newLang: Lang = getLang() === 'ja' ? 'en' : 'ja';
    setLang(newLang);
    applyI18n();
    updateStatus(t('status.ready'));
  });
}

// ===== ヘルプダイアログ =====
function setupHelp(): void {
  on('btn-help', () => {
    const overlay = document.getElementById('help-overlay');
    const body = document.getElementById('help-body');
    const title = document.getElementById('help-title');
    if (overlay && body && title) {
      title.textContent = t('help.title');
      body.innerHTML = t('help.content');
      overlay.classList.remove('hidden');
    }
  });

  on('help-close', () => {
    const overlay = document.getElementById('help-overlay');
    if (overlay) overlay.classList.add('hidden');
  });

  // オーバーレイクリックで閉じる
  const overlay = document.getElementById('help-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

// ===== ツールバー（行追加・削除） =====
const LOAD_TABS = ['nodeloads', 'cmqloads', 'memberloads'];

function setupToolbar(): void {
  const toolbar = document.getElementById('grid-toolbar')!;

  const btnGroup = document.createElement('div');
  btnGroup.id = 'toolbar-buttons';

  const btnAdd = document.createElement('button');
  btnAdd.id = 'btn-add-row';
  btnAdd.className = 'toolbar-btn';
  btnAdd.textContent = '+ ' + t('toolbar.addRow');
  btnAdd.addEventListener('click', () => addRow());

  const btnDel = document.createElement('button');
  btnDel.id = 'btn-delete-row';
  btnDel.className = 'toolbar-btn toolbar-btn-danger';
  btnDel.textContent = '- ' + t('toolbar.deleteRow');
  btnDel.addEventListener('click', () => deleteRow());

  btnGroup.appendChild(btnAdd);
  btnGroup.appendChild(btnDel);
  toolbar.appendChild(btnGroup);
}

function updateToolbarVisibility(): void {
  const btnGroup = document.getElementById('toolbar-buttons');
  if (btnGroup) {
    btnGroup.style.display = LOAD_TABS.includes(activeTab) ? 'none' : 'flex';
  }
}

function nextNumber(items: { number: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map(i => i.number)) + 1;
}

function addRow(): void {
  switch (activeTab) {
    case 'nodes': {
      const n = new Node();
      n.number = doc.newNodeNumber;
      doc.nodes.push(n);
      break;
    }
    case 'boundaries': {
      const bc = new BoundaryCondition();
      bc.nodeNumber = nextNumber(doc.boundaries.length > 0 ? doc.boundaries.map(b => ({ number: b.nodeNumber })) : []);
      doc.boundaries.push(bc);
      break;
    }
    case 'materials': {
      const m = new Material();
      m.number = nextNumber(doc.materials);
      doc.materials.push(m);
      break;
    }
    case 'sections': {
      const s = new Section();
      s.number = nextNumber(doc.sections);
      doc.sections.push(s);
      break;
    }
    case 'springs': {
      const sp = new Spring();
      sp.number = nextNumber(doc.springs);
      doc.springs.push(sp);
      break;
    }
    case 'members': {
      const mem = new Member();
      mem.number = doc.newMemberNumber;
      doc.members.push(mem);
      break;
    }
    case 'walls': {
      const w = new Wall();
      w.number = nextNumber(doc.walls);
      doc.walls.push(w);
      break;
    }
    default:
      return;
  }
  refreshGrid();
  viewer.updateModel();
}

function deleteRow(): void {
  switch (activeTab) {
    case 'nodes':
      if (doc.nodes.length > 0) doc.nodes.pop();
      break;
    case 'boundaries':
      if (doc.boundaries.length > 0) doc.boundaries.pop();
      break;
    case 'materials':
      if (doc.materials.length > 0) doc.materials.pop();
      break;
    case 'sections':
      if (doc.sections.length > 0) doc.sections.pop();
      break;
    case 'springs':
      if (doc.springs.length > 0) doc.springs.pop();
      break;
    case 'members':
      if (doc.members.length > 0) doc.members.pop();
      break;
    case 'walls':
      if (doc.walls.length > 0) doc.walls.pop();
      break;
    default:
      return;
  }
  refreshGrid();
  viewer.updateModel();
}

// ===== ファイル操作 =====

/** デコード結果 */
interface DecodeResult {
  text: string;
  encoding: string;
}

/** ArrayBuffer を Shift_JIS → UTF-8 でデコード（失敗時はUTF-8フォールバック） */
function decodeTextBuffer(buffer: ArrayBuffer): DecodeResult {
  try {
    return { text: new TextDecoder('shift_jis').decode(buffer), encoding: 'Shift_JIS' };
  } catch {
    return { text: new TextDecoder().decode(buffer), encoding: 'UTF-8' };
  }
}

function openFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dat,.txt';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const backup = writeStructForm(doc);
    try {
      const buffer = await file.arrayBuffer();
      const { text, encoding } = decodeTextBuffer(buffer);
      parseStructForm(text, doc);
      viewer.updateModel();
      refreshGrid();
      updateLoadCaseSelector();
      let status = t('status.fileLoaded', file.name, doc.nodes.length, doc.members.length);
      if (encoding !== 'Shift_JIS') {
        status += t('status.encodingWarning', encoding);
      }
      updateStatus(status);
    } catch (e) {
      try {
        parseStructForm(backup, doc);
      } catch {
        doc.init();
      }
      viewer.updateModel();
      refreshGrid();
      updateLoadCaseSelector();
      updateStatus(t('status.loadError', e instanceof Error ? e.message : String(e)));
      console.error(e);
    }
  });
  input.click();
}

function saveFile(): void {
  const content = writeStructForm(doc);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (doc.title || 'model') + '.dat';
  a.click();
  URL.revokeObjectURL(url);
  updateStatus(t('status.fileSaved'));
}

async function loadSample(): Promise<void> {
  const backup = writeStructForm(doc);
  try {
    const resp = await fetch('./samples/StructForm_SampleData1_Ver8.dat');
    const buffer = await resp.arrayBuffer();
    const { text, encoding } = decodeTextBuffer(buffer);
    parseStructForm(text, doc);
    viewer.updateModel();
    refreshGrid();
    updateLoadCaseSelector();
    let status = t('status.sampleLoaded', doc.nodes.length, doc.members.length);
    if (encoding !== 'Shift_JIS') {
      status += t('status.encodingWarning', encoding);
    }
    updateStatus(status);
  } catch (e) {
    try {
      parseStructForm(backup, doc);
    } catch {
      doc.init();
    }
    viewer.updateModel();
    refreshGrid();
    updateLoadCaseSelector();
    updateStatus(t('status.sampleError', e instanceof Error ? e.message : String(e)));
    console.error(e);
  }
}

// ===== 3Dビューア =====
function setupViewer(): void {
  const container = document.getElementById('viewer-panel')!;
  viewer = new ModelViewer(container, doc);
}

// ===== リサイズ =====
function setupResizer(): void {
  const handle = document.getElementById('resize-handle')!;
  const dataPanel = document.getElementById('data-panel')!;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = dataPanel.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      dataPanel.style.width = Math.max(MIN_DATA_PANEL_WIDTH, startW + delta) + 'px';
      viewer.resize();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      viewer.resize();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ===== タブ =====
function setupTabs(): void {
  const tabBar = document.getElementById('tab-bar')!;
  for (const tab of tabDefs) {
    const el = document.createElement('div');
    el.className = 'tab';
    el.textContent = t(tab.i18nKey);
    el.dataset.tabId = tab.id;
    el.addEventListener('click', () => showTab(tab.id));
    tabBar.appendChild(el);
  }
}

function showTab(tabId: string): void {
  activeTab = tabId;

  document.querySelectorAll('#tab-bar .tab').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.tabId === tabId);
  });

  updateToolbarVisibility();
  refreshGrid();
}

function refreshGrid(): void {
  const container = document.getElementById('grid-container')!;
  if (currentGrid) {
    currentGrid.destroy();
  }
  container.innerHTML = '';
  currentGrid = null;

  const onChanged = () => {
    viewer.updateModel();
  };

  switch (activeTab) {
    case 'nodes':
      currentGrid = new DataGrid<Node>(container, getNodeColumns(), doc.nodes);
      break;
    case 'boundaries':
      currentGrid = new DataGrid<BoundaryCondition>(container, getBoundaryColumns(), doc.boundaries);
      break;
    case 'materials':
      currentGrid = new DataGrid<Material>(container, getMaterialColumns(), doc.materials);
      break;
    case 'sections':
      currentGrid = new DataGrid<Section>(container, getSectionColumns(), doc.sections);
      break;
    case 'springs':
      currentGrid = new DataGrid<Spring>(container, getSpringColumns(), doc.springs);
      break;
    case 'members':
      currentGrid = new DataGrid<Member>(container, getMemberColumns(), doc.members);
      break;
    case 'walls':
      currentGrid = new DataGrid<Wall>(container, getWallColumns(), doc.walls);
      break;
    case 'nodeloads': {
      const loads = doc.nodes
        .filter(n => n.loads.length > doc.loadCaseIndex)
        .map(n => {
          const load = n.getLoad(doc.loadCaseIndex);
          return { nodeNumber: n.number, p1: load.p1, p2: load.p2, p3: load.p3, m1: load.m1, m2: load.m2, m3: load.m3 };
        });
      currentGrid = new DataGrid(container, getNodeLoadColumns(), loads);
      break;
    }
    case 'cmqloads': {
      const loads = doc.members
        .filter(m => m.cmqLoads.length > doc.loadCaseIndex)
        .map(m => {
          const load = m.getCMQLoad(doc.loadCaseIndex);
          return { memberNumber: m.number, moy: load.moy, moz: load.moz, iMy: load.iMy, iMz: load.iMz, iQx: load.iQx, iQy: load.iQy, iQz: load.iQz, jMy: load.jMy, jMz: load.jMz, jQx: load.jQx, jQy: load.jQy, jQz: load.jQz };
        });
      currentGrid = new DataGrid(container, getCMQLoadColumns(), loads);
      break;
    }
    case 'memberloads': {
      const loads = doc.members
        .filter(m => m.memberLoads.length > doc.loadCaseIndex)
        .map(m => {
          const load = m.getMemberLoad(doc.loadCaseIndex);
          return { memberNumber: m.number, lengthMethod: load.lengthMethod, type: load.type, direction: load.direction, scale: load.scale, loadCode: load.loadCode, unitLoad: load.unitLoad, p1: load.p1, p2: load.p2, p3: load.p3 };
        });
      currentGrid = new DataGrid(container, getMemberLoadColumns(), loads);
      break;
    }
  }

  if (currentGrid) {
    currentGrid.setOnDataChanged(onChanged);
  }
}

// ===== 荷重定義セレクタ =====
function updateLoadCaseSelector(): void {
  const sel = document.getElementById('load-case-selector') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = '';
  for (let i = 0; i < doc.loadCaseCount; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = t('loadcase.label', i + 1);
    sel.appendChild(opt);
  }
  sel.value = String(doc.loadCaseIndex);
  sel.onchange = () => {
    doc.loadCaseIndex = parseInt(sel.value, 10);
    refreshGrid();
  };
}

// ===== ステータスバー =====
function updateStatus(msg: string): void {
  const el = document.getElementById('status-text');
  if (el) el.textContent = msg;
}

// ===== 列定義（関数化: 言語切替時に最新の翻訳を取得） =====
interface NodeLoadRow { nodeNumber: number; p1: number; p2: number; p3: number; m1: number; m2: number; m3: number; }
interface CMQLoadRow { memberNumber: number; moy: number; moz: number; iMy: number; iMz: number; iQx: number; iQy: number; iQz: number; jMy: number; jMz: number; jQx: number; jQy: number; jQz: number; }
interface MemberLoadRow { memberNumber: number; lengthMethod: number; type: number; direction: number; scale: number; loadCode: string; unitLoad: number; p1: number; p2: number; p3: number; }

function getNodeColumns(): ColumnDef<Node>[] {
  return [
    { key: 'number', header: t('col.nodeNumber'), width: '60px', type: 'int' },
    { key: 'x', header: t('col.xCoord'), width: '90px', type: 'number' },
    { key: 'y', header: t('col.yCoord'), width: '90px', type: 'number' },
    { key: 'z', header: t('col.zCoord'), width: '90px', type: 'number' },
    { key: 'temperature', header: t('col.temperature'), width: '70px', type: 'number' },
    { key: 'intensityGroup', header: t('col.intensityGroup'), width: '50px', type: 'int' },
    { key: 'longWeight', header: t('col.longWeight'), width: '80px', type: 'number' },
    { key: 'forceWeight', header: t('col.forceWeight'), width: '80px', type: 'number' },
    { key: 'addForceWeight', header: t('col.addForceWeight'), width: '80px', type: 'number' },
    { key: 'area', header: t('col.area'), width: '70px', type: 'number' },
  ];
}

function getBoundaryColumns(): ColumnDef<BoundaryCondition>[] {
  return [
    { key: 'nodeNumber', header: t('col.nodeNumber'), width: '60px', type: 'int' },
    { key: 'deltaX', header: t('col.deltaX'), width: '40px', type: 'int' },
    { key: 'deltaY', header: t('col.deltaY'), width: '40px', type: 'int' },
    { key: 'deltaZ', header: t('col.deltaZ'), width: '40px', type: 'int' },
    { key: 'thetaX', header: t('col.thetaX'), width: '40px', type: 'int' },
    { key: 'thetaY', header: t('col.thetaY'), width: '40px', type: 'int' },
    { key: 'thetaZ', header: t('col.thetaZ'), width: '40px', type: 'int' },
  ];
}

function getMaterialColumns(): ColumnDef<Material>[] {
  return [
    { key: 'number', header: t('col.number'), width: '40px', type: 'int' },
    { key: 'young', header: t('col.young'), width: '100px', type: 'number' },
    { key: 'shear', header: t('col.shear'), width: '100px', type: 'number' },
    { key: 'expansion', header: t('col.expansion'), width: '80px', type: 'number' },
    { key: 'poisson', header: t('col.poisson'), width: '80px', type: 'number' },
    { key: 'unitLoad', header: t('col.unitLoad'), width: '80px', type: 'number' },
    { key: 'name', header: t('col.materialName'), width: '100px', type: 'text' },
  ];
}

function getSectionColumns(): ColumnDef<Section>[] {
  return [
    { key: 'number', header: t('col.number'), width: '40px', type: 'int' },
    { key: 'materialNumber', header: t('col.material'), width: '40px', type: 'int' },
    { key: 'type', header: t('col.type'), width: '40px', type: 'int' },
    { key: 'shape', header: t('col.shape'), width: '40px', type: 'int' },
    { key: 'p1_A', header: 'A', width: '90px', type: 'number' },
    { key: 'p2_Ix', header: 'Ix', width: '90px', type: 'number' },
    { key: 'p3_Iy', header: 'Iy', width: '90px', type: 'number' },
    { key: 'p4_Iz', header: 'Iz', width: '90px', type: 'number' },
    { key: 'ky', header: 'Ky', width: '50px', type: 'number' },
    { key: 'kz', header: 'Kz', width: '50px', type: 'number' },
    { key: 'comment', header: t('col.comment'), width: '100px', type: 'text' },
  ];
}

function getSpringColumns(): ColumnDef<Spring>[] {
  return [
    { key: 'number', header: t('col.number'), width: '40px', type: 'int' },
    { key: 'method', header: t('col.method'), width: '40px', type: 'int' },
    { key: 'kTheta', header: 'K_Theta', width: '100px', type: 'number' },
  ];
}

function getMemberColumns(): ColumnDef<Member>[] {
  return [
    { key: 'number', header: t('col.memberNumber'), width: '50px', type: 'int' },
    { key: 'iNodeNumber', header: t('col.iNode'), width: '50px', type: 'int' },
    { key: 'jNodeNumber', header: t('col.jNode'), width: '50px', type: 'int' },
    { key: 'ixSpring', header: 'Ix', width: '40px', type: 'int' },
    { key: 'iySpring', header: 'Iy', width: '40px', type: 'int' },
    { key: 'izSpring', header: 'Iz', width: '40px', type: 'int' },
    { key: 'jxSpring', header: 'Jx', width: '40px', type: 'int' },
    { key: 'jySpring', header: 'Jy', width: '40px', type: 'int' },
    { key: 'jzSpring', header: 'Jz', width: '40px', type: 'int' },
    { key: 'sectionNumber', header: t('col.section'), width: '50px', type: 'int' },
    { key: 'p1', header: 'P1', width: '50px', type: 'number' },
    { key: 'p2', header: 'P2', width: '50px', type: 'number' },
    { key: 'p3', header: 'P3', width: '50px', type: 'number' },
  ];
}

function getWallColumns(): ColumnDef<Wall>[] {
  return [
    { key: 'number', header: t('col.wallNumber'), width: '50px', type: 'int' },
    { key: 'leftBottomNode', header: t('col.leftBottom'), width: '50px', type: 'int' },
    { key: 'rightBottomNode', header: t('col.rightBottom'), width: '50px', type: 'int' },
    { key: 'leftTopNode', header: t('col.leftTop'), width: '50px', type: 'int' },
    { key: 'rightTopNode', header: t('col.rightTop'), width: '50px', type: 'int' },
    { key: 'materialNumber', header: t('col.material'), width: '40px', type: 'int' },
    { key: 'method', header: t('col.method'), width: '40px', type: 'int' },
    { key: 'p1', header: 'P1', width: '60px', type: 'number' },
    { key: 'p2', header: 'P2', width: '60px', type: 'number' },
    { key: 'p3', header: 'P3', width: '60px', type: 'number' },
    { key: 'p4', header: 'P4', width: '60px', type: 'number' },
  ];
}

function getNodeLoadColumns(): ColumnDef<NodeLoadRow>[] {
  return [
    { key: 'nodeNumber', header: t('col.nodeNumber'), width: '60px', type: 'int', readOnly: true },
    { key: 'p1', header: t('col.p1kN'), width: '80px', type: 'number' },
    { key: 'p2', header: t('col.p2kN'), width: '80px', type: 'number' },
    { key: 'p3', header: t('col.p3kN'), width: '80px', type: 'number' },
    { key: 'm1', header: 'M1', width: '80px', type: 'number' },
    { key: 'm2', header: 'M2', width: '80px', type: 'number' },
    { key: 'm3', header: 'M3', width: '80px', type: 'number' },
  ];
}

function getCMQLoadColumns(): ColumnDef<CMQLoadRow>[] {
  return [
    { key: 'memberNumber', header: t('col.memberNumber'), width: '60px', type: 'int', readOnly: true },
    { key: 'moy', header: 'Moy', width: '70px', type: 'number' },
    { key: 'moz', header: 'Moz', width: '70px', type: 'number' },
    { key: 'iMy', header: 'iMy', width: '70px', type: 'number' },
    { key: 'iMz', header: 'iMz', width: '70px', type: 'number' },
    { key: 'iQx', header: 'iQx', width: '70px', type: 'number' },
    { key: 'iQy', header: 'iQy', width: '70px', type: 'number' },
    { key: 'iQz', header: 'iQz', width: '70px', type: 'number' },
    { key: 'jMy', header: 'jMy', width: '70px', type: 'number' },
    { key: 'jMz', header: 'jMz', width: '70px', type: 'number' },
    { key: 'jQx', header: 'jQx', width: '70px', type: 'number' },
    { key: 'jQy', header: 'jQy', width: '70px', type: 'number' },
    { key: 'jQz', header: 'jQz', width: '70px', type: 'number' },
  ];
}

function getMemberLoadColumns(): ColumnDef<MemberLoadRow>[] {
  return [
    { key: 'memberNumber', header: t('col.memberNumber'), width: '60px', type: 'int', readOnly: true },
    { key: 'lengthMethod', header: t('col.lengthMethod'), width: '60px', type: 'int' },
    { key: 'type', header: t('col.type'), width: '50px', type: 'int' },
    { key: 'direction', header: t('col.direction'), width: '50px', type: 'int' },
    { key: 'scale', header: t('col.scale'), width: '60px', type: 'number' },
    { key: 'loadCode', header: t('col.code'), width: '60px', type: 'text' },
    { key: 'unitLoad', header: t('col.unitLoad'), width: '70px', type: 'number' },
    { key: 'p1', header: 'P1', width: '80px', type: 'number' },
    { key: 'p2', header: 'P2', width: '80px', type: 'number' },
    { key: 'p3', header: 'P3', width: '80px', type: 'number' },
  ];
}

// ===== 起動 =====
document.addEventListener('DOMContentLoaded', init);
