import { parseDocument } from 'yaml';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import type { Readable } from 'node:stream';
import { SkillType, type SkillImportDraft } from '@devdigest/shared';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';

export const MAX_UPLOAD_BYTES = 512 * 1024;
export const MAX_BODY_CHARS = 100_000;
const MAX_MARKDOWN_BYTES = MAX_BODY_CHARS * 4;
const MAX_ZIP_ENTRIES = 256;
const RAW_HOST = 'raw.githubusercontent.com';
const MARKDOWN_FILE = /\.(md|markdown)$/i;

function toMarkdown(bytes: Uint8Array): string {
  if (bytes.length > MAX_MARKDOWN_BYTES) throw new ValidationError('The Markdown file is too large.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError('Use a UTF-8 Markdown file.');
  }
  if (!text.trim() || text.includes('\0')) throw new ValidationError('The file must contain Markdown text.');
  return text;
}

export function draftFromMarkdown(text: string, filename: string): SkillImportDraft {
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  let metadata: Record<string, unknown> = {};
  let body = text;
  if (frontMatter) {
    try {
      const document = parseDocument(frontMatter[1]!, { schema: 'core' });
      if (document.errors.length) throw new Error();
      const parsed: unknown = document.toJS({ maxAliasCount: 0 });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
        body = text.slice(frontMatter[0].length);
      }
    } catch {
      throw new ValidationError('The skill has invalid YAML front matter.');
    }
  }
  if (!body.trim() || body.length > MAX_BODY_CHARS) {
    throw new ValidationError('The skill body must contain Markdown and be at most 100,000 characters.');
  }
  const title = /^#[ \t]+(.+?)\s*$/m.exec(body)?.[1]?.trim();
  const metadataName = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  const type = SkillType.safeParse(metadata.type);
  return {
    name: (metadataName || title || filename.replace(MARKDOWN_FILE, '')).slice(0, 200),
    description: typeof metadata.description === 'string' ? metadata.description.trim().slice(0, 4000) : '',
    type: type.success ? type.data : 'custom',
    body,
  };
}

function openZip(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, archive) => {
      if (error || !archive) reject(error ?? new Error('No ZIP archive'));
      else resolve(archive);
    });
  });
}

function findSkillCore(archive: ZipFile): Promise<Entry> {
  return new Promise((resolve, reject) => {
    let core: Entry | undefined;
    archive.once('error', reject);
    archive.on('entry', (entry: Entry) => {
      if (/^(?:[^/]+\/)?SKILL\.md$/i.test(entry.fileName)) {
        const entryType = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (core || /[\u0000-\u001f\u007f]/u.test(entry.fileName) || entry.fileName.length > 512
          || (entryType !== 0 && entryType !== 0o100000) || (entry.externalFileAttributes & 0x10) !== 0) {
          reject(new ValidationError('The archive must contain one regular SKILL.md file at the root or inside a single folder.'));
          return;
        }
        core = entry;
      }
      archive.readEntry();
    });
    archive.once('end', () => {
      if (core) resolve(core);
      else reject(new ValidationError('No SKILL.md was found at the root or inside a single folder.'));
    });
    archive.readEntry();
  });
}

async function readZipSkill(bytes: Buffer): Promise<{ bytes: Buffer; filename: string }> {
  let archive: ZipFile | undefined;
  try {
    archive = await openZip(bytes);
    if (archive.entryCount > MAX_ZIP_ENTRIES) throw new ValidationError('The ZIP contains too many entries.');
    const entry = await findSkillCore(archive);
    if (entry.uncompressedSize > MAX_MARKDOWN_BYTES) throw new ValidationError('SKILL.md is too large.');
    const stream = await new Promise<Readable>((resolve, reject) => {
      archive!.openReadStream(entry, (error, content) => {
        if (error || !content) reject(error ?? new Error('No ZIP entry stream'));
        else resolve(content);
      });
    });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_MARKDOWN_BYTES) throw new ValidationError('SKILL.md is too large.');
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), filename: entry.fileName };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('The ZIP is invalid or uses an unsupported format.');
  } finally {
    archive?.close();
  }
}

export async function loadFileDraft(filename: string, bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Choose a Markdown file or ZIP under 512 KB.');
  }
  if (/[\\/\u0000-\u001f\u007f]/u.test(filename)) throw new ValidationError('Invalid file name.');
  if (MARKDOWN_FILE.test(filename)) {
    return { draft: draftFromMarkdown(toMarkdown(bytes), filename), reference: filename };
  }
  if (/\.zip$/i.test(filename)) {
    const core = await readZipSkill(bytes);
    return {
      draft: draftFromMarkdown(toMarkdown(core.bytes), core.filename.split('/').at(-1)!),
      reference: filename + ' / ' + core.filename,
    };
  }
  throw new ValidationError('Choose a Markdown file or ZIP archive.');
}

export function githubMarkdownUrl(input: string): { url: URL; filename: string } {
  const invalid = () => new ValidationError('Enter a public GitHub Markdown file URL or its raw HTTPS URL.');
  try {
    const source = new URL(input);
    if (source.protocol !== 'https:' || source.username || source.password || source.port || source.search) throw invalid();
    const segments = source.pathname.slice(1).split('/').map(decodeURIComponent);
    if (segments.some((part) => !part || part === '.' || part === '..' || /[/\\\u0000-\u001f\u007f]/u.test(part))) {
      throw invalid();
    }
    if (source.hostname === 'github.com' && segments[2] === 'blob') segments.splice(2, 1);
    else if (source.hostname !== RAW_HOST) throw invalid();
    const filename = segments.at(-1)!;
    if (segments.length < 4 || !segments.slice(0, 2).every((part) => /^[\w.-]+$/.test(part))
      || !MARKDOWN_FILE.test(filename)) throw invalid();
    return { url: new URL('https://' + RAW_HOST + '/' + segments.map(encodeURIComponent).join('/')), filename };
  } catch {
    throw invalid();
  }
}

export async function loadUrlDraft(input: string, fetchMarkdown: typeof fetch = fetch) {
  const { url, filename } = githubMarkdownUrl(input);
  let bytes: Buffer;
  try {
    const response = await fetchMarkdown(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'text/plain, text/markdown' },
    });
    const contentType = response.headers.get('content-type');
    if (!response.ok || !response.body || !/^text\/(plain|markdown)(?:\s*;|$)/i.test(contentType ?? '')) {
      await response.body?.cancel();
      throw new Error('Markdown unavailable');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_MARKDOWN_BYTES) throw new ValidationError('The remote Markdown file is too large.');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    bytes = Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ExternalServiceError('Could not load the public GitHub Markdown file.');
  }
  return { draft: draftFromMarkdown(toMarkdown(bytes), filename), reference: url.href };
}
