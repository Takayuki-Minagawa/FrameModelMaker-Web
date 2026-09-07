import { resolveLocalAxes } from '../services/LocalAxes';
import { byId, createElement, formatNumber, localText } from './UiHelpers';

import { t } from '../i18n';
import { FrameDocument } from '../models/FrameDocument';
import { ViewerSelection } from '../viewer/ModelViewer';

export function renderSelectionPanel(doc: FrameDocument, selection: ViewerSelection): void {
  const panel = byId('selection-info-panel');
  const title = byId('selection-info-title');
  const body = byId('selection-info-body');
  body.replaceChildren();
  if (selection.kind === 'none') {
    panel.classList.add('hidden');
    return;
  }
  let fields: Array<[string, string | number]> = [];
  if (selection.kind === 'node') {
    const node = doc.findNodeByNumber(selection.nodeNumber);
    if (!node) return panel.classList.add('hidden');
    title.textContent = t('selection.title.node');
    fields = [
      [t('col.nodeNumber'), node.number],
      [t('col.xCoord'), node.x],
      [t('col.yCoord'), node.y],
      [t('col.zCoord'), node.z],
      [t('col.temperature'), node.temperature],
      [t('col.area'), node.area],
    ];
  } else if (selection.kind === 'member') {
    const member = doc.members.find((item) => item.number === selection.memberNumber);
    if (!member) return panel.classList.add('hidden');
    title.textContent = t('selection.title.member');
    fields = [
      [t('col.memberNumber'), member.number],
      [t('col.iNode'), member.iNodeNumber],
      [t('col.jNode'), member.jNodeNumber],
      [t('col.section'), member.sectionNumber],
      ['P1', member.p1],
      ['P2', member.p2],
      ['P3', member.p3],
    ];
    const i = doc.findNodeByNumber(member.iNodeNumber),
      j = doc.findNodeByNumber(member.jNodeNumber);
    if (i && j) {
      try {
        const axes = resolveLocalAxes(i, j, doc.analysisMetadata?.localAxes[String(member.number)]);
        fields.push([
          localText('局所軸の指定元', 'Axis source'),
          axes.source === 'specified' ? localText('指定', 'Specified') : localText('推定', 'Inferred'),
        ]);
        for (const key of ['x', 'y', 'z'] as const)
          fields.push([`local ${key}`, axes[key].map((value) => formatNumber(value)).join(', ')]);
        fields.push([localText('単位', 'Units'), 'cm / kN / kN-cm']);
      } catch (error) {
        fields.push([localText('局所軸エラー', 'Axis error'), String(error)]);
      }
    }
  } else {
    const wall = doc.walls.find((item) => item.number === selection.wallNumber);
    if (!wall) return panel.classList.add('hidden');
    title.textContent = t('selection.title.wall');
    fields = [
      [t('col.wallNumber'), wall.number],
      [t('col.leftBottom'), wall.leftBottomNode],
      [t('col.rightBottom'), wall.rightBottomNode],
      [t('col.leftTop'), wall.leftTopNode],
      [t('col.rightTop'), wall.rightTopNode],
      [t('col.material'), wall.materialNumber],
    ];
  }
  const table = createElement('table', 'selection-info-table');
  for (const [label, rawValue] of fields) {
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = typeof rawValue === 'number' ? formatNumber(rawValue) : rawValue;
  }
  body.appendChild(table);
  panel.classList.remove('hidden');
}
