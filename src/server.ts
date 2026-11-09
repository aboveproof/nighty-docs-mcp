import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { ErrorRequestHandler, Request, Response } from "express";
import { NightyDocsCorpus } from "./corpus.js";
import { createNightyDocsServer } from "./mcp.js";
import { createRateLimitMiddleware } from "./rate-limit.js";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const corpus = new NightyDocsCorpus();
const publicBinding = process.env.VERCEL || process.env.HOST === "0.0.0.0";
const app = createMcpExpressApp({
  host: publicBinding ? "0.0.0.0" : "127.0.0.1",
});

app.get("/", async (_request: Request, response: Response) => {
  const corpusStatus = corpus.getStatus();
  const statusCode = corpusStatus.status === "unavailable" ? 503 : 200;
  response.status(statusCode).json({
    name: "nighty-docs-mcp",
    status: corpusStatus.status,
    documents: corpusStatus.documents,
    mcp: "/mcp",
    source: "https://github.com/aboveproof/nighty-docs",
  });
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
