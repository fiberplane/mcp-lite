---
"mcp-mcp-mcp": minor
---

This fixes the tool schemas and prompt argument schemas reporting by introducing a new `converter` interface. If the user intends to use Standard Schema for specifying tool inputs, they will need to provide a `converter` that translates that into a json schema.
