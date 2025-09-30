---
"mcp-lite": minor
---

- Add `.group()` method for composing multiple MCP servers into a parent server with flexible namespacing (prefix, suffix, or both). Enables modular server architectures with middleware composition and proper notification handling. Per Anthropic's research, prefix vs suffix namespacing can have measurable effects on tool-use accuracy depending on the LLM.
