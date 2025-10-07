---
"mcp-lite": minor
---

Add comprehensive `_meta` and `title` field support across the MCP protocol implementation:

**Definition metadata** (for registration):
- Tools: Added `title` and `_meta` fields to tool definitions and `Tool` interface
- Prompts: Added `title` and `_meta` fields to prompt definitions, `Prompt`, and `PromptMetadata` interfaces
- Resources: Already supported `_meta` (no changes needed)

**Response metadata** (for results):
- `ToolCallResult`: Added `_meta` field for tool execution responses
- `PromptGetResult`: Added `_meta` field for prompt generation responses
- `ListToolsResult`: Added `_meta` field for tools listing responses
- `ListPromptsResult`: Added `_meta` field for prompts listing responses
- Resource results: Already supported `_meta` (no changes needed)

**Content metadata**:
- All content types already support `_meta` via `MetaAnnotated` interface

These optional fields allow servers to attach arbitrary metadata that clients can use for UI display, filtering, organization, and custom logic. All changes are fully backwards compatible.
