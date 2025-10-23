---
"mcp-lite": minor
---

Add typed state support to McpServer via generic TConfig parameter, enabling type-safe state access in middleware and handlers while maintaining backward compatibility with default Record<string, unknown> state type.
