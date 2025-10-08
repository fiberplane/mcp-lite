---
"mcp-lite": minor
---

Add backward compatibility for MCP protocol version 2025-03-26

Implement protocol version negotiation during the initialize handshake. When a client requests an unsupported version, the server negotiates to 2025-03-26 (most compatible). The negotiated version is persisted per session and enforces version-specific transport behavior:

- **2025-06-18**: `MCP-Protocol-Version` header required on non-initialize requests (with sessions); batch requests rejected
- **2025-03-26**: header optional (if present, must match negotiated version); batch requests supported

Server capabilities (`tools`, `prompts`, `resources`) are version-independent. Client capabilities (`elicitation`, `sampling`, `roots`) are negotiated per client.

This enables compatibility with ChatGPT Apps SDK and other clients using protocol version 2025-03-26.

