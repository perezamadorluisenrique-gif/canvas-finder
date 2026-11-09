// Reads the JSON of a .canvas file into plain entries. Pure.

export type NodeKind = 'text' | 'file' | 'link' | 'group';

export interface CanvasEntry {
  id: string;
  kind: NodeKind;
  /** Shown as the main line of a result. */
  title: string;
  /** Everything searchable about the node, lower-cased by the search. */
  body: string;
  /** Vault path of a file node, if it is one. */
  file?: string;
}

interface RawNode {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  file?: unknown;
  url?: unknown;
  label?: unknown;
  subpath?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function firstLine(text: string, max = 80): string {
  const line = text.split('\n').map((l) => l.replace(/^[#>\-*\s]+/, '').trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The base name of a vault path without its folder or `.md`. */
export function baseName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/** Entries for every node in a canvas; invalid JSON gives an empty list. */
export function parseCanvas(json: string): CanvasEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const nodes = (data as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) return [];
  const out: CanvasEntry[] = [];
  for (const raw of nodes as RawNode[]) {
    const id = str(raw?.id);
    if (!id) continue;
    switch (raw.type) {
      case 'text': {
        const text = str(raw.text);
        out.push({ id, kind: 'text', title: firstLine(text) || '(empty card)', body: text });
        break;
      }
      case 'file': {
        const file = str(raw.file);
        out.push({ id, kind: 'file', title: baseName(file) || '(file)', body: `${file} ${str(raw.subpath)}`, file });
        break;
      }
      case 'link': {
        const url = str(raw.url);
        out.push({ id, kind: 'link', title: url || '(link)', body: url });
        break;
      }
      case 'group': {
        const label = str(raw.label);
        out.push({ id, kind: 'group', title: label || '(unnamed group)', body: label });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** The same entry with the text of its file added to what is searched. */
export function withContent(entry: CanvasEntry, content: string): CanvasEntry {
  return { ...entry, body: `${entry.body}\n${content}` };
}
