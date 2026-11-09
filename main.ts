import { ItemView, Notice, Plugin, SuggestModal } from 'obsidian';
import type { App, TFile, View, WorkspaceLeaf } from 'obsidian';

import { parseCanvas, withContent } from './src/canvas.ts';
import type { CanvasEntry } from './src/canvas.ts';
import { rank, snippet } from './src/search.ts';
import type { Hit } from './src/search.ts';

/** Characters read from a file card; enough to search, cheap to hold. */
const FILE_TEXT_LIMIT = 20000;

/** The corners of Obsidian's canvas view that this plugin touches. */
interface CanvasNodeLike {
  id: string;
}
interface CanvasLike {
  nodes: Map<string, CanvasNodeLike>;
  selectOnly(node: CanvasNodeLike): void;
  zoomToSelection(): void;
}
interface CanvasViewLike extends View {
  canvas?: CanvasLike;
  getViewData(): string;
  file?: TFile | null;
}

function isCanvasView(view: View | null | undefined): view is CanvasViewLike {
  return !!view && view.getViewType() === 'canvas';
}

interface Located extends CanvasEntry {
  /** The canvas file the node lives in. */
  canvas: TFile;
}

const ICONS: Record<CanvasEntry['kind'], string> = { text: 'Card', file: 'File', link: 'Link', group: 'Group' };

class CanvasSuggestModal extends SuggestModal<Hit & { located: Located }> {
  constructor(
    app: App,
    private readonly entries: Located[],
    private readonly showCanvasName: boolean,
    private readonly onChoose: (entry: Located) => void,
  ) {
    super(app);
    this.setPlaceholder('Search cards, files, links and groups');
    this.emptyStateText = 'No match on the canvas.';
  }

  getSuggestions(query: string) {
    const byKey = new Map(this.entries.map((e) => [`${e.canvas.path}\n${e.id}`, e]));
    return rank(this.entries, query).map((hit) => ({
      ...hit,
      located: byKey.get(`${(hit.entry as Located).canvas.path}\n${hit.entry.id}`)!,
    }));
  }

  renderSuggestion(item: Hit & { located: Located }, el: HTMLElement) {
    const { entry, located } = item;
    el.createDiv({ text: entry.title, cls: 'cf-title' });
    const query = this.inputEl.value;
    const detail = entry.kind === 'text' || entry.kind === 'file' ? snippet(entry.body, query) : '';
    const meta = [ICONS[entry.kind], this.showCanvasName ? located.canvas.basename : '', entry.kind === 'text' ? detail : ''].filter(Boolean);
    el.createDiv({ text: meta.join(' · '), cls: 'cf-detail' });
    if (entry.kind === 'file' && detail) el.createDiv({ text: detail, cls: 'cf-detail' });
  }

  onChooseSuggestion(item: Hit & { located: Located }) {
    this.onChoose(item.located);
  }
}

export default class CanvasFinderPlugin extends Plugin {
  onload() {
    this.addCommand({
      id: 'find-in-canvas',
      name: 'Find in this canvas',
      icon: 'search',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(ItemView);
        if (!isCanvasView(view) || !view.file) return false;
        if (!checking) void this.find([view.file], view.getViewData());
        return true;
      },
    });

    this.addCommand({
      id: 'find-in-all-canvases',
      name: 'Find in all canvases',
      icon: 'layout-dashboard',
      callback: () => void this.find(this.app.vault.getFiles().filter((f) => f.extension === 'canvas')),
    });
  }

  private async find(files: TFile[], liveData?: string) {
    if (files.length === 0) {
      new Notice('There are no canvases in this vault.');
      return;
    }
    const entries: Located[] = [];
    for (const file of files) {
      const raw = liveData ?? (await this.app.vault.cachedRead(file));
      for (const entry of parseCanvas(raw)) {
        let full = entry;
        if (entry.kind === 'file' && entry.file?.toLowerCase().endsWith('.md')) {
          const target = this.app.vault.getFileByPath(entry.file);
          if (target) full = withContent(entry, (await this.app.vault.cachedRead(target)).slice(0, FILE_TEXT_LIMIT));
        }
        entries.push({ ...full, canvas: file });
      }
    }
    if (entries.length === 0) {
      new Notice('Nothing to search yet: no cards found.');
      return;
    }
    new CanvasSuggestModal(this.app, entries, files.length > 1, (entry) => void this.reveal(entry)).open();
  }

  /** Opens the canvas if needed, then selects the node and zooms to it. */
  private async reveal(entry: Located) {
    let leaf: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((l) => {
      if (isCanvasView(l.view) && l.view.file?.path === entry.canvas.path) leaf = l;
    });
    leaf ??= this.app.workspace.getLeaf(false);
    await leaf.openFile(entry.canvas);
    await this.app.workspace.revealLeaf(leaf);
    for (let attempt = 0; attempt < 20; attempt++) {
      const view = leaf.view;
      const node = isCanvasView(view) ? view.canvas?.nodes.get(entry.id) : undefined;
      if (isCanvasView(view) && view.canvas && node) {
        view.canvas.selectOnly(node);
        view.canvas.zoomToSelection();
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    }
    new Notice('Opened the canvas, but could not find that card on it.');
  }
}
