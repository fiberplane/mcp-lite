---
"mcp-lite": minor
---

Multiple improvements to core functionality:

- Added DNS rebinding protection documentation with examples for configuring `allowedHosts` and `allowedOrigins`
- Added warning when binding the same HTTP transport to a server multiple times to prevent issues with stateful servers
- Changed Host/Origin validation failures to return proper JSON-RPC error responses (403 status with structured error)
- Added configurable logger with completely silent default (all levels are no-ops). Like other parts of mcp-lite, logging follows the adapter pattern - you opt-in when you need it. When enabled, logs schema projection warnings for dropped properties, unsupported formats, and non-string enum values.
- Removed automatic PING notification from GET SSE stream (replaced with SSE comment for connection establishment)
