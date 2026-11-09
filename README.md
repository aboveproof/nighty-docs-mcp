<div align="center">
  <h1>Nighty Docs MCP</h1>
  <p>Model Context Protocol access to the official NightyScript documentation and examples.</p>

  <p>
    <a href="https://github.com/aboveproof/nighty-docs-mcp/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/aboveproof/nighty-docs-mcp/actions/workflows/ci.yml/badge.svg"></a>
    <a href="./LICENSE"><img alt="GPL-3.0 license" src="https://img.shields.io/badge/license-GPL--3.0-5865F2.svg"></a>
    <img alt="Node.js 22" src="https://img.shields.io/badge/node-22.x-339933.svg">
    <img alt="MCP transport: Streamable HTTP" src="https://img.shields.io/badge/MCP-Streamable_HTTP-F59E0B.svg">
  </p>

  <p>
    <a href="https://github.com/aboveproof/nighty-docs">Source documentation</a>
    ·
    <a href="https://nighty-mcp.niggy.lol/mcp">Hosted endpoint</a>
    ·
    <a href="./CONTRIBUTING.md">Contributing</a>
  </p>
</div>

---

Nighty Docs MCP serves the contents of
[`aboveproof/nighty-docs`](https://github.com/aboveproof/nighty-docs) through a
read-only MCP endpoint. It covers the reference guides, troubleshooting notes,
and example scripts stored in that repository.

> [!NOTE]
> The `nighty-docs` repository remains the source of truth. This project reads
> its files without changing their content or presentation.

## Endpoint

| Service | URL |
| :--- | :--- |
| MCP | `https://nighty-mcp.niggy.lol/mcp` |
| Health check | `https://nighty-mcp.niggy.lol/` |
| Source documents | [`github.com/aboveproof/nighty-docs`](https://github.com/aboveproof/nighty-docs) |

The hosted service requires no account or API key. Self-hosted instances use the
same protocol and tools.

## Tools

| Tool | Purpose |
| :--- | :--- |
| `search` | Search guides and example scripts by phrase or topic |
| `fetch` | Read one file by its repository-relative path |
| `list_nighty_documents` | List indexed files, titles, categories, and source URLs |

The server also publishes each indexed text file as an MCP resource under the
`nighty-docs:///` URI scheme. Tool responses include links to the matching files
on GitHub.

## Client setup

Nighty Docs MCP uses Streamable HTTP and does not require authentication.

### Ask a coding agent to add it

Paste this into Codex, Claude Code, Cursor, OpenCode, or another coding agent
that can manage its own MCP configuration:

```text
Add the Nighty Docs MCP server to this client's user-level MCP configuration.

Name: nightyDocs
Transport: Streamable HTTP
URL: https://nighty-mcp.niggy.lol/mcp
Authentication: none

Preserve every existing MCP server and setting. Do not clone the repository or
start a local process. Use this client's current configuration format, then
verify the connection and confirm that search, fetch, and
list_nighty_documents are available. If you cannot change the MCP settings
yourself, give me the exact manual steps for this client.
```

ChatGPT requires its web setup screen, so use the ChatGPT steps below instead
of the agent prompt.

### Manual setup

<details>
<summary><strong>ChatGPT</strong></summary>

Custom MCP servers are added as plugins in ChatGPT on the web:

1. Open [ChatGPT Plugins](https://chatgpt.com/#settings/Plugins).
2. Select the plus button, then **Add custom MCP server**.
3. Enter `Nighty Docs` as the name and
   `https://nighty-mcp.niggy.lol/mcp` as the server URL.
4. Choose **No authentication**, review the warning, and create the plugin.
5. Install the plugin. Type `@` in a conversation and select **Nighty Docs**
   when it should be used.

See OpenAI's
[custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)
for account and workspace availability.

</details>

<details>
<summary><strong>Codex</strong></summary>

```bash
codex mcp add nightyDocs --url https://nighty-mcp.niggy.lol/mcp
codex mcp list
```

This adds the hosted server to the shared Codex MCP configuration. The same
configuration is available to the Codex CLI and Codex app.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add the server to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nightyDocs": {
      "url": "https://nighty-mcp.niggy.lol/mcp"
    }
  }
}
```

Save the file, restart Cursor, then open **Customize > MCPs** and confirm that
`nightyDocs` is connected.

</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add --transport http nightyDocs --scope user https://nighty-mcp.niggy.lol/mcp
claude mcp get nightyDocs
```

</details>

<details>
<summary><strong>OpenCode</strong></summary>

```bash
opencode mcp add nightyDocs --global --url https://nighty-mcp.niggy.lol/mcp
opencode mcp list
```

The `--global` flag makes the server available in every project. Leave it out
to add the server only to the current project.

</details>

<details>
<summary><strong>Other MCP clients</strong></summary>

Use these connection values in any client that accepts remote Streamable HTTP
servers:

| Setting | Value |
| :--- | :--- |
| Name | `nightyDocs` |
| Transport | `Streamable HTTP` |
| URL | `https://nighty-mcp.niggy.lol/mcp` |
| Authentication | None |

Clients that use the common `mcpServers` format can start with:

```json
{
  "mcpServers": {
    "nightyDocs": {
      "url": "https://nighty-mcp.niggy.lol/mcp"
    }
  }
}
```

Some clients require an explicit `type` or use a different top-level key.
Follow that client's configuration schema when adapting this example.

</details>

<details>
<summary><strong>Local endpoint</strong></summary>

Replace the hosted URL in any client configuration with:

```text
http://127.0.0.1:8787/mcp
```

</details>

### Try it

After connecting, prompts can refer to the server or its tools directly:

```text
Use Nighty Docs to find the documentation for event handlers.
```

```text
Search Nighty Docs for examples of error handling, then fetch the most relevant
example and explain it.
```

```text
List the available NightyScript documents and group them by category.
```

## Data flow

```text
aboveproof/nighty-docs
        │
        ▼
  GitHub ZIP archive
        │
        ▼
 in-memory text index
        │
        ├── search
        ├── fetch
        └── MCP resources
```

The process downloads one repository archive and keeps the parsed text in
memory. The default cache expires after 15 minutes. A failed refresh leaves the
last loaded copy available and pauses refresh attempts for one minute.

The index accepts Markdown, Python, JavaScript, JSON, TOML, YAML, and plain-text
files up to 1 MB. The loader rejects archives above 5 MB, archives with more
than 500 entries, and text payloads above 10 MB. Binary files stay out of the
index.

## Local setup

Install Node.js 22.

```bash
git clone https://github.com/aboveproof/nighty-docs-mcp.git
cd nighty-docs-mcp
npm install
npm run build
npm start
```

The process listens on `http://127.0.0.1:8787`. Development mode watches source
files and restarts the process after a change:

```bash
npm run dev
```

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `NIGHTY_DOCS_REPOSITORY` | `aboveproof/nighty-docs` | GitHub source repository |
| `NIGHTY_DOCS_REF` | `main` | Git branch |
| `CACHE_TTL_MS` | `900000` | Cache lifetime in milliseconds |
| `RETRY_BACKOFF_MS` | `60000` | Delay after a failed cache refresh |
| `RATE_LIMIT_MAX` | `120` | Requests allowed per client and process instance |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |
| `TRUST_PROXY` | unset | Trust proxy client-IP headers outside Vercel |

Containers should set `HOST=0.0.0.0`.

## Deployment

### Vercel

Vercel detects the Express export in [`src/server.ts`](./src/server.ts) and runs
the application as one function.

1. Import `aboveproof/nighty-docs-mcp` at [vercel.com/new](https://vercel.com/new).
2. Deploy with the detected project settings.
3. Add `nighty-mcp.niggy.lol` in the project domain settings.
4. Create the DNS record shown by Vercel.
5. Add a Vercel WAF rate-limit rule for `POST /mcp`: 120 requests per 60 seconds per IP, followed by a `429` response.

Pushes to the production branch create new deployments through the Git
integration.

The in-process limiter protects local and single-instance deployments. Vercel
can run several function instances, so the
[WAF rule](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
enforces the shared public limit before requests reach a function.

### Docker

The image runs as the unprivileged `node` user and listens on port `8787`.

```bash
docker build -t nighty-docs-mcp .
docker run --rm -p 8787:8787 nighty-docs-mcp
```

## Development

```bash
npm run typecheck
npm test
npm run build
```

MCP Inspector can test the HTTP endpoint:

```bash
npx @modelcontextprotocol/inspector@latest
```

Use Streamable HTTP with `http://127.0.0.1:8787/mcp`.

## Project scope

This server reads public documentation. It cannot run NightyScripts, connect to
Discord, modify the source repository, or access a Nighty account.

## Contributing

[`CONTRIBUTING.md`](./CONTRIBUTING.md) covers the development workflow and pull
request checks. Security reports belong in GitHub's private vulnerability
reporting form.

## License

The MCP server code uses the [GPL-3.0 License](./LICENSE). Files retrieved from
`aboveproof/nighty-docs` use that repository's
[GPL-3.0 license](https://github.com/aboveproof/nighty-docs/blob/main/LICENSE).
