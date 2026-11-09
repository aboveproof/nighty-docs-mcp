import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVE_LIMITS,
  NightyDocsCorpus,
  parseRepositoryArchive,
  searchDocuments,
} from "../src/corpus.js";

function fixtureArchive(): Uint8Array {
  return zipSync({
    "nighty-docs-main/README.md": strToU8(
      "<div align=\"center\"><h1>NightyScript Documentation</h1></div>\n```python\n# Unsupported\n```",
    ),
    "nighty-docs-main/docs/ui-scripting.md": strToU8(
      "# Native UI scripting\nCreate a Tab, CardContainer, Card, and UI Button.",
    ),
    "nighty-docs-main/example-scripts/reload_safe_worker.py": strToU8(
      "# Cancel background tasks during a reload\nasync def cleanup(): pass",
    ),
    "nighty-docs-main/image.png": new Uint8Array([1, 2, 3]),
  });
}

describe("parseRepositoryArchive", () => {
  it("indexes human-readable repository files without binary assets", () => {
    const documents = parseRepositoryArchive(fixtureArchive());

    expect(documents).toHaveLength(3);
    expect(documents.map((document) => document.id)).toContain("docs/ui-scripting.md");
    expect(documents.find((document) => document.id === "README.md")?.title).toBe(
      "NightyScript Documentation",
    );
    expect(documents.find((document) => document.id === "docs/ui-scripting.md")).toMatchObject({
      title: "Native UI scripting",
      category: "docs",
      mimeType: "text/markdown",
    });
  });

  it("rejects an archive above the compressed download limit", () => {
    const archive = new Uint8Array(ARCHIVE_LIMITS.compressedBytes + 1);
    expect(() => parseRepositoryArchive(archive)).toThrow("download limit");
  });

  it("rejects a text file above the extraction limit", () => {
    const archive = zipSync({
      "nighty-docs-main/large.md": new Uint8Array(ARCHIVE_LIMITS.fileBytes + 1),
    });
    expect(() => parseRepositoryArchive(archive)).toThrow("file exceeds");
  });

  it("rejects unsafe archive paths", () => {
    const archive = zipSync({
      "nighty-docs-main/../outside.md": strToU8("# Outside"),
    });
    expect(() => parseRepositoryArchive(archive)).toThrow("unsafe or invalid path");
  });

  it("rejects archives with too many entries", () => {
    const entries = Object.fromEntries(
      Array.from({ length: ARCHIVE_LIMITS.entries + 1 }, (_, index) => [
        `nighty-docs-main/docs/${index}.md`,
        strToU8(`# ${index}`),
      ]),
    );
    expect(() => parseRepositoryArchive(zipSync(entries))).toThrow("entry limit");
  });

  it("rejects archives above the aggregate extraction limit", () => {
    const entryCount = 11;
    const entryBytes = Math.floor(ARCHIVE_LIMITS.extractedBytes / entryCount) + 1;
    const entries = Object.fromEntries(
      Array.from({ length: entryCount }, (_, index) => [
        `nighty-docs-main/docs/${index}.md`,
        new Uint8Array(entryBytes),
      ]),
    );
    expect(() => parseRepositoryArchive(zipSync(entries))).toThrow(
      "extraction limit",
    );
  });
});

describe("searchDocuments", () => {
  it("ranks exact title and path matches above incidental content matches", () => {
    const documents = parseRepositoryArchive(fixtureArchive());
    const results = searchDocuments(documents, "UI scripting");

    expect(results[0]).toMatchObject({
      id: "docs/ui-scripting.md",
      title: "Native UI scripting",
    });
  });

  it("can restrict results to example scripts", () => {
    const documents = parseRepositoryArchive(fixtureArchive());
    const results = searchDocuments(documents, "reload", { category: "examples" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("example-scripts/reload_safe_worker.py");
  });
});

describe("NightyDocsCorpus", () => {
  it("serves stale documents during the refresh backoff window", async () => {
    const archive = fixtureArchive();
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length === 1) {
        return new Response(archive, { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    }) as unknown as typeof fetch;
    const corpus = new NightyDocsCorpus({
      cacheTtlMs: 0,
      retryBackoffMs: 60_000,
      fetchImpl,
    });

    const initial = await corpus.getAll();
    const stale = await corpus.getAll();
    const backedOff = await corpus.getAll();

    expect(initial).toHaveLength(3);
    expect(stale).toBe(initial);
    expect(backedOff).toBe(initial);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(corpus.getStatus()).toEqual({ status: "stale", documents: 3 });
  });

  it("stops reading an oversized archive response", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array(ARCHIVE_LIMITS.compressedBytes + 1), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    const corpus = new NightyDocsCorpus({ fetchImpl });

    await expect(corpus.getAll()).rejects.toThrow("download limit");
    expect(corpus.getStatus()).toEqual({ status: "unavailable", documents: 0 });
  });
});
