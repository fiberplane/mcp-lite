---
"mcp-lite": minor
---

Add tool annotations support per MCP specification 2025-06-18.

Tools can now include optional `annotations` field with behavioral hints and metadata:

- **Behavioral hints**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` - Help clients understand tool behavior and potential side effects
- **Audience targeting**: `audience` array to specify intended users (assistant, user, or both)
- **Priority**: Optional `priority` field (0-1) for relative importance hints
- **Timestamps**: `lastModified` for tracking tool updates
- **Display name**: `title` field as alternative to top-level title

Example usage:

```typescript
server.tool("deleteDatabase", {
  description: "Permanently deletes the database",
  annotations: {
    destructiveHint: true,
    audience: ["user"],
    priority: 0.3,
  },
  handler: async (args) => {
    // implementation
  }
});
```

All annotation fields are optional. Tools without annotations continue to work unchanged (backwards compatible).
