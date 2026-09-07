import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
// Compare the exact pre-change grid source, never a manually approximated baseline.
test('grid scaling and viewer lifecycle', async ({ page, browser }) => {
  test.setTimeout(180_000);
  mkdirSync('.benchmark-baseline', { recursive: true });
  for (const name of ['DataGrid.ts', 'DataGridClipboard.ts'])
    writeFileSync(`.benchmark-baseline/${name}`, execFileSync('git', ['show', `b34cd1d:src/ui/${name}`]));
  await page.goto('./');
  const measurements = [];
  for (const count of [1000, 10000, 50000]) {
    for (const variant of ['baseline', 'current']) {
      const value = await page.evaluate(
        async ({ count, variant }) => {
          const base = '/FrameModelMaker-Web/';
          const { DataGrid } = await import(
            /* @vite-ignore */ base +
              (variant === 'baseline' ? '.benchmark-baseline/DataGrid.ts' : 'src/ui/DataGrid.ts')
          );
          const mount = document.createElement('div');
          mount.style.cssText = 'height:500px;width:800px;overflow:auto';
          document.body.append(mount);
          const columns = ['number', 'x', 'y', 'z'].map((key) => ({ key, header: key, type: 'number' }));
          const data = Array.from({ length: count }, (_, i) => ({ number: i + 1, x: i, y: 0, z: 0 }));
          const start = performance.now();
          const grid = new DataGrid(mount, columns, data);
          mount.getBoundingClientRect();
          const initialMs = performance.now() - start;
          const domRows = mount.querySelectorAll('tbody tr[data-row-index]').length;
          const samples = [];
          for (let i = 0; i < 7; i++) {
            const t = performance.now();
            grid.setSort('x', i % 2 ? 'asc' : 'desc');
            mount.getBoundingClientRect();
            samples.push(performance.now() - t);
          }
          samples.sort((a, b) => a - b);
          grid.destroy();
          mount.remove();
          return { count, variant, initialMs, sortP50: samples[3], sortP95: samples[6], domRows };
        },
        { count, variant },
      );
      measurements.push(value);
      if (variant === 'current') expect(value.domRows).toBeLessThan(100);
    }
  }
  const viewer = await page.evaluate(async () => {
    const { FrameDocument } = await import(
      /* @vite-ignore */ '/FrameModelMaker-Web/src/models/FrameDocument.ts'
    );
    const { ModelViewer } = await import(/* @vite-ignore */ '/FrameModelMaker-Web/src/viewer/ModelViewer.ts');
    const result = [];
    for (const count of [1000, 10000, 50000]) {
      const doc = new FrameDocument();
      for (let i = 0; i < count; i++) {
        const n = doc.createNode(i % 200, Math.floor(i / 200), 0);
        n.number = i + 1;
        doc.nodes.push(n);
      }
      for (let i = 1; i < count; i++) {
        const m = doc.createMember();
        m.iNodeNumber = i;
        m.jNodeNumber = i + 1;
        doc.addMember(m);
      }
      const mount = document.createElement('div');
      mount.style.cssText = 'width:800px;height:500px';
      document.body.append(mount);
      const start = performance.now();
      const v = new ModelViewer(mount, doc);
      v.updateModel();
      const initialMs = performance.now() - start;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const samples = [];
      for (let i = 0; i < 7; i++) {
        const t = performance.now();
        v.updateModel(false);
        samples.push(performance.now() - t);
      }
      const picks = [];
      for (let i = 0; i < 20; i++) {
        const t = performance.now();
        v.pickNodeAtScreen(300 + i, 200);
        v.pickMemberAtScreen(300 + i, 200);
        picks.push(performance.now() - t);
      }
      picks.sort((a, b) => a - b);
      samples.sort((a, b) => a - b);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      result.push({
        count,
        initialMs,
        updateP50: samples[3],
        updateP95: samples[6],
        pickP50: picks[10],
        pickP95: picks[19],
        ...v.getPerformanceInfo(),
      });
      v.dispose();
      mount.remove();
    }
    return result;
  });
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync(
    'docs/benchmarks/latest.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        cpu: os.cpus()[0].model,
        platform: os.platform(),
        node: process.version,
        browser: browser.version(),
        baseline: 'b34cd1d',
        grid: measurements,
        viewer,
      },
      null,
      2,
    ),
  );
});
