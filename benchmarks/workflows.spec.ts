import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('document workflow costs and capped history', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./');
  const measurements = await page.evaluate(async () => {
    const { FrameDocument } = await import(
      /* @vite-ignore */ '/FrameModelMaker-Web/src/models/FrameDocument.ts'
    );
    const { DocumentHistory } = await import(
      /* @vite-ignore */ '/FrameModelMaker-Web/src/services/DocumentHistory.ts'
    );
    const { EditorController } = await import(
      /* @vite-ignore */ '/FrameModelMaker-Web/src/app/EditorController.ts'
    );
    const { writeFrameJson, parseFrameJson } = await import(
      /* @vite-ignore */ '/FrameModelMaker-Web/src/io/FrameJson.ts'
    );
    const { DataGrid } = await import(/* @vite-ignore */ '/FrameModelMaker-Web/src/ui/DataGrid.ts');
    const output = [];
    const stats = (values: number[]) => {
      values.sort((a, b) => a - b);
      return { p50: values[2], p95: values[4] };
    };
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
      const history = new DocumentHistory(doc, { maxEntries: 10, trustChangeNotifications: true });
      const editor = new EditorController(doc, history);
      const mount = document.createElement('div');
      mount.style.cssText = 'height:500px;overflow:auto';
      document.body.append(mount);
      const grid = new DataGrid(
        mount,
        [
          { key: 'number', header: 'ID', type: 'number' },
          { key: 'x', header: 'x', type: 'number' },
        ],
        doc.nodes,
      );
      const timings: Record<string, number[]> = {
        read: [],
        edit: [],
        search: [],
        selection: [],
        undo: [],
        save: [],
        dirtyCached: [],
        dirtyUncached: [],
      };
      let text = '',
        undoAvailable = false;
      for (let i = 0; i < 5; i++) {
        let t = performance.now();
        text = writeFrameJson(doc);
        timings.save.push(performance.now() - t);
        t = performance.now();
        parseFrameJson(text, new FrameDocument());
        timings.read.push(performance.now() - t);
        t = performance.now();
        editor.execute('edit', () => {
          doc.nodes[0].x = i + 100;
        });
        timings.edit.push(performance.now() - t);
        t = performance.now();
        grid.setSearchQuery(i % 2 ? '123' : '456');
        timings.search.push(performance.now() - t);
        grid.setSearchQuery('');
        t = performance.now();
        grid.selectRow(Math.floor(count / 2));
        timings.selection.push(performance.now() - t);
        undoAvailable = history.canUndo;
        t = performance.now();
        history.undo();
        timings.undo.push(performance.now() - t);
        t = performance.now();
        for (let j = 0; j < 20; j++) history.isDirty;
        timings.dirtyCached.push((performance.now() - t) / 20);
        const uncached = new DocumentHistory(doc, { trackChanges: false });
        t = performance.now();
        uncached.isDirty;
        timings.dirtyUncached.push(performance.now() - t);
        uncached.dispose();
      }
      output.push({
        count,
        members: count - 1,
        loadCases: 1,
        historyEntries: history.length,
        undoAvailable,
        jsonBytes: new TextEncoder().encode(text).length,
        recoveryBytes: new TextEncoder().encode(history.serializeAutosave()).length,
        timingMs: Object.fromEntries(Object.entries(timings).map(([key, v]) => [key, stats(v)])),
        heapBytes: (performance as any).memory?.usedJSHeapSize ?? null,
      });
      grid.destroy();
      mount.remove();
      history.dispose();
    }
    return output;
  });
  writeFileSync('docs/benchmarks/workflows.json', JSON.stringify(measurements, null, 2));
});
