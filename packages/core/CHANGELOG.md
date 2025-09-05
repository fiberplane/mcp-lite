# mcp-mcp-mcp

## 0.2.0

### Minor Changes

- e001d1c: Adds suport for resources from the MCP spec.
- 04d58ae: This fixes the tool schemas and prompt argument schemas reporting by introducing a new `converter` interface. If the user intends to use Standard Schema for specifying tool inputs, they will need to provide a `converter` that translates that into a json schema.

### Patch Changes

- ae27beb: Add support for prompts

## 0.1.2

### Patch Changes

- 341fff3: This fixes notification handling in the JSON-RPC parsing. We'd previously break - no longer. Also refactors the code to make it more readable.

## 0.1.1

### Patch Changes

- 0c7df74: Simplify unnecessary StreamableHTTPTransport configuration and add a README guide

## 0.1.0

### Minor Changes

- 431ddd9: Initial version of the mcp package
