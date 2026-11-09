# Contributing

Nighty Docs MCP accepts bug fixes, protocol improvements, tests, and deployment
work. Documentation corrections belong in
[`aboveproof/nighty-docs`](https://github.com/aboveproof/nighty-docs).

## Setup

Install Node.js 20 or newer.

```bash
git clone https://github.com/aboveproof/nighty-docs-mcp.git
cd nighty-docs-mcp
npm install
```

## Development checks

Run the CI checks:

```bash
npm run typecheck
npm test
npm run build
```

Start the HTTP server with file watching:

```bash
npm run dev
```

MCP Inspector can connect to `http://127.0.0.1:8787/mcp`.

## Pull requests

Keep each pull request focused on one change. Add tests for changed search,
indexing, transport, or cache behavior. Describe the user-visible result and
include the commands used for verification.

Pull requests should preserve these project boundaries:

- Tools remain read-only.
- `aboveproof/nighty-docs` remains the documentation source.
- Tool results retain source URLs.
- Public tool names and schemas remain compatible.

## Writing

Project documentation follows
[`hardikpandya/stop-slop`](https://github.com/hardikpandya/stop-slop). Use direct
sentences, active voice, and concrete claims. Remove filler, sales language,
em dashes, and vague statements.

## Reporting security problems

Do not open a public issue for a security problem. Use the repository's
[private vulnerability reporting form](https://github.com/aboveproof/nighty-docs-mcp/security/advisories/new).
