---
"mcp-lite": minor
---

Add backward compatibility for MCP protocol version 2025-03-26

- Add `SUPPORTED_MCP_PROTOCOL_VERSIONS` object with named version constants (`V2025_03_26`, `V2025_06_18`)
- Implement protocol version negotiation during initialize handshake
- Echo client's requested version if supported, otherwise reject with list of supported versions
- Persist negotiated protocol version per session
- Support version-specific behavior:
  - 2025-06-18: `MCP-Protocol-Version` header required on non-initialize requests (with sessions)
  - 2025-03-26: header optional (if present, must match negotiated version)
  - 2025-06-18: batch requests rejected
  - 2025-03-26: batch requests supported
  - 2025-06-18: includes `elicitation` capability
  - 2025-03-26: `elicitation` capability omitted

This enables compatibility with ChatGPT Apps SDK and other clients using protocol version 2025-03-26.

