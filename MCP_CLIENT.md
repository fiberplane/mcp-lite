# MCP Client Implementation Plan

## Overview

This document outlines the design and implementation plan for an MCP (Model Context Protocol) client library as part of `mcp-lite`. The client enables host applications (Claude Desktop, VS Code extensions, CLI tools) to connect to MCP servers and use their tools, prompts, and resources with LLM SDKs.

### Key Goals

- Mirror `McpServer` patterns but inverted (send requests instead of handle them)
- Zero runtime dependencies (built on Fetch API)
- Type-safe with full TypeScript support
- Minimal core with opt-in adapters
- Support for multiple concurrent server connections
- Adapters for popular LLM SDKs (Vercel AI, Anthropic, OpenAI, LangChain)

---

## Architecture

### Design Principles (from mcp-lite)

1. **Zero runtime dependencies** - Built on standard Fetch API
2. **Minimal and composable** - Small core with opt-in adapters
3. **Type-safe** - Full TypeScript with Standard Schema support
4. **Transport-agnostic core** - Separate protocol handling from transport
5. **Fetch-first** - Works anywhere Request/Response are available
6. **Fluent API** - Chainable method calls
7. **Adapter pattern** - Opt-in for sessions, handlers, etc.

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                       Host Application                       │
│                  (Claude Desktop, VS Code, CLI)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        McpClient                             │
│  - Handles server-initiated requests (sampling, elicitation)│
│  - Middleware support                                        │
│  - Error handling                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              StreamableHttpClientTransport                   │
│  - HTTP/SSE communication                                    │
│  - Session management (opt-in)                               │
│  - Returns Connection object                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Connection    │
                    │  - callTool()   │
                    │  - getPrompt()  │
                    │  - listTools()  │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Tool Adapters  │
                    │  (MCP → SDK)    │
                    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM SDK Integration                       │
│        (Vercel AI, Anthropic, OpenAI, LangChain)            │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Classes

### 1. McpClient

The main client class handles server-initiated requests and middleware.

```typescript
interface McpClientOptions {
  name: string;
  version: string;
  /**
   * Optional capabilities the client declares
   * - sampling: Client can fulfill server sampling requests
   * - elicitation: Client can fulfill server elicitation requests
   */
  capabilities?: {
    sampling?: Record<string, never>;
    elicitation?: Record<string, never>;
  };
  logger?: Logger;
}

class McpClient {
  constructor(options: McpClientOptions);

  /**
   * Register handler for server sampling requests
   */
  onSample(handler: SampleHandler): this;

  /**
   * Register handler for server elicitation requests
   */
  onElicit(handler: ElicitHandler): this;

  /**
   * Add middleware for incoming server requests
   */
  use(middleware: ClientMiddleware): this;

  /**
   * Custom error handler
   */
  onError(handler: OnError): this;

  /**
   * Internal: dispatch incoming server requests
   * @internal
   */
  _dispatch(message: JsonRpcReq): Promise<JsonRpcRes>;
}
```

**Key similarities to McpServer:**
- Constructor takes `name`, `version`, `capabilities`
- `.use()` for middleware
- `.onError()` for error handling
- `_dispatch()` for handling incoming messages

**Key differences:**
- Registers handlers for server requests (`.onSample()`, `.onElicit()`) instead of tools/prompts
- Sends requests to server via connection, doesn't handle them

### 2. StreamableHttpClientTransport

Handles HTTP/SSE communication with MCP servers.

```typescript
interface StreamableHttpClientTransportOptions {
  /**
   * Optional adapter for session management
   * Stores session state, protocol version, server info
   */
  sessionAdapter?: ClientSessionAdapter;
}

class StreamableHttpClientTransport {
  constructor(options?: StreamableHttpClientTransportOptions);

  /**
   * Bind to a client instance
   * Returns a connection function
   */
  bind(client: McpClient): (baseUrl: string) => Promise<Connection>;

  /**
   * Internal: handle SSE streams
   * @internal
   */
  private handleSessionStream(stream: ReadableStream): void;

  /**
   * Internal: handle request streams
   * @internal
   */
  private handleRequestStream(stream: ReadableStream): void;
}
```

### 3. Connection

The connection object provides methods to interact with an MCP server.

```typescript
interface Connection {
  // Server info from initialization
  serverInfo: { name: string; version: string };
  serverCapabilities: InitializeResult["capabilities"];
  sessionId?: string;

  // Request methods
  callTool(name: string, args?: unknown): Promise<ToolCallResult>;
  getPrompt(name: string, args?: unknown): Promise<PromptGetResult>;
  readResource(uri: string): Promise<ResourceReadResult>;

  // List methods
  listTools(): Promise<ListToolsResult>;
  listPrompts(): Promise<ListPromptsResult>;
  listResources(): Promise<ListResourcesResult>;
  listResourceTemplates(): Promise<ListResourceTemplatesResult>;

  // Notification sender
  sendNotification(method: string, params?: unknown): Promise<void>;

  // Stream management (stateful mode)
  openSessionStream(): Promise<void>;
  closeSessionStream(): void;

  // Close connection
  close(): Promise<void>;
}
```

---

## Handler Context

Context passed to handlers for server-initiated requests.

```typescript
interface MCPClientContext {
  request: JsonRpcReq; // Incoming server request
  requestId: string | number;
  response: JsonRpcRes | null;
  env: Record<string, unknown>;
  state: Record<string, unknown>;

  // Connection info
  connection?: {
    serverInfo: { name: string; version: string };
    protocolVersion: string;
  };
}

type SampleHandler = (
  params: SamplingParams,
  ctx: MCPClientContext
) => Promise<SamplingResult> | SamplingResult;

type ElicitHandler = (
  params: { message: string; requestedSchema: unknown },
  ctx: MCPClientContext
) => Promise<ElicitationResult> | ElicitationResult;

type ClientMiddleware = (
  ctx: MCPClientContext,
  next: () => Promise<void>
) => Promise<void> | void;
```

---

## Adapters

### Session Adapter

Stores client-side session state (opt-in).

```typescript
interface ClientSessionData {
  sessionId: string;
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  serverCapabilities: InitializeResult["capabilities"];
  createdAt: number;
}

interface ClientSessionAdapter {
  create(sessionId: string, data: ClientSessionData): Promise<void>;
  get(sessionId: string): Promise<ClientSessionData | undefined>;
  delete(sessionId: string): Promise<void>;
}

class InMemoryClientSessionAdapter implements ClientSessionAdapter {
  // In-memory implementation
}
```

### Tool Adapters

Convert MCP tools to LLM SDK formats.

```typescript
interface ToolAdapter<TSDKTool = unknown> {
  /**
   * Convert MCP tool definition to SDK-specific format
   * Used when presenting MCP tools to the LLM
   */
  toSDK(mcpTool: McpToolDefinition): TSDKTool;

  /**
   * Convert MCP tool result to SDK-specific result format
   * Used when returning MCP results to the SDK
   */
  resultToSDK(mcpResult: ToolCallResult): unknown;
}
```

**Concrete Implementations:**
- `VercelAIToolAdapter` - For Vercel AI SDK
- `AnthropicAgentToolAdapter` - For Anthropic Agent SDK
- `OpenAIToolAdapter` - For OpenAI SDK
- `LangChainToolAdapter` - For LangChain

---

## Usage Examples

### Example 1: Basic Stateless Client

```typescript
import { McpClient, StreamableHttpClientTransport } from "mcp-lite/client";

const client = new McpClient({
  name: "my-app",
  version: "1.0.0"
});

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(client);

// Connect to server
const connection = await connect("http://localhost:3000/mcp");

// Call tools
const result = await connection.callTool("getWeather", {
  location: "San Francisco"
});

console.log(result.content[0].text);

// Close
await connection.close();
```

### Example 2: Client with Sampling Support

```typescript
const client = new McpClient({
  name: "claude-client",
  version: "1.0.0",
  capabilities: {
    sampling: {}
  }
});

// Register sampling handler
client.onSample(async (params, ctx) => {
  // Show user consent dialog
  const approved = await getUserConsent(params.prompt);
  if (!approved) {
    throw new Error("User denied sampling request");
  }

  // Call your LLM
  const response = await callClaude({
    messages: params.messages,
    maxTokens: params.maxTokens
  });

  return {
    role: "assistant",
    content: {
      type: "text",
      text: response.text
    },
    model: "claude-sonnet-4",
    stopReason: "endTurn"
  };
});

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(client);
const connection = await connect("http://localhost:3000/mcp");

// Server can now request sampling during tool execution
await connection.callTool("complex_task", { query: "..." });
```

### Example 3: Using with Vercel AI SDK

```typescript
import { McpClient, StreamableHttpClientTransport } from "mcp-lite/client";
import { VercelAIToolAdapter } from "mcp-lite/client/adapters";
import { generateText } from "ai";

// Create MCP client
const mcpClient = new McpClient({
  name: "my-app",
  version: "1.0.0"
});

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(mcpClient);

// Connect to MCP server
const mcpConnection = await connect("http://localhost:3000/mcp");

// Get tools from MCP server
const { tools } = await mcpConnection.listTools();

// Create adapter
const adapter = new VercelAIToolAdapter();

// Convert MCP tools to Vercel AI format
const vercelTools: Record<string, CoreTool> = {};
for (const mcpTool of tools) {
  vercelTools[mcpTool.name] = {
    ...adapter.toSDK(mcpTool),
    execute: async (args) => {
      const mcpResult = await mcpConnection.callTool(mcpTool.name, args);
      return adapter.resultToSDK(mcpResult);
    }
  };
}

// Use with Vercel AI SDK
const result = await generateText({
  model: openai("gpt-4"),
  prompt: "What's the weather in San Francisco?",
  tools: vercelTools
});
```

### Example 4: Using with OpenAI SDK

```typescript
import { McpClient, StreamableHttpClientTransport } from "mcp-lite/client";
import { OpenAIToolAdapter } from "mcp-lite/client/adapters";
import OpenAI from "openai";

const mcpClient = new McpClient({
  name: "my-app",
  version: "1.0.0"
});

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(mcpClient);
const mcpConnection = await connect("http://localhost:3000/mcp");

// Get tools from MCP server
const { tools } = await mcpConnection.listTools();

// Convert to OpenAI format
const adapter = new OpenAIToolAdapter();
const openAITools = tools.map((t) => adapter.toSDK(t));

// Use with OpenAI SDK
const openai = new OpenAI();
let messages = [{ role: "user", content: "What's the weather?" }];

while (true) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages,
    tools: openAITools
  });

  const message = completion.choices[0].message;
  messages.push(message);

  if (!message.tool_calls) break;

  // Handle tool calls
  for (const toolCall of message.tool_calls) {
    const mcpResult = await mcpConnection.callTool(
      toolCall.function.name,
      JSON.parse(toolCall.function.arguments)
    );

    const openAIResult = adapter.resultToSDK(mcpResult);

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: openAIResult
    });
  }
}
```

### Example 5: Multiple Server Connections

```typescript
// Client connects to multiple MCP servers
const githubConnection = await connect("http://localhost:3000/github");
const slackConnection = await connect("http://localhost:3001/slack");
const dbConnection = await connect("http://localhost:3002/database");

// Get tools from all servers
const githubTools = (await githubConnection.listTools()).tools;
const slackTools = (await slackConnection.listTools()).tools;
const dbTools = (await dbConnection.listTools()).tools;

// Combine tools for LLM
const allTools = [...githubTools, ...slackTools, ...dbTools];

// Convert to SDK format
const adapter = new VercelAIToolAdapter();
const vercelTools = {};
for (const tool of allTools) {
  // Determine which connection to use based on tool name
  const connection =
    githubTools.includes(tool) ? githubConnection :
    slackTools.includes(tool) ? slackConnection :
    dbConnection;

  vercelTools[tool.name] = {
    ...adapter.toSDK(tool),
    execute: async (args) => {
      const result = await connection.callTool(tool.name, args);
      return adapter.resultToSDK(result);
    }
  };
}

// Use all tools together
const result = await generateText({
  model: openai("gpt-4"),
  prompt: "Get my GitHub repos and post summary to Slack",
  tools: vercelTools
});
```

### Example 6: Client with Middleware

```typescript
const client = new McpClient({
  name: "my-client",
  version: "1.0.0",
  capabilities: {
    sampling: {},
    elicitation: {}
  }
});

// Logging middleware
client.use(async (ctx, next) => {
  console.log("Server request:", ctx.request.method);
  const start = Date.now();
  await next();
  console.log(`Handled in ${Date.now() - start}ms`);
});

// Auth middleware (validate server requests)
client.use(async (ctx, next) => {
  if (ctx.request.method === "sampling/createMessage") {
    // Ensure server is authorized to request sampling
    ctx.state.validated = await validateServerRequest(ctx);
    if (!ctx.state.validated) {
      throw new Error("Unauthorized sampling request");
    }
  }
  await next();
});

// User approval middleware
client.use(async (ctx, next) => {
  if (ctx.request.method === "elicitation/create") {
    // Show user what the server is asking for
    await showUserDialog(ctx.request.params);
  }
  await next();
});
```

---

## Tool Adapter Implementations

### Vercel AI SDK Adapter

```typescript
import type { CoreTool } from "ai";
import { jsonSchema } from "ai";

export class VercelAIToolAdapter implements ToolAdapter<CoreTool> {
  toSDK(mcpTool: McpToolDefinition): CoreTool {
    return {
      description: mcpTool.description,
      parameters: jsonSchema(mcpTool.inputSchema)
    };
  }

  resultToSDK(mcpResult: ToolCallResult): unknown {
    // Prefer structured content
    if (mcpResult.structuredContent) {
      return mcpResult.structuredContent;
    }

    // Extract text from content
    const textContent = mcpResult.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");

    return textContent;
  }
}
```

### OpenAI SDK Adapter

```typescript
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export class OpenAIToolAdapter implements ToolAdapter<ChatCompletionTool> {
  toSDK(mcpTool: McpToolDefinition): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: mcpTool.name,
        description: mcpTool.description,
        parameters: mcpTool.inputSchema as Record<string, unknown>
      }
    };
  }

  resultToSDK(mcpResult: ToolCallResult): string {
    // OpenAI expects string results
    if (mcpResult.structuredContent) {
      return JSON.stringify(mcpResult.structuredContent);
    }

    return mcpResult.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");
  }
}
```

### Anthropic Agent SDK Adapter

```typescript
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

export class AnthropicAgentToolAdapter implements ToolAdapter<SdkMcpToolDefinition> {
  toSDK(mcpTool: McpToolDefinition): SdkMcpToolDefinition {
    // Agent SDK is already MCP-compatible
    return {
      name: mcpTool.name,
      description: mcpTool.description || "",
      inputSchema: mcpTool.inputSchema
    };
  }

  resultToSDK(mcpResult: ToolCallResult): ToolCallResult {
    // Same format!
    return mcpResult;
  }
}
```

### LangChain Adapter

```typescript
import type { StructuredToolInterface } from "@langchain/core/tools";

export class LangChainToolAdapter implements ToolAdapter<StructuredToolInterface> {
  toSDK(mcpTool: McpToolDefinition): StructuredToolInterface {
    return {
      name: mcpTool.name,
      description: mcpTool.description || "",
      schema: mcpTool.inputSchema
    };
  }

  resultToSDK(mcpResult: ToolCallResult): string {
    // LangChain expects string results
    if (mcpResult.structuredContent) {
      return JSON.stringify(mcpResult.structuredContent);
    }

    return mcpResult.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");
  }
}
```

---

## File Structure

```
packages/
  core/
    src/
      client/
        client.ts                     # McpClient class
        transport-http.ts             # StreamableHttpClientTransport
        context.ts                    # MCPClientContext creation
        session-adapter.ts            # ClientSessionAdapter interface + InMemory impl
        connection.ts                 # Connection interface
        types.ts                      # Client-specific types

        adapters/
          index.ts                    # Exports all adapters
          tool-adapter.ts             # ToolAdapter interface
          vercel-ai-adapter.ts        # Vercel AI SDK adapter
          anthropic-agent-adapter.ts  # Anthropic Agent SDK adapter
          openai-adapter.ts           # OpenAI SDK adapter
          langchain-adapter.ts        # LangChain adapter
          utils.ts                    # Helper functions

        index.ts                      # Exports

      index.ts                        # Exports both server and client
```

---

## Implementation Phases

### Phase 1: Core Client (Stateless)
- [ ] `McpClient` class
- [ ] Basic context creation
- [ ] `StreamableHttpClientTransport` (stateless mode)
- [ ] `Connection` object with request methods
- [ ] Protocol version negotiation
- [ ] Basic error handling

**Deliverable**: Basic client that can connect to MCP servers and call tools

### Phase 2: Server Request Handling
- [ ] `onSample()` handler registration
- [ ] `onElicit()` handler registration
- [ ] SSE stream handling for server requests
- [ ] Middleware support
- [ ] Client context for handlers

**Deliverable**: Client that can handle server-initiated requests (sampling, elicitation)

### Phase 3: Session Management
- [ ] `ClientSessionAdapter` interface
- [ ] `InMemoryClientSessionAdapter` implementation
- [ ] Session stream (GET) support
- [ ] Session persistence and reconnection
- [ ] Session lifecycle management

**Deliverable**: Client with stateful session support

### Phase 4: Tool Adapters
- [ ] `ToolAdapter` interface
- [ ] `VercelAIToolAdapter` implementation
- [ ] `OpenAIToolAdapter` implementation
- [ ] `AnthropicAgentToolAdapter` implementation
- [ ] `LangChainToolAdapter` implementation
- [ ] Helper utilities (`createSDKTools()`, etc.)

**Deliverable**: Complete SDK integration adapters

### Phase 5: Polish & Documentation
- [ ] Comprehensive TypeScript types
- [ ] Error messages and logging
- [ ] API documentation
- [ ] Usage examples
- [ ] Integration tests
- [ ] Performance optimization

**Deliverable**: Production-ready client library

---

## Testing Strategy

### Unit Tests
- Protocol message parsing/generation
- Adapter conversions (MCP ↔ SDK formats)
- Session management
- Error handling

### Integration Tests
- Connect to real MCP server
- Call tools/prompts/resources
- Handle server requests (sampling, elicitation)
- Multiple concurrent connections
- Session reconnection

### SDK Integration Tests
- Vercel AI SDK integration
- OpenAI SDK integration
- Anthropic Agent SDK integration
- LangChain integration

---

## API Design Considerations

### Type Safety
- Full TypeScript support
- Generic type parameters for adapters
- Type inference from schemas where possible
- Strict type checking in handlers

### Error Handling
- Custom error types for client errors
- Proper error propagation
- Timeout handling
- Network error recovery

### Performance
- Minimal memory footprint
- Efficient SSE parsing
- Connection pooling (future)
- Request batching (future)

### Developer Experience
- Clear error messages
- Helpful TypeScript hints
- Simple API surface
- Good defaults with opt-in complexity

---

## Future Enhancements

### v1.1
- Connection pooling for multiple servers
- Request batching
- Automatic reconnection with exponential backoff
- Caching layer for tool/prompt/resource lists

### v1.2
- WebSocket transport (if MCP adds support)
- Browser-compatible client (with service worker)
- React hooks for MCP integration
- Streaming tool results

### v1.3
- Tool composition (chain multiple tools)
- Tool routing (distribute across servers)
- Load balancing across server instances
- Advanced middleware patterns

---

## Comparison: Server vs Client

| Feature | McpServer | McpClient |
|---------|-----------|-----------|
| **Purpose** | Handle requests from clients | Send requests to servers |
| **Registers** | `.tool()`, `.prompt()`, `.resource()` | `.onSample()`, `.onElicit()` |
| **Transport** | `StreamableHttpTransport` | `StreamableHttpClientTransport` |
| **Returns** | Handler function | Connection object |
| **Context** | `MCPServerContext` | `MCPClientContext` |
| **Middleware** | ✅ For incoming requests | ✅ For incoming server requests |
| **Sessions** | `SessionAdapter` (server sessions) | `ClientSessionAdapter` (client sessions) |
| **Adapters** | `SchemaAdapter` | `ToolAdapter` (SDK integration) |
| **Stateless Mode** | ✅ Default | ✅ Default |
| **Multiple Instances** | Multiple servers behind one transport | Multiple connections to different servers |

---

## Summary

The MCP client implementation mirrors the server's architecture while inverting responsibilities:

✅ **Same patterns** - Fluent API, middleware, adapters, stateless by default
✅ **Inverted responsibilities** - Sends requests instead of handling them
✅ **SDK integration** - Tool adapters for all major LLM frameworks
✅ **Multiple connections** - Connect to multiple MCP servers simultaneously
✅ **Type-safe** - Full TypeScript with proper inference
✅ **Minimal core** - Zero runtime dependencies, opt-in complexity

The client enables developers to:
1. Connect host applications to MCP servers
2. Use MCP tools with any LLM SDK
3. Handle server requests (sampling, elicitation)
4. Manage multiple server connections
5. Build powerful agentic applications
