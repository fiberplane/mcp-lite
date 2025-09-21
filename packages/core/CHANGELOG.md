# mcp-lite

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
