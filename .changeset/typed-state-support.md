---
"mcp-lite": major
---

Add typed state support to McpServer via generic TConfig parameter, enabling type-safe state access in middleware and handlers.

**Breaking change:** The `ctx.env` property has been removed and replaced with `ctx.state`. Migrate by renaming all `ctx.env` references to `ctx.state`.
