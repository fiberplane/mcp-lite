# Groups Composition Example

This example demonstrates how to use the `.group()` method to compose multiple MCP servers into a single unified server.

## Features

- **Namespaced mounting**: Tools and prompts are namespaced with a prefix (e.g., `git/clone`, `fs/read`)
- **Flat mounting**: Mount child servers without a prefix
- **Middleware composition**: Parent and child middlewares execute in order
- **Keep-first semantics**: First registered tool/prompt wins if there are duplicates

## Running the Example

```bash
# Install dependencies
bun install

# Start the server
bun start
```

The MCP server runs on `http://localhost:3000/mcp`, and you can inspect it with:

```bash
bunx @modelcontextprotocol/inspector
```

## How it Works

This example creates three specialized child servers:

1. **Git Server** - Tools for git operations (clone, status)
2. **Filesystem Server** - Tools for file operations (read, write)
3. **Database Server** - Tools for database operations (query)

These are composed into a parent server using `.group()`:

```typescript
const app = new McpServer({ name: "app", version: "1.0.0" })
  .group("git", gitServer)
  .group("fs", fsServer)
  .group(dbServer); // flat mount without prefix

// Tools are now available as:
// - git/clone
// - git/status
// - fs/read
// - fs/write
// - query (flat mounted)
```

## Middleware Composition

The example also demonstrates middleware composition:

- Parent middleware logs all requests
- Git child middleware adds git-specific logging
- Execution order: Parent pre → Child pre → Handler → Child post → Parent post
