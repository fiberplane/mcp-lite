# MCP Starter (Bun + Hono)

Minimal MCP server built with mcp-lite, Bun, and Hono.

## Getting Started

```bash
bun install
bun run dev
```

The server will start at `http://localhost:3000/mcp`.

## What's included

- **sum** tool that adds two numbers
- Zod for input validation
- Type-safe handlers with automatic type inference
- Hono for HTTP routing

## Adding tools

```typescript
mcp.tool("myTool", {
  description: "Description of what the tool does",
  inputSchema: z.object({
    param: z.string(),
  }),
  handler: (args) => ({
    content: [{ type: "text", text: `Result: ${args.param}` }],
  }),
});
```
