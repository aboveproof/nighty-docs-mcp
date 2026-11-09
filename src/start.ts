import app from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const httpServer = app.listen(port, host, (error?: Error) => {
  if (error) {
    console.error("Failed to start Nighty Docs MCP server:", error);
    process.exit(1);
  }
  console.log(`Nighty Docs MCP listening on http://${host}:${port}/mcp`);
});

function shutDown(): void {
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
