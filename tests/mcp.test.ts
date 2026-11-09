import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { NightyDocsCorpus } from "../src/corpus.js";
import { createNightyDocsServer } from "../src/mcp.js";

describe("Nighty Docs MCP context", () => {
  it("reports NightyScript instructions and exposes the runtime context", async () => {
    const archive = zipSync({
      "nighty-docs-main/README.md": strToU8("# NightyScript Documentation"),
    });
    const corpus = new NightyDocsCorpus({
      fetchImpl: async () => new Response(archive, { status: 200 }),
    });
    const server = await createNightyDocsServer(corpus);
    const client = new Client({ name: "context-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);

      expect(client.getInstructions()).toContain(
        "This server is for NightyScript development.",
      );
      expect(client.getInstructions()).toContain(
        "assess the requested behavior itself",
      );

      const resources = await client.listResources();
      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: "nighty-docs:///runtime-context",
            name: "nightyscript-runtime-context",
          }),
        ]),
      );

      const context = await client.readResource({
        uri: "nighty-docs:///runtime-context",
      });
      expect(context.contents[0]).toMatchObject({
        uri: "nighty-docs:///runtime-context",
        mimeType: "text/markdown",
      });
      expect("text" in context.contents[0] && context.contents[0].text).toContain(
        "NightyScript is the scripting system built into Nighty.",
      );
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });
});
