import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { ErrorRequestHandler, Request, Response } from "express";
import { NightyDocsCorpus } from "./corpus.js";
import { createNightyDocsServer } from "./mcp.js";
import { createRateLimitMiddleware } from "./rate-limit.js";

const PUBLIC_URL = "https://nighty-mcp.niggy.lol/";
const SOURCE_URL = "https://github.com/aboveproof/nighty-docs";
const COMPONENT_EMBED_URL = `${PUBLIC_URL}discord-embed.json`;

interface HealthPayload {
  name: string;
  status: ReturnType<NightyDocsCorpus["getStatus"]>["status"];
  documents: number;
  uptime: string;
  latency: string;
  mcp: string;
  source: string;
}

function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    `${remainingSeconds}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function healthPayload(corpus: NightyDocsCorpus, latencyMs: number): HealthPayload {
  const status = corpus.getStatus();
  return {
    name: "nighty-docs-mcp",
    status: status.status,
    documents: status.documents,
    uptime: formatUptime(process.uptime()),
    latency: `${latencyMs}ms`,
    mcp: "/mcp",
    source: SOURCE_URL,
  };
}

async function refreshedHealthPayload(corpus: NightyDocsCorpus): Promise<HealthPayload> {
  const startedAt = performance.now();
  try {
    await corpus.getAll();
  } catch {
    // getStatus() carries the unavailable state for the response below.
  }
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  return healthPayload(corpus, latencyMs);
}

export function renderLandingPage(payload: HealthPayload): string {
  const description = [
    "Read-only MCP access to NightyScript documentation and examples.",
    `Status: ${payload.status}`,
    `Indexed documents: ${payload.documents}`,
    `Uptime: ${payload.uptime}`,
    `Latency: ${payload.latency}`,
  ].join("\n");
  const json = JSON.stringify(payload, null, 2);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nighty Docs MCP</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#5865F2">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Nighty Docs MCP">
  <meta property="og:title" content="Nighty Docs MCP">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${PUBLIC_URL}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Nighty Docs MCP">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="discord:component-embed" type="application/json" href="${COMPONENT_EMBED_URL}">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d12; color: #f4f5f7; }
    main { width: min(680px, calc(100% - 40px)); }
    p { color: #aeb4c0; line-height: 1.6; }
    pre { overflow-x: auto; padding: 20px; border: 1px solid #292e3a; border-radius: 12px; background: #12151d; color: #d7dcff; }
    a { color: #aeb8ff; }
  </style>
</head>
<body>
  <main>
    <h1>Nighty Docs MCP</h1>
    <p>Read-only MCP access to the NightyScript documentation and examples.</p>
    <pre>${escapeHtml(json)}</pre>
    <p><a href="/mcp">MCP endpoint</a> · <a href="/health">Health JSON</a> · <a href="${SOURCE_URL}">Source documentation</a></p>
  </main>
</body>
</html>`;
}

export function createDiscordComponentEmbed(payload: HealthPayload): object {
  const statusJson = JSON.stringify(payload, null, 2);
  return {
    component: {
      type: 17,
      accent_color: null,
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content:
                "## Nighty Docs MCP\nRead-only MCP access to NightyScript documentation and examples.",
            },
          ],
          accessory: {
            type: 2,
            style: 5,
            label: "View source",
            url: SOURCE_URL,
          },
        },
        {
          type: 14,
          divider: true,
          spacing: 1,
        },
        {
          type: 10,
          content: `### Live status\n\`\`\`json\n${statusJson}\n\`\`\``,
        },
      ],
    },
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const corpus = new NightyDocsCorpus();
const publicBinding = process.env.VERCEL || process.env.HOST === "0.0.0.0";
const app = createMcpExpressApp({
  host: publicBinding ? "0.0.0.0" : "127.0.0.1",
});

app.get("/", async (request: Request, response: Response) => {
  const payload = await refreshedHealthPayload(corpus);
  const statusCode = payload.status === "unavailable" ? 503 : 200;
  if (request.accepts(["html", "json"]) === "json") {
    response.status(statusCode).json(payload);
    return;
  }
  response.status(statusCode).type("html").send(renderLandingPage(payload));
});

app.get("/health", async (_request: Request, response: Response) => {
  const payload = await refreshedHealthPayload(corpus);
  const statusCode = payload.status === "unavailable" ? 503 : 200;
  response.status(statusCode).json(payload);
});

app.get("/discord-embed.json", async (_request: Request, response: Response) => {
  const payload = await refreshedHealthPayload(corpus);
  const statusCode = payload.status === "unavailable" ? 503 : 200;
  response.status(statusCode).json(createDiscordComponentEmbed(payload));
});

const rateLimit = createRateLimitMiddleware(
  positiveInteger(process.env.RATE_LIMIT_MAX, 120),
  positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
);

app.post("/mcp", rateLimit, async (request: Request, response: Response) => {
  let server: Awaited<ReturnType<typeof createNightyDocsServer>> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  let connectionClosed = false;
  let cleanupPromise: Promise<void> | undefined;

  const cleanup = async (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    const resources = [transport, server].filter(
      (resource): resource is NonNullable<typeof resource> => resource !== undefined,
    );
    if (resources.length === 0) return;

    cleanupPromise = Promise.allSettled(resources.map((resource) => resource.close())).then(
      () => undefined,
    );
    return cleanupPromise;
  };

  response.once("close", () => {
    connectionClosed = true;
    void cleanup();
  });

  try {
    server = await createNightyDocsServer(corpus);
    if (connectionClosed) {
      await cleanup();
      return;
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    if (connectionClosed) {
      await cleanup();
      return;
    }

    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    await cleanup();
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

for (const method of ["get", "delete"] as const) {
  app[method]("/mcp", (_request: Request, response: Response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  });
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("Unhandled request error:", error);
  if (!response.headersSent) {
    response.status(500).json({ error: "Internal server error" });
  }
};

app.use(errorHandler);

export default app;
