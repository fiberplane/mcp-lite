# create-mcp-lite

An interactive CLI to create MCP (Model Context Protocol) projects with mcp-lite.

## Usage

```bash
npm create mcp-lite@latest [project-name]
```

## Features

- 🚀 Interactive project setup
- 📦 Automatic dependency installation
- 🤖 AI assistant integration (Cursor, Claude Code, VSCode, Windsurf)
- 🔧 Git initialization
- 🎯 Template selection (Bun or Cloudflare Workers)

## Templates

### Bun Template
- Local development with Bun runtime
- Hono for HTTP routing
- Zod for schema validation
- Simple `sum` tool example

### Cloudflare Workers Template
- Edge deployment with Cloudflare Workers
- Hono for HTTP routing
- Zod for schema validation
- Same `sum` tool example
- Ready for `wrangler deploy`

## Flow

1. **Which runtime?** - Choose between Bun or Cloudflare Workers
2. **Target directory?** - Project directory name (default: "my-mcp-server")
3. **Who is your copilot?** - Choose your preferred AI coding assistant
4. **Install dependencies?** - Automatically install project dependencies (always yes)
5. **Initialize git?** - Set up git repository (skipped if already in a git repo)

## Debugging

The CLI includes comprehensive logging to help debug issues. Logs are automatically saved to:

- **macOS**: `~/Library/Logs/create-mcp-lite/`
- **Linux**: `~/.local/state/create-mcp-lite/logs/`
- **Windows**: `%LOCALAPPDATA%\create-mcp-lite\Logs\`

### View Debug Logs

All CLI operations are automatically logged to files for debugging:

```bash
# Check the logs (macOS example)
tail -f ~/Library/Logs/create-mcp-lite/create-mcp-lite-*.log

# Or view the latest log file
ls -t ~/Library/Logs/create-mcp-lite/ | head -1 | xargs -I {} cat ~/Library/Logs/create-mcp-lite/{}
```

### Environment Variables

- `CFP_LOG_DIR=/custom/path` - Override log directory (optional)

**Note**: All debug information is automatically logged to files to avoid interfering with the interactive CLI prompts.

## Development

```bash
# Install dependencies
bun install

# Build the CLI
bun run build

# Test locally (downloads templates from GitHub)
bun run dev

# Test locally with local templates (no GitHub download)
bun run dev:local

# Type check
bun run typecheck

# Lint and format
bun run lint
```

### Environment Variables

- `TEMPLATE_ROOT_PATH` - Path to local templates directory for development (e.g., `../../templates`). When set, templates are copied from the local filesystem instead of being downloaded from GitHub. Used by `dev:local` script.

## License

MIT
