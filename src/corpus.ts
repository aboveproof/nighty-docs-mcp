import { unzipSync } from "fflate";
import path from "node:path";

const DEFAULT_REPOSITORY = "aboveproof/nighty-docs";
const DEFAULT_REF = "main";
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_RETRY_BACKOFF_MS = 60 * 1000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_ARCHIVE_BYTES = 5_000_000;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_EXTRACTED_BYTES = 10_000_000;

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".py",
  ".js",
  ".json",
  ".txt",
  ".toml",
  ".yaml",
  ".yml",
]);

export type DocumentCategory = "docs" | "examples" | "repository";

export interface NightyDocument {
  id: string;
  title: string;
  text: string;
  url: string;
  resourceUri: string;
  mimeType: string;
  category: DocumentCategory;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  category: DocumentCategory;
  score: number;
}

export interface CorpusOptions {
  repository?: string;
  ref?: string;
  cacheTtlMs?: number;
  retryBackoffMs?: number;
  fetchImpl?: typeof fetch;
}

export type CorpusStatus = "idle" | "loading" | "ok" | "stale" | "unavailable";

export const ARCHIVE_LIMITS = Object.freeze({
  compressedBytes: MAX_ARCHIVE_BYTES,
  entries: MAX_ARCHIVE_ENTRIES,
  fileBytes: MAX_FILE_BYTES,
  extractedBytes: MAX_EXTRACTED_BYTES,
});

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isTextFile(filePath: string): boolean {
  const base = path.posix.basename(filePath);
  return (
    TEXT_EXTENSIONS.has(path.posix.extname(base).toLowerCase()) ||
    base === "LICENSE" ||
    base === ".gitignore"
  );
}

function repositoryPath(entryPath: string, expectedRoot?: string): {
  root: string;
  filePath: string;
} | null {
  if (entryPath.includes("\\") || entryPath.includes("\0")) return null;

  const parts = entryPath.split("/");
  if (parts.length < 2 || parts.some((part) => part === "." || part === "..")) {
    return null;
  }

  const [root, ...fileParts] = parts;
  if (!root || (expectedRoot && root !== expectedRoot)) return null;

  const filePath = fileParts.join("/");
  if (!filePath || filePath.startsWith("/")) return null;
  return { root, filePath };
}

function titleFor(filePath: string, text: string): string {
  if (path.posix.extname(filePath).toLowerCase() === ".md") {
    const htmlHeading = text.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim();
    if (htmlHeading) return htmlHeading;

    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (heading) return heading;
  }

  const base = path.posix.basename(filePath, path.posix.extname(filePath));
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function mimeTypeFor(filePath: string): string {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".py":
      return "text/x-python";
    case ".js":
      return "text/javascript";
    case ".json":
      return "application/json";
    default:
      return "text/plain";
  }
}

function categoryFor(filePath: string): DocumentCategory {
  if (filePath.startsWith("docs/")) return "docs";
  if (filePath.startsWith("example-scripts/")) return "examples";
  return "repository";
}

function githubUrl(repository: string, ref: string, filePath: string): string {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repository}/blob/${encodeURIComponent(ref)}/${encodedPath}`;
}

function resourceUri(filePath: string): string {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `nighty-docs:///${encodedPath}`;
}

export function parseRepositoryArchive(
  archive: Uint8Array,
  repository = DEFAULT_REPOSITORY,
  ref = DEFAULT_REF,
): NightyDocument[] {
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive exceeds the ${MAX_ARCHIVE_BYTES}-byte download limit.`);
  }

  let entryCount = 0;
  let extractedBytes = 0;
  let archiveRoot: string | undefined;

  const entries = unzipSync(archive, {
    filter: (entry) => {
      entryCount += 1;
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`Archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry limit.`);
      }

      if (entry.name.endsWith("/")) return false;
      const parsed = repositoryPath(entry.name, archiveRoot);
      if (!parsed) throw new Error("Archive contains an unsafe or invalid path.");
      archiveRoot ??= parsed.root;

      if (!isTextFile(parsed.filePath)) return false;
      if (entry.originalSize > MAX_FILE_BYTES) {
        throw new Error(`Archive file exceeds the ${MAX_FILE_BYTES}-byte limit.`);
      }

      extractedBytes += entry.originalSize;
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new Error(
          `Archive exceeds the ${MAX_EXTRACTED_BYTES}-byte extraction limit.`,
        );
      }
      return true;
    },
  });
  const files = Object.entries(entries);

  if (files.length === 0) {
    throw new Error("The Nighty Docs archive did not contain any files.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });

  return files
    .map(([entryPath, bytes]) => {
      const parsed = repositoryPath(entryPath, archiveRoot);
      if (!parsed || bytes.length > MAX_FILE_BYTES) {
        throw new Error("Archive extraction produced an invalid file.");
      }

      const text = decoder.decode(bytes);
      return {
        id: parsed.filePath,
        title: titleFor(parsed.filePath, text),
        text,
        url: githubUrl(repository, ref, parsed.filePath),
        resourceUri: resourceUri(parsed.filePath),
        mimeType: mimeTypeFor(parsed.filePath),
        category: categoryFor(parsed.filePath),
      } satisfies NightyDocument;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function readResponseBytes(
  response: Response,
  maxBytes = MAX_ARCHIVE_BYTES,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Archive exceeds the ${maxBytes}-byte download limit.`);
  }
  if (!response.body) throw new Error("GitHub returned an empty archive response.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel("Archive download limit exceeded");
        throw new Error(`Archive exceeds the ${maxBytes}-byte download limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(token, position)) !== -1) {
    count += 1;
    position += token.length;
  }
  return count;
}

function makeSnippet(text: string, query: string, tokens: string[]): string {
  const lower = text.toLowerCase();
  let matchIndex = lower.indexOf(query);
  if (matchIndex === -1) {
    matchIndex = tokens.reduce((found, token) => {
      if (found !== -1) return found;
      return lower.indexOf(token);
    }, -1);
  }

  if (matchIndex === -1) matchIndex = 0;
  const start = Math.max(0, matchIndex - 180);
  const end = Math.min(text.length, matchIndex + 420);
  const snippet = text.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
}

export function searchDocuments(
  documents: NightyDocument[],
  query: string,
  options: { category?: DocumentCategory; limit?: number } = {},
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const tokens = [
    ...new Set(normalizedQuery.match(/[a-z0-9_./-]+/g) ?? []),
  ].filter((token) => token.length > 1);
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);

  return documents
    .filter((document) => !options.category || document.category === options.category)
    .map((document) => {
      const title = document.title.toLowerCase();
      const filePath = document.id.toLowerCase();
      const text = document.text.toLowerCase();
      let score = 0;

      if (title.includes(normalizedQuery)) score += 80;
      if (filePath.includes(normalizedQuery)) score += 60;
      if (text.includes(normalizedQuery)) score += 40;

      for (const token of tokens) {
        if (title.includes(token)) score += 15;
        if (filePath.includes(token)) score += 10;
        score += Math.min(countOccurrences(text, token), 8) * 2;
      }

      return {
        id: document.id,
        title: document.title,
        url: document.url,
        snippet: makeSnippet(document.text, normalizedQuery, tokens),
        category: document.category,
        score,
      } satisfies SearchResult;
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export class NightyDocsCorpus {
  private readonly repository: string;
  private readonly ref: string;
  private readonly cacheTtlMs: number;
  private readonly retryBackoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private documents: NightyDocument[] | null = null;
  private loadedAt = 0;
  private retryAfter = 0;
  private refreshFailed = false;
  private loading: Promise<NightyDocument[]> | null = null;

  constructor(options: CorpusOptions = {}) {
    this.repository =
      options.repository ?? process.env.NIGHTY_DOCS_REPOSITORY ?? DEFAULT_REPOSITORY;
    this.ref = options.ref ?? process.env.NIGHTY_DOCS_REF ?? DEFAULT_REF;
    this.cacheTtlMs =
      options.cacheTtlMs ?? envNumber("CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS);
    this.retryBackoffMs =
      options.retryBackoffMs ??
      envNumber("RETRY_BACKOFF_MS", DEFAULT_RETRY_BACKOFF_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getAll(): Promise<NightyDocument[]> {
    const now = Date.now();
    const cacheIsFresh =
      this.documents && now - this.loadedAt < this.cacheTtlMs;
    if (cacheIsFresh) return this.documents!;
    if (this.documents && now < this.retryAfter) return this.documents;
    if (this.loading) return this.loading;

    this.loading = this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  getStatus(): { status: CorpusStatus; documents: number } {
    if (this.loading && !this.documents) return { status: "loading", documents: 0 };
    if (this.documents && this.refreshFailed) {
      return { status: "stale", documents: this.documents.length };
    }
    if (this.documents) return { status: "ok", documents: this.documents.length };
    if (this.refreshFailed) return { status: "unavailable", documents: 0 };
    return { status: "idle", documents: 0 };
  }

  async get(id: string): Promise<NightyDocument | undefined> {
    const documents = await this.getAll();
    const normalizedId = id.replace(/^\/+/, "").toLowerCase();
    return documents.find((document) => document.id.toLowerCase() === normalizedId);
  }

  async search(
    query: string,
    options: { category?: DocumentCategory; limit?: number } = {},
  ): Promise<SearchResult[]> {
    return searchDocuments(await this.getAll(), query, options);
  }

  private async load(): Promise<NightyDocument[]> {
    const archiveUrl = `https://codeload.github.com/${this.repository}/zip/refs/heads/${encodeURIComponent(this.ref)}`;

    try {
      const response = await this.fetchImpl(archiveUrl, {
        headers: {
          Accept: "application/zip",
          "User-Agent": "nighty-docs-mcp",
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
      }

      const documents = parseRepositoryArchive(
        await readResponseBytes(response),
        this.repository,
        this.ref,
      );
      this.documents = documents;
      this.loadedAt = Date.now();
      this.retryAfter = 0;
      this.refreshFailed = false;
      return documents;
    } catch (error) {
      this.refreshFailed = true;
      if (this.documents) {
        this.retryAfter = Date.now() + this.retryBackoffMs;
        return this.documents;
      }
      throw new Error(
        `Unable to load ${this.repository}@${this.ref}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
