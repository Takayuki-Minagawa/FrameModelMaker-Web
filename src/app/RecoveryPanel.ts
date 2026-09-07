import { DocumentHistory } from '../services/DocumentHistory';
import { RecoveryService } from '../services/RecoveryService';
import { settings } from '../services/SettingsRepository';
import type { ToolPanel } from './ToolPanel';
import { createButton, createElement, localText } from './UiHelpers';

export class RecoveryPanel {
  readonly service = new RecoveryService();
  private timer: number | undefined;
  private readonly statusElement = createElement('button', 'secondary');

  constructor(
    private readonly history: DocumentHistory,
    private readonly panel: ToolPanel,
    private readonly title: () => string,
    private readonly restore: (payload: string) => Promise<boolean>,
    private readonly reportError: (error: unknown) => void,
    private readonly exportJson: () => Promise<void>,
  ) {
    this.statusElement.id = 'recovery-status';
    this.statusElement.type = 'button';
    this.statusElement.setAttribute('aria-live', 'polite');
    this.statusElement.addEventListener('click', () => void this.show().catch(reportError));
    document.getElementById('menu-right')?.prepend(this.statusElement);
    this.service.onStatus = () => this.renderStatus();
    settings.subscribe(() => this.renderStatus());
    this.renderStatus();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
    window.addEventListener('beforeunload', (event) => {
      if (!history.isDirty) return;
      this.flush();
      event.preventDefault();
      event.returnValue = '';
    });
  }

  renderStatus(): void {
    const status = this.service.status;
    const labels = {
      idle: localText('復旧センター', 'Recovery'),
      saving: localText('復旧データ保存中', 'Saving recovery'),
      saved: localText('復旧データ保存済み', 'Recovery saved'),
      failed: localText('復旧保存に失敗', 'Recovery failed'),
    };
    this.statusElement.textContent = settings.available
      ? labels[status.state]
      : localText('設定の保存不可・復旧', 'Preferences unavailable / Recovery');
    this.statusElement.title = status.error ?? (status.time ? new Date(status.time).toLocaleString() : '');
    this.statusElement.dataset.state = status.state;
  }

  schedule(): void {
    window.clearTimeout(this.timer);
    // Persist undo-to-saved states too, so recovery never resurrects a discarded edit.
    this.timer = window.setTimeout(() => this.flush(), 350);
  }

  newModel(): void {
    window.clearTimeout(this.timer);
    this.service.newModel();
  }

  flush(): void {
    window.clearTimeout(this.timer);
    void this.service.save(this.history, this.title()).catch(this.reportError);
  }

  async initialize(): Promise<void> {
    try {
      await this.service.migrateLegacy(settings);
    } catch (error) {
      this.reportError(error);
    }
    try {
      const records = await this.service.repository.list();
      if (records.length)
        this.statusElement.textContent = localText(
          `復旧候補 ${records.length}件`,
          `${records.length} recovery snapshots`,
        );
    } catch (error) {
      this.service.status = { state: 'failed', error: String(error) };
      this.renderStatus();
    }
  }

  async show(): Promise<void> {
    const content = createElement('div', 'panel-form');
    content.append(
      createElement(
        'p',
        undefined,
        localText(
          '復旧データはこのブラウザに保存されます。JSONファイルも保存してください。',
          'Recovery is stored in this browser. Keep a JSON file as a separate backup.',
        ),
      ),
    );
    content.append(
      createButton(localText('現在のモデルをJSON保存', 'Download current model'), this.exportJson),
    );
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.quota)
        content.append(
          createElement(
            'p',
            undefined,
            `${localText('保存容量の目安', 'Estimated storage')}: ${Math.round((estimate.usage ?? 0) / 1024)} / ${Math.round(estimate.quota / 1024)} KiB`,
          ),
        );
      if (navigator.storage?.persist)
        content.append(
          createButton(localText('ブラウザへ永続保存を要求', 'Request persistent storage'), async () => {
            const persisted = await navigator.storage.persist();
            content.append(
              createElement(
                'p',
                undefined,
                persisted
                  ? localText('永続保存が許可されました', 'Persistence granted')
                  : localText('永続保存は許可されませんでした', 'Persistence was not granted'),
              ),
            );
          }),
        );
      const records = await this.service.repository.list();
      for (const record of records) {
        const row = createElement('div', 'diagnostic-item info');
        row.append(
          createElement(
            'p',
            undefined,
            `${record.title || 'Untitled'} — ${new Date(record.updatedAt).toLocaleString()} (#${record.revision})`,
          ),
        );
        row.append(
          createButton(localText('復元', 'Restore'), async () => {
            if (await this.restore(record.payload)) {
              this.newModel();
              this.schedule();
              this.panel.close();
            }
          }),
          createButton(
            localText('この候補を削除', 'Delete this snapshot'),
            async () => {
              await this.service.remove(record.id);
              await this.show();
            },
            'toolbar-btn toolbar-btn-danger',
          ),
        );
        content.append(row);
      }
      if (!records.length)
        content.append(
          createElement('p', undefined, localText('復旧候補はありません', 'No recovery snapshots')),
        );
    } catch (error) {
      content.append(createElement('p', 'diagnostic-item error', String(error)));
    }
    this.panel.open(localText('復旧センター', 'Recovery center'), content);
  }
}
