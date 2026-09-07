import { test, expect, type Page } from '@playwright/test';

async function menu(page: Page, id: string) {
  const button = page.locator(`#${id}`);
  const parent = button.locator('xpath=ancestor::details');
  if ((await parent.getAttribute('open')) === null) await parent.locator('summary').click();
  await button.click();
}

async function sample(page: Page) {
  await menu(page, 'menu-sample');
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#grid-container tbody tr[data-row-index]').first()).toBeVisible();
}

test('sample, transactional edit, undo/redo, download and reimport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await sample(page);
  const x = page.locator('input[data-row-index="0"][data-column-key="x"]');
  const previous = await x.inputValue();
  await x.fill('123.5');
  await x.press('Tab');
  await expect(page.locator('#dirty-indicator')).toBeVisible();
  await menu(page, 'menu-undo');
  await expect(x).toHaveValue(previous);
  await menu(page, 'menu-redo');
  await expect(x).toHaveValue('123.5');
  const download = page.waitForEvent('download');
  await menu(page, 'menu-save');
  const file = await download;
  const path = await file.path();
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'menu-open');
  await (await chooser).setFiles(path!);
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.locator('#app-dialog-confirm').click();
  await expect(x).toHaveValue('123.5');
  expect(errors).toEqual([]);
});

test('invalid preferences and unavailable storage do not prevent editing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'fr');
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
  });
  await page.goto('./');
  await expect(page.locator('#btn-add-row')).toBeVisible();
  await page.locator('#btn-add-row').click();
  await expect(page.locator('input[data-column-key="number"]').first()).toHaveValue('1');
  await page.locator('#btn-lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('recovery survives reload without replacing the model automatically', async ({ page }) => {
  await page.goto('./');
  await page.locator('#btn-add-row').click();
  await expect(page.locator('#recovery-status')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('#recovery-status')).toContainText('1');
  await page.locator('#recovery-status').click();
  await page.locator('#tool-panel-body').getByRole('button', { name: '復元', exact: true }).click();
  await expect(page.locator('input[data-column-key="number"]').first()).toHaveValue('1');
});

test('paste preview is atomic and cancellation preserves values', async ({ page }) => {
  await page.goto('./');
  await sample(page);
  const x = page.locator('input[data-row-index="0"][data-column-key="x"]');
  const before = await x.inputValue();
  await x.click();
  const paste = async (text: string) =>
    x.evaluate((el, text) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
      el.dispatchEvent(event);
    }, text);
  await paste('321\tinvalid');
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.locator('#app-dialog-confirm').click();
  await expect(x).toHaveValue(before);
  await paste('321');
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.locator('#app-dialog [data-dialog-cancel]').first().click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(x).toHaveValue(before);
  await paste('321');
  await expect(page.locator('#app-dialog')).toBeVisible();
  await page.locator('#app-dialog-confirm').click();
  await expect(x).toHaveValue('321');
  await menu(page, 'menu-undo');
  await expect(x).toHaveValue(before);
});

test('CSV mapping and unit preview commit together and undo together', async ({ page }) => {
  await page.goto('./');
  await sample(page);
  const x = page.locator('input[data-row-index="0"][data-column-key="x"]');
  const before = await x.inputValue();
  const number = await page.locator('input[data-row-index="0"][data-column-key="number"]').inputValue();
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'menu-import-csv');
  await (
    await chooser
  ).setFiles({ name: 'nodes.csv', mimeType: 'text/csv', buffer: Buffer.from(`number,x\n${number},250`) });
  await expect(page.locator('#app-dialog-title')).toContainText('CSV');
  await page.locator('#app-dialog-body select').last().selectOption('mm-N');
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#app-dialog-title')).toContainText('プレビュー');
  await page.locator('#app-dialog-confirm').click();
  await expect(x).toHaveValue('25');
  await menu(page, 'menu-undo');
  await expect(x).toHaveValue(before);
});

test('native editing arrows, IME, Escape and Tab stay usable', async ({ page }) => {
  await page.goto('./');
  await sample(page);
  const x = page.locator('input[data-row-index="0"][data-column-key="x"]');
  const before = await x.inputValue();
  await x.click();
  await x.fill('987');
  await x.dispatchEvent('keydown', { key: 'ArrowDown', isComposing: true });
  await expect(x).toBeFocused();
  await x.press('Escape');
  await expect(x).toHaveValue(before);
  await x.press('ArrowRight');
  await expect(page.locator('input[data-row-index="0"][data-column-key="y"]')).toBeFocused();
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'after-grid';
    button.textContent = 'Next control';
    document.body.append(button);
  });
  await page.keyboard.press('Tab');
  await expect(page.locator('#grid-container .data-grid-editor:focus')).toHaveCount(0);
});

test('virtual rows preserve sorted identity when scrolling to an offscreen row', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { DataGrid } = await import(/* @vite-ignore */ '/FrameModelMaker-Web/src/ui/DataGrid.ts');
    const mount = document.createElement('div');
    mount.style.cssText = 'height:300px;overflow:auto';
    document.body.append(mount);
    const rows = Array.from({ length: 10000 }, (_, i) => ({ number: i + 1, x: i }));
    const grid = new DataGrid(
      mount,
      [
        { key: 'number', header: 'ID', type: 'int' },
        { key: 'x', header: 'x', type: 'number' },
      ],
      rows,
    );
    grid.setSort('number', 'desc');
    grid.scrollToRow(5000);
    const cell = mount.querySelector('input[data-row-index="5000"][data-column-key="x"]') as HTMLInputElement;
    const visible = !!cell;
    const result = grid.pasteTSV('123', { rowIndex: 5000, columnKey: 'x' }, { atomic: true });
    const output = {
      visible,
      value: rows[5000].x,
      applied: result.appliedCellCount,
      dom: mount.querySelectorAll('tr[data-row-index]').length,
    };
    grid.destroy();
    mount.remove();
    return output;
  });
  expect(result).toMatchObject({ visible: true, value: 123, applied: 1 });
  expect(result.dom).toBeLessThan(100);
});

test('two tabs retain independent recovery candidates', async ({ page }) => {
  await page.goto('./');
  await page.locator('#btn-add-row').click();
  await expect(page.locator('#recovery-status')).toHaveAttribute('data-state', 'saved');
  const other = await page.context().newPage();
  await other.goto('./');
  await other.locator('#btn-add-row').click();
  await other.locator('#btn-add-row').click();
  await expect(other.locator('#recovery-status')).toHaveAttribute('data-state', 'saved');
  await page.locator('#recovery-status').click();
  await expect(
    page.locator('#tool-panel-body').getByRole('button', { name: '復元', exact: true }),
  ).toHaveCount(2);
  await other.close();
});

test('viewer keeps camera and resource counts across updates and releases its canvas', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const base = '/FrameModelMaker-Web/';
    const { FrameDocument } = await import(/* @vite-ignore */ base + 'src/models/FrameDocument.ts');
    const { parseFrameJson } = await import(/* @vite-ignore */ base + 'src/io/FrameJson.ts');
    const { ModelViewer } = await import(/* @vite-ignore */ base + 'src/viewer/ModelViewer.ts');
    const { adaptAnalysisResult } = await import(/* @vite-ignore */ base + 'src/viewer/ResultsAdapter.ts');
    const doc = new FrameDocument();
    parseFrameJson(await (await fetch(base + 'samples/contracts/frame-v2.json')).text(), doc);
    const mount = document.createElement('div');
    mount.style.cssText = 'width:600px;height:400px';
    document.body.append(mount);
    const viewer = new ModelViewer(mount, doc);
    viewer.updateModel();
    viewer.setStandardView('front');
    const camera = viewer.getCameraState();
    const waitFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await waitFrame();
    const before = viewer.getPerformanceInfo();
    for (let i = 0; i < 5; i++) viewer.updateModel(false);
    await waitFrame();
    const after = viewer.getPerformanceInfo();
    const actualCamera = viewer.getCameraState();
    const same =
      camera.projection === actualCamera.projection &&
      Math.abs(camera.zoom - actualCamera.zoom) < 1e-9 &&
      ['position', 'target', 'up'].every((key) =>
        camera[key].every(
          (value: number, index: number) => Math.abs(value - actualCamera[key][index]) < 1e-7,
        ),
      );
    viewer.setLayerVisibility({ members: false });
    viewer.setLocalAxesVisible(true);
    viewer.setLayerVisibility({ members: true });
    await waitFrame();
    const axes = viewer.getLocalAxesVisible() && viewer.localAxesLayer?.children.length === 3;
    viewer.setLocalAxesVisible(false);
    const raw = await (await fetch(base + 'samples/contracts/results-v1.json')).json();
    raw.frames.push({ ...raw.frames[0], time: 2 });
    viewer.setAnalysisResults(adaptAnalysisResult(raw));
    viewer.setLayerVisibility({ results: true });
    viewer.setResultDisplay({ showDeformation: true, showReactions: true, sectionForce: 'momentZ' });
    const play = viewer.playResults({ fps: 60, loop: false });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const frame = viewer.getResultFrameIndex();
    viewer.dispose();
    const canvases = mount.querySelectorAll('canvas').length;
    mount.remove();
    return { same, before, after, axes, play, frame, canvases };
  });
  expect(result.same).toBe(true);
  expect(result.after.geometries).toBe(result.before.geometries);
  expect(result).toMatchObject({ axes: true, play: true, frame: 1, canvases: 0 });
});

test('large model uses a worker and commits only after preview', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const model = JSON.parse(readFileSync('public/samples/contracts/frame-v2.json', 'utf8'));
  const node = model.nodes[0],
    member = model.members[0];
  model.nodes = Array.from({ length: 6000 }, (_, i) => ({ ...node, number: i + 1, x: i * 100 }));
  model.members = Array.from({ length: 5999 }, (_, i) => ({
    ...member,
    number: i + 1,
    iNodeNumber: i + 1,
    jNodeNumber: i + 2,
  }));
  await page.goto('./');
  const worker = page.waitForEvent('worker');
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'menu-open');
  await (
    await chooser
  ).setFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(model, null, 2)),
  });
  expect((await worker).url()).toContain('ImportWorker');
  await expect(page.locator('#app-dialog-body')).toContainText('6000');
  await expect(page.locator('#grid-container tr[data-row-index]')).toHaveCount(0);
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#model-summary')).toContainText('6000');
});

test('bulk attributes validate and preview before one undoable commit', async ({ page }) => {
  await page.goto('./');
  await sample(page);
  const first = page.locator('input[data-row-index="0"][data-column-key="temperature"]');
  const second = page.locator('input[data-row-index="1"][data-column-key="temperature"]');
  const before = [await first.inputValue(), await second.inputValue()];
  await first.click();
  await second.click({ modifiers: ['ControlOrMeta'] });
  await menu(page, 'menu-bulk-attribute');
  await page.locator('#app-dialog-body select').selectOption('temperature');
  await page.locator('#app-dialog-body input').fill('12');
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#app-dialog-title')).toContainText('プレビュー');
  await expect(first).toHaveValue(before[0]);
  await page.locator('#app-dialog-confirm').click();
  await expect(first).toHaveValue('12');
  await expect(second).toHaveValue('12');
  await menu(page, 'menu-undo');
  await expect(first).toHaveValue(before[0]);
  await expect(second).toHaveValue(before[1]);
});
