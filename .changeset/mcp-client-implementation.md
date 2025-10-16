---
"mcp-lite": minor
---

Add MCP client implementation with session management and bidirectional communication support.

The client provides:
- McpClient class for connecting to MCP servers
- Connection interface for calling tools, prompts, and resources
- ClientSessionAdapter for optional session persistence
- StreamableHttpClientTransport for HTTP/SSE communication
- Handler registration for server-initiated requests (sampling, elicitation)
- Middleware support for request interception
- ToolAdapter interface for SDK integration
- Full TypeScript support with zero runtime dependencies

Includes 29 integration tests validating stateless operations, session management, server-initiated requests, and end-to-end workflows.
