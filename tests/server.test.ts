import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NightyDocsCorpus } from "../src/corpus.js";
import app from "../src/server.js";

describe("public status page", () => {
  let origin: string;
  const server = app.listen(0, "127.0.0.1");

  beforeAll(async () => {
    vi.spyOn(NightyDocsCorpus.prototype, "getAll").mockResolvedValue([]);
    await new Promise<void>((resolve, reject) => {
      if (server.listening) {
        resolve();
        return;
      }
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("serves Discord-friendly Open Graph metadata", async () => {
    const response = await fetch(`${origin}/`, {
      headers: { Accept: "text/html" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('<meta property="og:title" content="Nighty Docs MCP">');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:url" content="https://nighty-mcp.niggy.lol/">');
    expect(html).toContain('<meta name="theme-color" content="#5865F2">');
    expect(html).toContain(
      '<link rel="discord:component-embed" type="application/json" href="https://nighty-mcp.niggy.lol/discord-embed.json">',
    );
    expect(html).toContain("&quot;name&quot;: &quot;nighty-docs-mcp&quot;");
  });

  it("keeps the health payload available as JSON", async () => {
    const [healthResponse, negotiatedResponse] = await Promise.all([
      fetch(`${origin}/health`),
      fetch(`${origin}/`, { headers: { Accept: "application/json" } }),
    ]);

    expect(healthResponse.headers.get("content-type")).toContain("application/json");
    expect(negotiatedResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(healthResponse.json()).resolves.toMatchObject({
      name: "nighty-docs-mcp",
      mcp: "/mcp",
      uptime: expect.stringMatching(/^((\d+d )?(\d+h )?(\d+m )?\d+s)$/),
    });
  });

  it("serves a Components V2 link embed", async () => {
    const response = await fetch(`${origin}/discord-embed.json`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({
      component: {
        type: 17,
        accent_color: null,
      },
    });
    expect(body.component.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 10,
          content: expect.stringContaining('"name": "nighty-docs-mcp"'),
        }),
      ]),
    );
    expect(body.component.components.at(-1).content).toContain('"uptime":');
  });
});
