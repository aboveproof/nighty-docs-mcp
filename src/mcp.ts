import {
  McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  NightyDocsCorpus,
  type DocumentCategory,
} from "./corpus.js";

const categorySchema = z.enum(["docs", "examples", "repository"]);

export async function createNightyDocsServer(
  corpus: NightyDocsCorpus,
): Promise<McpServer> {
  const documents = await corpus.getAll();
  const server = new McpServer(
    {
      name: "nighty-docs",
      version: "0.1.0",
    },
    {
      instructions:
        "Search the official NightyScript documentation before answering Nighty development questions. Fetch the most relevant documents or examples and use their GitHub URLs as sources. Nighty injects its runtime objects; do not invent nighty or discord.py imports. This server is read-only.",
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search Nighty Docs",
      description:
        "Search the complete official NightyScript documentation and example-script repository. Use this before writing or troubleshooting a NightyScript.",
      inputSchema: {
        query: z.string().min(2).max(300).describe("Terms or question to search for"),
        category: categorySchema.optional().describe("Restrict results to one category"),
        limit: z.number().int().min(1).max(20).default(8),
      },
      outputSchema: {
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string().url(),
            snippet: z.string(),
            category: categorySchema,
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ query, category, limit }) => {
      const results = (await corpus.search(query, {
        category: category as DocumentCategory | undefined,
        limit,
      })).map(({ score: _score, ...result }) => result);

      return {
        structuredContent: { results },
        content: [
          {
            type: "text",
            text:
              results.length > 0
                ? JSON.stringify({ results }, null, 2)
                : `No Nighty Docs results matched "${query}".`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch Nighty Document",
      description:
        "Retrieve a complete Nighty documentation page or example script by the ID returned from search or list_nighty_documents.",
      inputSchema: {
        id: z.string().min(1).max(500).describe("Repository-relative document path"),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        text: z.string(),
        url: z.string().url(),
        category: categorySchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ id }) => {
      const document = await corpus.get(id);
      if (!document) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Nighty Docs document not found: ${id}`,
            },
          ],
        };
      }

      const result = {
        id: document.id,
        title: document.title,
        text: document.text,
        url: document.url,
        category: document.category,
      };
      return {
        structuredContent: result,
        content: [{ type: "text", text: document.text }],
      };
    },
  );

  server.registerTool(
    "list_nighty_documents",
    {
      title: "List Nighty Documents",
      description:
        "List the available Nighty documentation pages, examples, and repository reference files.",
      inputSchema: {
        category: categorySchema.optional(),
      },
      outputSchema: {
        documents: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string().url(),
            category: categorySchema,
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ category }) => {
      const available = (await corpus.getAll())
        .filter((document) => !category || document.category === category)
        .map(({ id, title, url, category: documentCategory }) => ({
          id,
          title,
          url,
          category: documentCategory,
        }));

      return {
        structuredContent: { documents: available },
        content: [
          {
            type: "text",
            text: JSON.stringify({ documents: available }, null, 2),
          },
        ],
      };
    },
  );

  for (const document of documents) {
    server.registerResource(
      document.id,
      document.resourceUri,
      {
        title: document.title,
        description: `Official Nighty Docs source: ${document.id}`,
        mimeType: document.mimeType,
      },
      async () => ({
        contents: [
          {
            uri: document.resourceUri,
            mimeType: document.mimeType,
            text: document.text,
          },
        ],
      }),
    );
  }

  return server;
}
