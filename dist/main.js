import './styles/main.css';
import { FrameDocument } from './models/FrameDocument';
import { parseStructForm } from './io/StructFormParser';
import { writeStructForm } from './io/StructFormWriter';
import { ModelViewer } from './viewer/ModelViewer';
import { DataGrid } from './ui/DataGrid';
// ===== グローバルドキュメント =====
const doc = new FrameDocument();
let viewer;
let currentGrid = null;
let activeTab = 'nodes';
// ===== 初期化 =====
function init() {
    setupMenu();
    setupTabs();
    setupViewer();
    setupResizer();
    updateStatus('準備完了');
    showTab('nodes');
}
// ===== メニュー =====
function setupMenu() {
    // ファイルメニュー
    on('menu-new', () => { doc.init(); viewer.updateModel(); refreshGrid(); updateStatus('新規作成'); });
    on('menu-open', () => openFile());
    on('menu-save', () => saveFile());
    on('menu-sample', () => loadSample());
    // 表示メニュー
    on('menu-show-node-num', () => {
        viewer.showNodeNumbers = !viewer.showNodeNumbers;
        updateStatus(viewer.showNodeNumbers ? '節点番号: 表示' : '節点番号: 非表示');
    });
    on('menu-show-member-num', () => {
        viewer.showMemberNumbers = !viewer.showMemberNumbers;
        updateStatus(viewer.showMemberNumbers ? '部材番号: 表示' : '部材番号: 非表示');
    });
    // 編集メニュー
    on('menu-sort', () => { doc.sort(); viewer.updateModel(); refreshGrid(); updateStatus('ソート完了'); });
    on('menu-renumber', () => { doc.assignNumbers(); viewer.updateModel(); refreshGrid(); updateStatus('番号再割当完了'); });
    on('menu-merge', () => { doc.mergeOverlappingNodes(2.0); viewer.updateModel(); refreshGrid(); updateStatus('重複ノード統合完了'); });
    // 荷重定義
    on('menu-add-loadcase', () => {
        doc.addLoadCase();
        updateLoadCaseSelector();
        updateStatus(`荷重定義 ${doc.loadCaseCount} 追加`);
    });
    on('menu-remove-loadcase', () => {
        if (doc.loadCaseCount > 1) {
            doc.removeLoadCase(doc.loadCaseIndex);
            updateLoadCaseSelector();
            refreshGrid();
            updateStatus('荷重定義削除');
        }
    });
}
function on(id, handler) {
    const el = document.getElementById(id);
    if (el)
        el.addEventListener('click', handler);
}
// ===== ファイル操作 =====
function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dat,.txt';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file)
            return;
        try {
            // Shift_JIS 対応
            let text;
            try {
                const buffer = await file.arrayBuffer();
                const decoder = new TextDecoder('shift_jis');
                text = decoder.decode(buffer);
            }
            catch {
                text = await file.text();
            }
            parseStructForm(text, doc);
            viewer.updateModel();
            refreshGrid();
            updateLoadCaseSelector();
            updateStatus(`読込完了: ${file.name} (節点:${doc.nodes.length} 部材:${doc.members.length})`);
        }
        catch (e) {
            updateStatus(`読込エラー: ${e}`);
            console.error(e);
        }
    });
    input.click();
}
function saveFile() {
    const content = writeStructForm(doc);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (doc.title || 'model') + '.dat';
    a.click();
    URL.revokeObjectURL(url);
    updateStatus('ファイル保存完了');
}
async function loadSample() {
    try {
        const resp = await fetch('./samples/StructForm_SampleData1_Ver8.dat');
        const buffer = await resp.arrayBuffer();
        let text;
        try {
            const decoder = new TextDecoder('shift_jis');
            text = decoder.decode(buffer);
        }
        catch {
            text = new TextDecoder().decode(buffer);
        }
        parseStructForm(text, doc);
        viewer.updateModel();
        refreshGrid();
        updateLoadCaseSelector();
        updateStatus(`サンプル読込完了 (節点:${doc.nodes.length} 部材:${doc.members.length})`);
    }
    catch (e) {
        updateStatus(`サンプル読込エラー: ${e}`);
        console.error(e);
    }
}
// ===== 3Dビューア =====
function setupViewer() {
    const container = document.getElementById('viewer-panel');
    viewer = new ModelViewer(container, doc);
}
// ===== リサイズ =====
function setupResizer() {
    const handle = document.getElementById('resize-handle');
    const dataPanel = document.getElementById('data-panel');
    let startX = 0;
    let startW = 0;
    handle.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startW = dataPanel.offsetWidth;
        const onMove = (ev) => {
            const delta = startX - ev.clientX;
            dataPanel.style.width = Math.max(200, startW + delta) + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
// ===== タブ =====
const tabDefs = [
    { id: 'nodes', label: '節点' },
    { id: 'boundaries', label: '境界条件' },
    { id: 'materials', label: '材料' },
    { id: 'sections', label: '断面' },
    { id: 'springs', label: 'バネ' },
    { id: 'members', label: '部材' },
    { id: 'walls', label: '壁' },
    { id: 'nodeloads', label: '節点荷重' },
    { id: 'cmqloads', label: 'CMQ荷重' },
    { id: 'memberloads', label: '部材荷重' },
];
function setupTabs() {
    const tabBar = document.getElementById('tab-bar');
    for (const tab of tabDefs) {
        const el = document.createElement('div');
        el.className = 'tab';
        el.textContent = tab.label;
        el.dataset.tabId = tab.id;
        el.addEventListener('click', () => showTab(tab.id));
        tabBar.appendChild(el);
    }
}
function showTab(tabId) {
    activeTab = tabId;
    // タブのアクティブ表示切替
    document.querySelectorAll('#tab-bar .tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tabId === tabId);
    });
    refreshGrid();
}
function refreshGrid() {
    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    currentGrid = null;
    const onChanged = () => {
        viewer.updateModel();
    };
    switch (activeTab) {
        case 'nodes':
            currentGrid = new DataGrid(container, nodeColumns, doc.nodes);
            break;
        case 'boundaries':
            currentGrid = new DataGrid(container, boundaryColumns, doc.boundaries);
            break;
        case 'materials':
            currentGrid = new DataGrid(container, materialColumns, doc.materials);
            break;
        case 'sections':
            currentGrid = new DataGrid(container, sectionColumns, doc.sections);
            break;
        case 'springs':
            currentGrid = new DataGrid(container, springColumns, doc.springs);
            break;
        case 'members':
            currentGrid = new DataGrid(container, memberColumns, doc.members);
            break;
        case 'walls':
            currentGrid = new DataGrid(container, wallColumns, doc.walls);
            break;
        case 'nodeloads': {
            const loads = doc.nodes
                .filter(n => n.loads.length > doc.loadCaseIndex)
                .map(n => ({
                nodeNumber: n.number,
                ...n.getLoad(doc.loadCaseIndex),
            }));
            currentGrid = new DataGrid(container, nodeLoadColumns, loads);
            break;
        }
        case 'cmqloads': {
            const loads = doc.members
                .filter(m => m.cmqLoads.length > doc.loadCaseIndex)
                .map(m => ({
                memberNumber: m.number,
                ...m.getCMQLoad(doc.loadCaseIndex),
            }));
            currentGrid = new DataGrid(container, cmqLoadColumns, loads);
            break;
        }
        case 'memberloads': {
            const loads = doc.members
                .filter(m => m.memberLoads.length > doc.loadCaseIndex)
                .map(m => ({
                memberNumber: m.number,
                ...m.getMemberLoad(doc.loadCaseIndex),
            }));
            currentGrid = new DataGrid(container, memberLoadColumns, loads);
            break;
        }
    }
    if (currentGrid) {
        currentGrid.setOnDataChanged(onChanged);
    }
}
// ===== 荷重定義セレクタ =====
function updateLoadCaseSelector() {
    const sel = document.getElementById('load-case-selector');
    if (!sel)
        return;
    sel.innerHTML = '';
    for (let i = 0; i < doc.loadCaseCount; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `荷重定義 ${i + 1}`;
        sel.appendChild(opt);
    }
    sel.value = String(doc.loadCaseIndex);
    sel.onchange = () => {
        doc.loadCaseIndex = parseInt(sel.value, 10);
        refreshGrid();
    };
}
// ===== ステータスバー =====
function updateStatus(msg) {
    const el = document.getElementById('status-text');
    if (el)
        el.textContent = msg;
}
// ===== 列定義 =====
const nodeColumns = [
    { key: 'number', header: '節点番号', width: '60px', type: 'int' },
    { key: 'x', header: 'X座標 cm', width: '90px', type: 'number' },
    { key: 'y', header: 'Y座標 cm', width: '90px', type: 'number' },
    { key: 'z', header: 'Z座標 cm', width: '90px', type: 'number' },
    { key: 'temperature', header: '節点温度', width: '70px', type: 'number' },
    { key: 'intensityGroup', header: '震度G', width: '50px', type: 'int' },
    { key: 'longWeight', header: '長期重量', width: '80px', type: 'number' },
    { key: 'forceWeight', header: '地震重量', width: '80px', type: 'number' },
    { key: 'addForceWeight', header: '付加重量', width: '80px', type: 'number' },
    { key: 'area', header: '面積cm2', width: '70px', type: 'number' },
];
const boundaryColumns = [
    { key: 'nodeNumber', header: '節点番号', width: '60px', type: 'int' },
    { key: 'deltaX', header: 'DX', width: '40px', type: 'int' },
    { key: 'deltaY', header: 'DY', width: '40px', type: 'int' },
    { key: 'deltaZ', header: 'DZ', width: '40px', type: 'int' },
    { key: 'thetaX', header: 'RX', width: '40px', type: 'int' },
    { key: 'thetaY', header: 'RY', width: '40px', type: 'int' },
    { key: 'thetaZ', header: 'RZ', width: '40px', type: 'int' },
];
const materialColumns = [
    { key: 'number', header: '番号', width: '40px', type: 'int' },
    { key: 'young', header: 'ヤング係数', width: '100px', type: 'number' },
    { key: 'shear', header: 'せん断', width: '100px', type: 'number' },
    { key: 'expansion', header: '熱膨張', width: '80px', type: 'number' },
    { key: 'poisson', header: 'ポアソン比', width: '80px', type: 'number' },
    { key: 'unitLoad', header: '単位荷重', width: '80px', type: 'number' },
    { key: 'name', header: '材料名', width: '100px', type: 'text' },
];
const sectionColumns = [
    { key: 'number', header: '番号', width: '40px', type: 'int' },
    { key: 'materialNumber', header: '材料', width: '40px', type: 'int' },
    { key: 'type', header: '種別', width: '40px', type: 'int' },
    { key: 'shape', header: '形状', width: '40px', type: 'int' },
    { key: 'p1_A', header: 'A', width: '90px', type: 'number' },
    { key: 'p2_Ix', header: 'Ix', width: '90px', type: 'number' },
    { key: 'p3_Iy', header: 'Iy', width: '90px', type: 'number' },
    { key: 'p4_Iz', header: 'Iz', width: '90px', type: 'number' },
    { key: 'ky', header: 'Ky', width: '50px', type: 'number' },
    { key: 'kz', header: 'Kz', width: '50px', type: 'number' },
    { key: 'comment', header: 'コメント', width: '100px', type: 'text' },
];
const springColumns = [
    { key: 'number', header: '番号', width: '40px', type: 'int' },
    { key: 'method', header: '方式', width: '40px', type: 'int' },
    { key: 'kTheta', header: 'K_Theta', width: '100px', type: 'number' },
];
const memberColumns = [
    { key: 'number', header: '部材番号', width: '50px', type: 'int' },
    { key: 'iNodeNumber', header: 'I端', width: '50px', type: 'int' },
    { key: 'jNodeNumber', header: 'J端', width: '50px', type: 'int' },
    { key: 'ixSpring', header: 'Ix', width: '40px', type: 'int' },
    { key: 'iySpring', header: 'Iy', width: '40px', type: 'int' },
    { key: 'izSpring', header: 'Iz', width: '40px', type: 'int' },
    { key: 'jxSpring', header: 'Jx', width: '40px', type: 'int' },
    { key: 'jySpring', header: 'Jy', width: '40px', type: 'int' },
    { key: 'jzSpring', header: 'Jz', width: '40px', type: 'int' },
    { key: 'sectionNumber', header: '断面', width: '50px', type: 'int' },
    { key: 'p1', header: 'P1', width: '50px', type: 'number' },
    { key: 'p2', header: 'P2', width: '50px', type: 'number' },
    { key: 'p3', header: 'P3', width: '50px', type: 'number' },
];
const wallColumns = [
    { key: 'number', header: '壁番号', width: '50px', type: 'int' },
    { key: 'leftBottomNode', header: '左下', width: '50px', type: 'int' },
    { key: 'rightBottomNode', header: '右下', width: '50px', type: 'int' },
    { key: 'leftTopNode', header: '左上', width: '50px', type: 'int' },
    { key: 'rightTopNode', header: '右上', width: '50px', type: 'int' },
    { key: 'materialNumber', header: '材料', width: '40px', type: 'int' },
    { key: 'method', header: '方式', width: '40px', type: 'int' },
    { key: 'p1', header: 'P1', width: '60px', type: 'number' },
    { key: 'p2', header: 'P2', width: '60px', type: 'number' },
    { key: 'p3', header: 'P3', width: '60px', type: 'number' },
    { key: 'p4', header: 'P4', width: '60px', type: 'number' },
];
const nodeLoadColumns = [
    { key: 'nodeNumber', header: '節点番号', width: '60px', type: 'int', readOnly: true },
    { key: 'p1', header: 'P1(kN)', width: '80px', type: 'number' },
    { key: 'p2', header: 'P2(kN)', width: '80px', type: 'number' },
    { key: 'p3', header: 'P3(kN)', width: '80px', type: 'number' },
    { key: 'm1', header: 'M1', width: '80px', type: 'number' },
    { key: 'm2', header: 'M2', width: '80px', type: 'number' },
    { key: 'm3', header: 'M3', width: '80px', type: 'number' },
];
const cmqLoadColumns = [
    { key: 'memberNumber', header: '部材番号', width: '60px', type: 'int', readOnly: true },
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
const memberLoadColumns = [
    { key: 'memberNumber', header: '部材番号', width: '60px', type: 'int', readOnly: true },
    { key: 'lengthMethod', header: '長さ方式', width: '60px', type: 'int' },
    { key: 'type', header: '種別', width: '50px', type: 'int' },
    { key: 'direction', header: '方向', width: '50px', type: 'int' },
    { key: 'scale', header: '倍率', width: '60px', type: 'number' },
    { key: 'loadCode', header: 'コード', width: '60px', type: 'text' },
    { key: 'unitLoad', header: '単位荷重', width: '70px', type: 'number' },
    { key: 'p1', header: 'P1', width: '80px', type: 'number' },
    { key: 'p2', header: 'P2', width: '80px', type: 'number' },
    { key: 'p3', header: 'P3', width: '80px', type: 'number' },
];
// ===== 起動 =====
document.addEventListener('DOMContentLoaded', init);
//# sourceMappingURL=main.js.map