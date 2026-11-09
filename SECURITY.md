# Security policy

## Supported version

The maintainers accept security fixes for the current `main` branch.

## Reporting a vulnerability

Submit security reports through
[GitHub private vulnerability reporting](https://github.com/aboveproof/nighty-docs-mcp/security/advisories/new).
Include the affected endpoint, reproduction steps, and expected impact.

Do not post credentials, private URLs, or exploit details in a public issue.

## Service boundaries

Nighty Docs MCP reads a public GitHub repository and returns text. It does not
accept credentials, run retrieved code, connect to Discord, or write to GitHub.
