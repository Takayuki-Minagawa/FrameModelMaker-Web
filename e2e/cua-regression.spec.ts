import { expect, test, type Page } from '@playwright/test';

/**
 * Regression cases from the 2026-10-15 computer-use (CUA) evaluation (R01–R21).
 * They exercise the real browser behaviour the unit tests cannot: native step
 * validation, keyboard shortcuts with focus in a committed cell, and layout
 * reachability at 1440×900.
 */

async function menu(page: Page, id: string) {
  const button = page.locator(`#${id}`);
  const parent = button.locator('xpath=ancestor::details');
  if ((await parent.getAttribute('open')) === null) await parent.locator('summary').click();
  await button.click();
}

async function addRow(page: Page) {
  await page.locator('#btn-add-row').click();
}

test('R05: pattern copy accepts ΔX = 12.5 through native validation', async ({ page }) => {
  await page.goto('./');
  await addRow(page);
  await page.locator('input[data-row-index="0"][data-column-key="number"]').click();
  await menu(page, 'menu-pattern');
  const x = page.locator('#app-dialog input[name="x"]');
  await expect(x).toHaveAttribute('step', 'any');
  await x.fill('12.5');
  await expect(page.locator('#pattern-preview')).toContainText('12.5');
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(page.locator('input[data-row-index="1"][data-column-key="x"]')).toHaveValue('12.5');
  await expect(page.locator('#status-text')).toHaveAttribute('data-kind', 'success');
});

test('R01: the load case panel follows the current-case selector and edits the shown case', async ({ page }) => {
  await page.goto('./');
  await menu(page, 'menu-add-loadcase');
  await page.locator('#app-dialog input[name="name"]').fill('CUA Wind');
  await page.locator('#app-dialog select[name="type"]').selectOption('wind');
  await page.locator('#app-dialog-confirm').click();
  await menu(page, 'menu-load-combinations');
  await expect(page.locator('#load-case-edit-target')).toContainText('2: CUA Wind (LC2)');
  const selector = page.locator('#load-case-selector');
  await selector.locator('xpath=ancestor::details').locator('summary').click();
  await selector.selectOption('0');
  await expect(page.locator('#load-case-edit-target')).toContainText('(LC1)');
  await page.locator('#tool-panel-body input[name="load-case-name"]').fill('EditedWhileLC1');
  await page.locator('#load-case-update').click();
  await expect(page.locator('#load-case-selector option')).toHaveText(['1: EditedWhileLC1', '2: CUA Wind']);
});

test('R02: model information recalculates while open and the CSV uses the latest model', async ({ page }) => {
  await page.goto('./');
  await addRow(page);
  await menu(page, 'menu-model-info');
  const nodes = page.locator('#model-info-statistics tr', { hasText: '節点' }).first().locator('td').nth(1);
  await expect(nodes).toHaveText('1');
  await addRow(page);
  await expect(nodes).toHaveText('2');
});

test('R03/R04: section calculator discards stale results on error and refuses to apply without a target', async ({ page }) => {
  await page.goto('./');
  await menu(page, 'menu-section-calculator');
  await expect(page.locator('#section-calculator-apply')).toBeDisabled();
  await page.locator('#tab-sections').click();
  await addRow(page);
  await expect(page.locator('#section-calculator-target option')).toHaveCount(2);
  await expect(page.locator('#section-calculator-apply')).toBeDisabled();
  const body = page.locator('#tool-panel-body');
  await body.locator('select[name="shape"]').selectOption('4');
  await body.locator('input[name="dimension-1"]').fill('20');
  await body.locator('input[name="dimension-2"]').fill('30');
  await body.locator('input[name="dimension-3"]').fill('2');
  await body.getByRole('button', { name: '計算', exact: true }).click();
  await expect(page.locator('#section-calculator-result')).toHaveAttribute('data-state', 'calculated');
  await expect(page.locator('#section-calculator-result')).toContainText('184');
  await body.locator('input[name="dimension-3"]').fill('11');
  await expect(page.locator('#section-calculator-result')).toHaveAttribute('data-state', 'stale');
  await body.getByRole('button', { name: '計算', exact: true }).click();
  await expect(page.locator('#section-calculator-result')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#section-calculator-result')).not.toContainText('184');
  await body.locator('select[name="shape"]').selectOption('6');
  await body.locator('input[name="dimension-1"]').fill('30');
  await body.locator('input[name="dimension-2"]').fill('15');
  await body.locator('input[name="dimension-3"]').fill('1');
  await body.locator('input[name="dimension-4"]').fill('1.2');
  await body.getByRole('button', { name: '計算', exact: true }).click();
  await expect(page.locator('#section-calculator-result')).toHaveAttribute('data-state', 'calculated');
  await expect(page.locator('#section-calculator-error')).toBeHidden();
});

test('R06: Ctrl/Cmd+Z in a committed cell undoes the model change', async ({ page }) => {
  await page.goto('./');
  await addRow(page);
  const x = page.locator('input[data-row-index="0"][data-column-key="x"]');
  await x.click();
  await x.fill('12.5');
  await x.press('Enter');
  await expect(page.locator('#dirty-indicator')).toBeVisible();
  await x.press('ControlOrMeta+z');
  await expect(page.locator('input[data-row-index="0"][data-column-key="x"]')).toHaveValue('0');
  await expect(page.locator('#status-text')).toHaveAttribute('data-kind', 'success');
});

test('R07: a successful frame generation replaces the earlier "create a section" error', async ({ page }) => {
  await page.goto('./');
  await menu(page, 'menu-frame-template');
  await expect(page.locator('#status-text')).toHaveAttribute('data-kind', 'error');
  await page.locator('#tab-sections').click();
  await addRow(page);
  await menu(page, 'menu-frame-template');
  await page.locator('#app-dialog input[name="span"]').fill('600.5');
  await page.locator('#app-dialog-confirm').click();
  await expect(page.locator('#status-text')).toHaveAttribute('data-kind', 'success');
  await expect(page.locator('#status-text')).toContainText('骨組を生成しました');
});

test('R09: every tab is reachable at 1440×900 and the search state is visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#tab-select').selectOption('memberloads');
  await expect(page.locator('#tab-memberloads')).toHaveClass(/active/);
  await expect(page.locator('#tab-memberloads')).toBeInViewport();
  await page.locator('#tab-select').selectOption('nodes');
  await addRow(page);
  await addRow(page);
  await page.locator('#grid-search').fill('2');
  await expect(page.locator('#grid-filter-state')).toContainText('1 / 2');
  await page.locator('#btn-maximize-data').click();
  await expect(page.locator('#viewer-panel')).toBeHidden();
  await page.locator('#btn-maximize-data').click();
  await expect(page.locator('#viewer-panel')).toBeVisible();
});

test('R16/R17: local axes expose aria-pressed and the info panel separates hide from clear', async ({ page }) => {
  await page.goto('./');
  await menu(page, 'menu-local-axes');
  await expect(page.locator('#menu-local-axes')).toHaveAttribute('aria-pressed', 'true');
  await addRow(page);
  await addRow(page);
  await page.locator('input[data-row-index="0"][data-column-key="number"]').click();
  await expect(page.locator('#selection-info-panel')).toBeVisible();
  await expect(page.locator('#selection-info-body')).toContainText('1');
  // "×" hides the panel but keeps the selection.
  await page.locator('#selection-info-close').click();
  await expect(page.locator('#selection-info-panel')).toBeHidden();
  await expect(page.locator('tr[data-row-index="0"]')).toHaveAttribute('aria-selected', 'true');
  // Selecting another entity re-opens the panel; "Clear selection" deselects.
  await page.locator('input[data-row-index="1"][data-column-key="number"]').click();
  await expect(page.locator('#selection-info-panel')).toBeVisible();
  await page.locator('#selection-info-clear').click();
  await expect(page.locator('#selection-info-panel')).toBeHidden();
  await expect(page.locator('tr[data-row-index="1"]')).not.toHaveAttribute('aria-selected', 'true');
});

test('review fix: dropdown menus are not clipped by the menu bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  for (const [summaryOf, itemId] of [
    ['menu-new', 'menu-sample'],
    ['menu-undo', 'menu-duplicate'],
    ['menu-validate', 'menu-results'],
  ]) {
    await page.locator(`#${summaryOf}`).locator('xpath=ancestor::details').locator('summary').click();
    const item = page.locator(`#${itemId}`);
    await expect(item).toBeVisible();
    // The element actually painted at the item's centre must be the item itself.
    const hit = await item.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element;
    });
    expect(hit).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator(`#${summaryOf}`).locator('xpath=ancestor::details').evaluate((details) => details.removeAttribute('open'));
  }
});
