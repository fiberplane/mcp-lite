# mcp-lite

## 0.8.0

### Minor Changes

- faf25a2: Add backward compatibility for MCP protocol version 2025-03-26

  Implement protocol version negotiation during the initialize handshake. When a client requests an unsupported version, the server negotiates to 2025-03-26 (most compatible). The negotiated version is persisted per session and enforces version-specific transport behavior:

  - **2025-06-18**: `MCP-Protocol-Version` header required on non-initialize requests (with sessions); batch requests rejected
  - **2025-03-26**: header optional (if present, must match negotiated version); batch requests supported

  Server capabilities (`tools`, `prompts`, `resources`) are version-independent. Client capabilities (`elicitation`, `sampling`, `roots`) are negotiated per client.

  This enables compatibility with ChatGPT Apps SDK and other clients using protocol version 2025-03-26.

## 0.7.1

### Patch Changes

- a64849f: Adds optional timeout argument paramater to `InMemoryClientRequestAdapter`

## 0.7.0

### Minor Changes

- b236a4a: Add `_meta` and `title` field support for tools, prompts, and responses. These optional fields allow servers to attach arbitrary metadata for UI display, filtering, and custom client logic. Fully backwards compatible.

## 0.6.1

### Patch Changes

- 4d81815: Implements the `ctx.sample` method for requesting llm completions from the mcp client. Adds an example of this in `examples/sampling/`

## 0.6.0

### Minor Changes

- 320849b: Support structured outputs in tool calls.

## 0.5.1

### Patch Changes

- 89d32a7: Fix releases (internal fix)

## 0.5.0

### Minor Changes

- fb90e31: - Add `.group()` method for composing multiple MCP servers into a parent server with flexible namespacing (prefix, suffix, or both). Enables modular server architectures with middleware composition and proper notification handling. Per Anthropic's research, prefix vs suffix namespacing can have measurable effects on tool-use accuracy depending on the LLM.

## 0.4.0

### Minor Changes

- 097977b: Add support for making server-to-client requests and elicitations. This enables the MCP server to request more information over the wire.

## 0.3.0

### Minor Changes

- fdb714c: Breaking change: `eventStore` is replaced by `sessionStore` with a generic `SessionStore` interface that allows for combined MCP session management. Default `InMemorySessionStore` is provided.

## 0.2.3

thank you @jacksteamdev for the quality of life bump!

### Patch Changes

- ebb14bc: Use InferOutput type instead of InferInput in tool handler
- d6c2ea6: Fix ResourceLink type property to match specs
- 5511983: Export tool call return types

## 0.2.2

### Patch Changes

- 32d88c7: Simplify the stream writer, fix a concurrency bug, fix a publishing workflow.

## 0.2.1

### Patch Changes

- f7e7f3a: Add list_changed notifications for tools/resources/prompts.

## 0.2.0

### Minor Changes

- aae00e3: Add SSE streaming, sessions, and progress updates

## 0.1.4

### Patch Changes

- 03ebec9: Add a docstring to the schemaAdapter option for McpServer, to clarify its usage in practice

## 0.1.3

### Patch Changes

- 0bb7557: Fixes issue where callable standard schemas (functions) were not being used for validation - which should resolve issues using ArkType for inputSchemas

## 0.1.2

### Patch Changes

- 47dec3c: This patch renames converter to schema adapter.

## 0.1.1

### Patch Changes

- 5a56391: Fixes type inference in tool definitions

## 0.1.0

### Minor Changes

- 899f375: Initial release of the library. Supports creating an MCP server and registering tools, resources, and prompts
