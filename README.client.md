# MCP Client

A lightweight client for connecting to and interacting with Model Context Protocol (MCP) servers.

The `mcp-lite` client provides a simple, type-safe API for calling tools, prompts, and resources on MCP servers, with support for server-initiated requests like elicitation and sampling.

## Quick Start

```bash
npm install mcp-lite
```

Connect to an MCP server and call a tool:

```typescript
import { McpClient, StreamableHttpClientTransport } from "mcp-lite";

// Create client instance
const client = new McpClient({
  name: "my-client",
  version: "1.0.0"
});

// Connect to server
const transport = new StreamableHttpClientTransport();
const connect = transport.bind(client);
const connection = await connect("http://localhost:3000/mcp");

// Discover available tools
const { tools } = await connection.listTools();
console.log(`Found ${tools.length} tools:`, tools.map(t => t.name));

// Call a tool
const result = await connection.callTool("echo", { 
  message: "Hello!" 
});

console.log(result.content[0].text);
```

## Features

- **Simple API** - Connect to MCP servers and call tools, prompts, and resources
- **Type-safe** - Full TypeScript support with inferred types
- **Stateless or Stateful** - Start without sessions, add them when you need server-initiated requests
- **Multi-server** - Connect to multiple servers simultaneously
- **Server Requests** - Handle elicitation and sampling requests from servers
- **SSE Streaming** - Receive server notifications and progress updates via Server-Sent Events
- **Error Handling** - Clear error messages with RpcError support

## Client Setup

### Basic Client

Create a client with minimal configuration:

```typescript
import { McpClient } from "mcp-lite";

const client = new McpClient({
  name: "my-app",
  version: "1.0.0"
});
```

### Client with Capabilities

Advertise support for elicitation and sampling:

```typescript
const client = new McpClient({
  name: "my-app",
  version: "1.0.0",
  capabilities: {
    elicitation: {},  // Support elicitation requests from server
    sampling: {}      // Support sampling requests from server
  }
});
```

### Client with Custom Logger

Provide your own logger for debugging:

```typescript
const client = new McpClient({
  name: "my-app",
  version: "1.0.0",
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
  }
});
```

## Connecting to Servers

### Stateless Connection

Connect without sessions for simple request/response:

```typescript
import { StreamableHttpClientTransport } from "mcp-lite";

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(client);

const connection = await connect("http://localhost:3000/mcp");

// Server information is available on the connection
console.log(connection.serverInfo.name);    // "my-server"
console.log(connection.serverInfo.version); // "1.0.0"
console.log(connection.serverCapabilities); // { tools: {...}, prompts: {...} }
```

### Session-Based Connection

Enable sessions for SSE streaming and server-initiated requests:

```typescript
import { 
  StreamableHttpClientTransport,
  InMemoryClientSessionAdapter
} from "mcp-lite";

const transport = new StreamableHttpClientTransport({
  sessionAdapter: new InMemoryClientSessionAdapter()
});

const connect = transport.bind(client);
const connection = await connect("http://localhost:3000/mcp");

// Session ID is available when using session adapter
console.log(connection.sessionId); // "abc123..."

// Open SSE stream to receive server notifications
const stream = await connection.openSessionStream();
```

### Multiple Server Connections

A single client can connect to multiple servers:

```typescript
const client = new McpClient({
  name: "multi-client",
  version: "1.0.0"
});

const transport = new StreamableHttpClientTransport();
const connect = transport.bind(client);

// Connect to multiple servers
const githubConn = await connect("http://localhost:3000/github");
const slackConn = await connect("http://localhost:3001/slack");
const dbConn = await connect("http://localhost:3002/db");

// Each connection is independent
const repos = await githubConn.callTool("listRepos", {});
const message = await slackConn.callTool("postMessage", {
  channel: "#dev",
  text: "New issue created"
});
const records = await dbConn.callTool("query", {
  sql: "SELECT * FROM users"
});
```

## Calling Tools

### Basic Tool Call

Call a tool with arguments:

```typescript
const result = await connection.callTool("echo", {
  message: "Hello World"
});

console.log(result.content[0].text); // "Hello World"
```

### Tool Call with Structured Output

Access both human-readable and structured content:

```typescript
const result = await connection.callTool("getWeather", {
  location: "San Francisco"
});

// Human-readable content
console.log(result.content[0].text); 
// "Weather in San Francisco: 22°C, sunny"

// Structured content (if provided by server)
if (result.structuredContent) {
  console.log(result.structuredContent.temperature); // 22
  console.log(result.structuredContent.conditions); // "sunny"
}
```

### Listing Available Tools

Discover what tools are available:

```typescript
const { tools } = await connection.listTools();

for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
  console.log(`Input schema:`, tool.inputSchema);
  console.log(`Output schema:`, tool.outputSchema);
}
```

### Concurrent Tool Calls

Execute multiple tools in parallel:

```typescript
const results = await Promise.all([
  connection.callTool("echo", { message: "First" }),
  connection.callTool("echo", { message: "Second" }),
  connection.callTool("add", { a: 1, b: 2 })
]);

console.log(results[0].content[0].text); // "First"
console.log(results[1].content[0].text); // "Second"
console.log(results[2].content[0].text); // "3"
```

## Working with Prompts

### List Prompts

Get all available prompts from the server:

```typescript
const { prompts } = await connection.listPrompts();

for (const prompt of prompts) {
  console.log(`${prompt.name}: ${prompt.description}`);
  console.log(`Arguments:`, prompt.arguments);
}
```

### Get a Prompt

Retrieve a prompt with arguments:

```typescript
const result = await connection.getPrompt("summarize", {
  text: "Long article text...",
  length: "short"
});

// Prompt returns messages for LLM
for (const message of result.messages) {
  console.log(`${message.role}:`, message.content.text);
}
```

### Basic Prompt (No Arguments)

```typescript
const result = await connection.getPrompt("greet");

console.log(result.messages[0].content.text);
// "Hello, how are you?"
```

## Working with Resources

### List Resources

Get all available resources:

```typescript
const { resources } = await connection.listResources();

for (const resource of resources) {
  console.log(`${resource.uri}: ${resource.description}`);
  console.log(`MIME type:`, resource.mimeType);
}
```

### Read a Resource

Fetch resource contents:

```typescript
const result = await connection.readResource("file://config.json");

for (const content of result.contents) {
  console.log(`URI: ${content.uri}`);
  console.log(`Type: ${content.type}`);
  console.log(`Content: ${content.text}`);
  console.log(`MIME: ${content.mimeType}`);
}
```

### List Resource Templates

Discover templated resources:

```typescript
const { resourceTemplates } = await connection.listResourceTemplates();

for (const template of resourceTemplates) {
  console.log(`Template: ${template.uriTemplate}`);
  console.log(`Description: ${template.description}`);
}

// Use a template with parameters
const result = await connection.readResource(
  "github://repos/owner/repo"
);
```

## Server-Initiated Requests

When using session-based connections, servers can send requests to the client for elicitation (user prompts) and sampling (LLM completions).

### Handling Elicitation

Register a handler for elicitation requests:

```typescript
const client = new McpClient({
  name: "my-client",
  version: "1.0.0",
  capabilities: { elicitation: {} }
});

// Register elicitation handler
client.onElicit(async (params, connection) => {
  // params.message: "What is your name?"
  // params.requestedSchema: { type: "object", properties: {...} }
  
  // Prompt user and return response
  const userInput = await promptUser(params.message);
  
  return {
    action: "accept",
    content: { name: userInput }
  };
});

// Connect with session support
const transport = new StreamableHttpClientTransport({
  sessionAdapter: new InMemoryClientSessionAdapter()
});
const connect = transport.bind(client);
const connection = await connect(serverUrl);

// Open SSE stream to receive elicitation requests
await connection.openSessionStream();

// Call a tool that triggers elicitation
const result = await connection.callTool("getUserInfo", {});
// Server will send elicitation request, handler will be called
```

### Elicitation Response Actions

The handler can return different actions:

```typescript
// Accept with data
client.onElicit(async (params) => {
  return {
    action: "accept",
    content: { confirmed: true }
  };
});

// Decline (user says no)
client.onElicit(async (params) => {
  return { action: "decline" };
});

// Cancel (user aborts)
client.onElicit(async (params) => {
  return { action: "cancel" };
});
```

### Multiple Elicitations

A single tool call can trigger multiple sequential elicitations:

```typescript
client.onElicit(async (params) => {
  if (params.message.includes("name")) {
    return { action: "accept", content: { name: "Alice" } };
  } else if (params.message.includes("age")) {
    return { action: "accept", content: { age: 30 } };
  }
  return { action: "decline" };
});

// Server tool might ask for name, then age
const result = await connection.callTool("getUserInfo", {});
// Elicitation handler called twice in sequence
```

### Handling Sampling

Register a handler for sampling requests (LLM completions):

```typescript
const client = new McpClient({
  name: "my-client",
  version: "1.0.0",
  capabilities: { sampling: {} }
});

// Register sampling handler
client.onSample(async (params, connection) => {
  // params.messages: Array of messages for LLM
  // params.modelPreferences: { hints, costPriority, speedPriority, ... }
  // params.systemPrompt: Optional system prompt
  // params.maxTokens: Maximum tokens to generate
  
  // Call your LLM
  const response = await callLLM({
    messages: params.messages,
    systemPrompt: params.systemPrompt,
    maxTokens: params.maxTokens
  });
  
  return {
    role: "assistant",
    content: {
      type: "text",
      text: response.text
    },
    model: "gpt-4",
    stopReason: "endTurn"
  };
});
```

### Connection Info in Handlers

Handlers receive connection info as the second parameter:

```typescript
client.onSample(async (params, connectionInfo) => {
  console.log(`Server: ${connectionInfo?.serverInfo.name}`);
  console.log(`Protocol: ${connectionInfo?.protocolVersion}`);
  
  // Use connection info to route to appropriate LLM
  const llmEndpoint = getLLMEndpoint(connectionInfo?.serverInfo.name);
  
  return {
    role: "assistant",
    content: { type: "text", text: "..." },
    model: "gpt-4",
    stopReason: "endTurn"
  };
});
```

## Session Management

### Opening Session Streams

Open an SSE stream to receive server events:

```typescript
const stream = await connection.openSessionStream();

// Read events manually if needed
const reader = stream.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  console.log("SSE event:", text);
}
```

### Progress Notifications

Receive progress updates during long-running operations:

```typescript
async function readStreamWithProgress(stream: ReadableStream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const progressEvents = [];
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (data.method === "notifications/progress") {
          progressEvents.push(data.params);
          console.log(`Progress: ${data.params.progress}/${data.params.total}`);
          console.log(`Message: ${data.params.message}`);
        }
      }
    }
  }
  
  return progressEvents;
}

// Open stream and read in background
const stream = await connection.openSessionStream();
const progressPromise = readStreamWithProgress(stream);

// Execute long-running tool
const result = await connection.callTool("processLargeFile", {
  filename: "data.csv"
});

// Get all progress events
const progressEvents = await progressPromise;
console.log(`Received ${progressEvents.length} progress updates`);
```

### Event Replay

Resume from a specific event ID after reconnection:

```typescript
// First connection
const stream = await connection.openSessionStream();
// ... connection drops ...

// Reconnect with last event ID
const resumedStream = await connection.openSessionStream("event-id-123");
// Server replays events from that point
```

### Closing Sessions

Close the connection and optionally delete the session:

```typescript
// Close stream only (session persists on server)
connection.closeSessionStream();

// Close connection without deleting session
await connection.close(false);

// Close connection and delete session from server
await connection.close(true);
```

## Ping

Send a ping to verify the connection:

```typescript
try {
  await connection.ping();
  console.log("Server is alive");
} catch (error) {
  console.log("Server is not responding");
}
```

## OAuth Authentication

MCP clients can connect to OAuth 2.1-protected MCP servers using the built-in OAuth support. The client handles PKCE (Proof Key for Code Exchange), token storage, automatic token refresh, and multiple server authentication.

### Basic OAuth Setup

Connect to an OAuth-protected MCP server:

```typescript
import {
  McpClient,
  StreamableHttpClientTransport,
  InMemoryOAuthAdapter,
  StandardOAuthProvider
} from "mcp-lite";

// Create OAuth adapter for token storage
const oauthAdapter = new InMemoryOAuthAdapter();

// Create OAuth provider for handling OAuth flows
const oauthProvider = new StandardOAuthProvider();

// Configure OAuth settings
const oauthConfig = {
  clientId: "your-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthorizationRequired: (authorizationUrl) => {
    // Redirect user to authorization URL
    console.log("Please authorize at:", authorizationUrl);
    // In a web app: window.location.href = authorizationUrl;
    // In a CLI app: open(authorizationUrl);
  }
};

// Create client with OAuth support
const client = new McpClient({
  name: "oauth-client",
  version: "1.0.0"
});

const transport = new StreamableHttpClientTransport({
  oauthAdapter,
  oauthProvider,
  oauthConfig
});

const connect = transport.bind(client);

try {
  // First connection attempt may fail with 401
  const connection = await connect("https://api.example.com/mcp");
} catch (error) {
  // If authentication required, user is redirected to OAuth server
  console.log(error.message); // "Authentication required. Authorization flow started..."
}
```

### Completing Authorization Flow

After the user authorizes and is redirected back to your redirect URI:

```typescript
// Parse authorization code and state from callback URL
// Example: http://localhost:3000/callback?code=abc123&state=xyz789
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");
const state = urlParams.get("state");

// Complete the authorization flow
await transport.completeAuthorizationFlow(
  "https://api.example.com/mcp",
  code,
  state
);

// Now connect successfully with stored token
const connection = await connect("https://api.example.com/mcp");
console.log("Connected:", connection.serverInfo.name);
```

### Persistent Token Storage

The `InMemoryOAuthAdapter` stores tokens in memory, which are lost when the process exits. For production use, implement a persistent adapter:

```typescript
import { OAuthAdapter, OAuthTokens } from "mcp-lite";
import fs from "fs/promises";

class FileOAuthAdapter implements OAuthAdapter {
  constructor(private tokenFile: string) {}

  async storeTokens(resource: string, tokens: OAuthTokens): Promise<void> {
    const allTokens = await this.loadAllTokens();
    allTokens[resource] = tokens;
    await fs.writeFile(this.tokenFile, JSON.stringify(allTokens, null, 2));
  }

  async getTokens(resource: string): Promise<OAuthTokens | undefined> {
    const allTokens = await this.loadAllTokens();
    return allTokens[resource];
  }

  async deleteTokens(resource: string): Promise<void> {
    const allTokens = await this.loadAllTokens();
    delete allTokens[resource];
    await fs.writeFile(this.tokenFile, JSON.stringify(allTokens, null, 2));
  }

  async hasValidToken(resource: string): Promise<boolean> {
    const tokens = await this.getTokens(resource);
    if (!tokens) return false;

    const now = Math.floor(Date.now() / 1000);
    const BUFFER_SECONDS = 5 * 60; // 5 minute buffer
    return tokens.expiresAt > now + BUFFER_SECONDS;
  }

  private async loadAllTokens(): Promise<Record<string, OAuthTokens>> {
    try {
      const data = await fs.readFile(this.tokenFile, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}

// Use file-based storage
const oauthAdapter = new FileOAuthAdapter("./oauth-tokens.json");
```

### Database Token Storage

For multi-user applications, store tokens in a database:

```typescript
import { OAuthAdapter, OAuthTokens } from "mcp-lite";

class PostgresOAuthAdapter implements OAuthAdapter {
  constructor(
    private db: DatabaseConnection,
    private userId: string
  ) {}

  async storeTokens(resource: string, tokens: OAuthTokens): Promise<void> {
    await this.db.query(
      `INSERT INTO oauth_tokens (user_id, resource, tokens, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, resource)
       DO UPDATE SET tokens = $3, expires_at = $4`,
      [this.userId, resource, JSON.stringify(tokens), tokens.expiresAt]
    );
  }

  async getTokens(resource: string): Promise<OAuthTokens | undefined> {
    const result = await this.db.query(
      `SELECT tokens FROM oauth_tokens
       WHERE user_id = $1 AND resource = $2`,
      [this.userId, resource]
    );
    return result.rows[0]?.tokens;
  }

  async deleteTokens(resource: string): Promise<void> {
    await this.db.query(
      `DELETE FROM oauth_tokens
       WHERE user_id = $1 AND resource = $2`,
      [this.userId, resource]
    );
  }

  async hasValidToken(resource: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT expires_at FROM oauth_tokens
       WHERE user_id = $1 AND resource = $2`,
      [this.userId, resource]
    );

    if (!result.rows[0]) return false;

    const now = Math.floor(Date.now() / 1000);
    const BUFFER_SECONDS = 5 * 60;
    return result.rows[0].expires_at > now + BUFFER_SECONDS;
  }
}

// Use database storage
const oauthAdapter = new PostgresOAuthAdapter(db, currentUserId);
```

### Automatic Token Refresh

Tokens are automatically refreshed when they expire:

```typescript
const transport = new StreamableHttpClientTransport({
  oauthAdapter,
  oauthProvider,
  oauthConfig
});

const connect = transport.bind(client);

// First connection (uses existing token)
const connection1 = await connect("https://api.example.com/mcp");
await connection1.callTool("echo", { message: "Hello" });

// Wait for token to expire...
// (Tokens are checked with 5-minute buffer before expiry)

// Next connection automatically refreshes the token
const connection2 = await connect("https://api.example.com/mcp");
await connection2.callTool("echo", { message: "Still works!" });
```

### Multiple OAuth Providers

Connect to multiple OAuth-protected servers:

```typescript
// Each server can have its own tokens
const adapter = new InMemoryOAuthAdapter();
const provider = new StandardOAuthProvider();

const config = {
  clientId: "my-client-id",
  redirectUri: "http://localhost:3000/callback",
  onAuthorizationRequired: (url) => console.log("Authorize:", url)
};

const transport = new StreamableHttpClientTransport({
  oauthAdapter: adapter,
  oauthProvider: provider,
  oauthConfig: config
});

const connect = transport.bind(client);

// Connect to multiple servers with different OAuth tokens
const github = await connect("https://github-mcp.example.com");
const slack = await connect("https://slack-mcp.example.com");
const gdrive = await connect("https://drive-mcp.example.com");

// Each connection uses its own OAuth token
await github.callTool("listRepos", {});
await slack.callTool("postMessage", { channel: "#dev", text: "Hi" });
await gdrive.callTool("listFiles", {});
```

### OAuth Discovery

MCP servers advertise their OAuth endpoints using RFC 8707 (Resource Indicators) and RFC 8414 (Authorization Server Metadata):

```typescript
import { discoverOAuthEndpoints } from "mcp-lite";

const endpoints = await discoverOAuthEndpoints("https://api.example.com/mcp");

console.log(endpoints.authorizationServer);   // OAuth server URL
console.log(endpoints.authorizationEndpoint); // Where to send users
console.log(endpoints.tokenEndpoint);         // Where to exchange codes
console.log(endpoints.scopes);                // Required scopes
```

The discovery process:
1. Fetches `/.well-known/oauth-protected-resource` from MCP server
2. Extracts authorization server URL
3. Fetches authorization server metadata
4. Verifies PKCE S256 support (required for OAuth 2.1)
5. Returns endpoint information

### Error Handling

Handle OAuth-specific errors:

```typescript
try {
  const connection = await connect("https://api.example.com/mcp");
} catch (error) {
  if (error.message.includes("Authentication required")) {
    // User needs to authorize - wait for callback
    console.log("Waiting for user authorization...");
  } else {
    console.error("Connection failed:", error);
  }
}

// After callback
try {
  await transport.completeAuthorizationFlow(serverUrl, code, state);
} catch (error) {
  if (error.message.includes("State parameter mismatch")) {
    // Possible CSRF attack
    console.error("Security error: invalid state parameter");
  } else if (error.message.includes("Token exchange failed")) {
    // OAuth server rejected the code
    console.error("Authorization failed:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Security Best Practices

1. **Always use HTTPS** - OAuth flows must use HTTPS in production
2. **PKCE is mandatory** - The client automatically uses PKCE S256 method
3. **State validation** - State parameters are automatically validated to prevent CSRF
4. **Secure token storage** - Use encrypted storage for production token adapters
5. **Token expiry buffer** - Tokens are refreshed 5 minutes before expiry to prevent race conditions
6. **Resource parameter** - RFC 8707 resource parameter is included in all OAuth requests

### OAuth Configuration Summary

Required configuration for OAuth:

```typescript
interface OAuthConfig {
  clientId: string;                           // Your OAuth client ID
  redirectUri: string;                        // Callback URL for authorization
  onAuthorizationRequired: (url: string) => void;  // Redirect handler
}

interface OAuthAdapter {
  storeTokens(resource: string, tokens: OAuthTokens): Promise<void> | void;
  getTokens(resource: string): Promise<OAuthTokens | undefined> | OAuthTokens | undefined;
  deleteTokens(resource: string): Promise<void> | void;
  hasValidToken(resource: string): Promise<boolean> | boolean;
}
```

Built-in adapters:
- `InMemoryOAuthAdapter` - In-memory storage (for testing)
- Implement `OAuthAdapter` for custom storage (files, database, etc.)

Built-in providers:
- `StandardOAuthProvider` - OAuth 2.1 with PKCE S256
- Implement `OAuthProvider` for custom OAuth flows

## Error Handling

### RpcError

All JSON-RPC errors are thrown as `RpcError` instances:

```typescript
import { RpcError } from "mcp-lite";

try {
  await connection.callTool("nonexistent", {});
} catch (error) {
  if (error instanceof RpcError) {
    console.log(`Code: ${error.code}`);
    console.log(`Message: ${error.message}`);
    console.log(`Data:`, error.data);
  }
}
```

### HTTP Errors

Network and HTTP errors are thrown as standard `Error` instances:

```typescript
try {
  const connection = await connect("http://invalid:9999");
} catch (error) {
  console.error("Connection failed:", error.message);
}
```

### Tool Call Errors

Handle errors from tool execution:

```typescript
try {
  const result = await connection.callTool("divide", {
    a: 10,
    b: 0
  });
} catch (error) {
  if (error instanceof RpcError) {
    // Server returned an error (e.g., division by zero)
    console.error("Tool error:", error.message);
  } else {
    // Network or other error
    console.error("Request failed:", error);
  }
}
```

### Retry Pattern

Implement retry logic for transient failures:

```typescript
async function callWithRetry(
  connection: Connection,
  toolName: string,
  args: unknown,
  maxRetries = 3
) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connection.callTool(toolName, args);
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// Usage
const result = await callWithRetry(connection, "flaky-tool", {});
```

## Advanced Patterns

### Tool Discovery Pattern

Always discover available tools before calling them:

```typescript
async function callToolSafely(
  connection: Connection,
  toolName: string,
  args: unknown
) {
  // First, check if tool exists
  const { tools } = await connection.listTools();
  const tool = tools.find(t => t.name === toolName);
  
  if (!tool) {
    throw new Error(`Tool '${toolName}' not found. Available: ${tools.map(t => t.name).join(", ")}`);
  }
  
  // Validate args against schema if needed
  console.log(`Calling ${toolName} with schema:`, tool.inputSchema);
  
  // Call the tool
  return await connection.callTool(toolName, args);
}

// Usage
const result = await callToolSafely(connection, "calculate", { a: 5, b: 3 });
```

### Tool Adapter Pattern

Adapt MCP tools to other SDK formats:

```typescript
class SDKAdapter {
  private toolsCache?: any[];
  
  constructor(private connection: Connection) {}
  
  // Convert MCP tool to SDK tool format
  async getTools() {
    if (this.toolsCache) {
      return this.toolsCache;
    }
    
    const { tools } = await this.connection.listTools();
    
    this.toolsCache = tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
    
    return this.toolsCache;
  }
  
  // Execute tool and convert result
  async execute(toolName: string, args: unknown) {
    const result = await this.connection.callTool(toolName, args);
    
    // Return structured content if available, otherwise text
    if (result.structuredContent) {
      return result.structuredContent;
    }
    
    return result.content[0]?.text;
  }
}

// Usage
const adapter = new SDKAdapter(connection);
const sdkTools = await adapter.getTools();
const result = await adapter.execute("calculate", { a: 5, b: 3 });
```

### Connection Pool with Persistence

Manage multiple connections efficiently with persistence and auto-reconnect:

```typescript
interface ConnectionMetadata {
  name: string;
  url: string;
  sessionId?: string;
  serverInfo?: { name: string; version: string };
  lastPing?: number;
}

class PersistentConnectionPool {
  private connections = new Map<string, Connection>();
  private metadata = new Map<string, ConnectionMetadata>();
  private transport: StreamableHttpClientTransport;
  
  constructor(
    private client: McpClient,
    private persistencePath?: string
  ) {
    this.transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter()
    });
  }
  
  /**
   * Connect to a server, or return existing connection
   */
  async connect(name: string, url: string): Promise<Connection> {
    // Return cached connection if healthy
    const existing = this.connections.get(name);
    if (existing && await this.isHealthy(existing)) {
      return existing;
    }
    
    // Remove stale connection
    if (existing) {
      await this.disconnect(name);
    }
    
    // Create new connection
    const connect = this.transport.bind(this.client);
    const connection = await connect(url);
    
    this.connections.set(name, connection);
    this.metadata.set(name, {
      name,
      url,
      sessionId: connection.sessionId,
      serverInfo: connection.serverInfo,
      lastPing: Date.now()
    });
    
    await this.saveMetadata();
    
    return connection;
  }
  
  /**
   * Get existing connection without creating new one
   */
  get(name: string): Connection | undefined {
    return this.connections.get(name);
  }
  
  /**
   * Check if connection is healthy
   */
  async isHealthy(connection: Connection): Promise<boolean> {
    try {
      await connection.ping();
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Disconnect and remove a specific connection
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      await connection.close(true);
      this.connections.delete(name);
      this.metadata.delete(name);
      await this.saveMetadata();
    }
  }
  
  /**
   * Reconnect to a server using saved metadata
   */
  async reconnect(name: string): Promise<Connection> {
    const meta = this.metadata.get(name);
    if (!meta) {
      throw new Error(`No metadata found for connection: ${name}`);
    }
    
    return await this.connect(name, meta.url);
  }
  
  /**
   * Save connection metadata for restoration
   */
  private async saveMetadata(): Promise<void> {
    if (!this.persistencePath) return;
    
    const data = Array.from(this.metadata.entries()).map(([name, meta]) => ({
      name,
      url: meta.url,
      sessionId: meta.sessionId,
      serverInfo: meta.serverInfo
    }));
    
    // Save to file, localStorage, or database
    // Example: await fs.writeFile(this.persistencePath, JSON.stringify(data));
  }
  
  /**
   * Restore connections from saved metadata
   */
  async restore(): Promise<void> {
    if (!this.persistencePath) return;
    
    // Load from file, localStorage, or database
    // Example: const data = JSON.parse(await fs.readFile(this.persistencePath));
    const data: ConnectionMetadata[] = []; // Load your data here
    
    for (const meta of data) {
      this.metadata.set(meta.name, meta);
      // Optionally reconnect immediately
      // await this.reconnect(meta.name);
    }
  }
  
  /**
   * List all connection metadata
   */
  list(): ConnectionMetadata[] {
    return Array.from(this.metadata.values());
  }
  
  /**
   * Close all connections
   */
  async closeAll(deleteRemoteSessions = false): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(conn => 
        conn.close(deleteRemoteSessions)
      )
    );
    this.connections.clear();
    
    if (deleteRemoteSessions) {
      this.metadata.clear();
      await this.saveMetadata();
    }
  }
  
  /**
   * Health check all connections
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, connection] of this.connections.entries()) {
      const healthy = await this.isHealthy(connection);
      results.set(name, healthy);
      
      if (healthy) {
        const meta = this.metadata.get(name);
        if (meta) {
          meta.lastPing = Date.now();
        }
      }
    }
    
    await this.saveMetadata();
    return results;
  }
}

// Usage
const pool = new PersistentConnectionPool(client, "./connections.json");

// Restore previous connections
await pool.restore();

// Connect to servers
const github = await pool.connect("github", "http://localhost:3000");
const slack = await pool.connect("slack", "http://localhost:3001");

// List available tools from each server
const githubTools = await github.listTools();
console.log("GitHub tools:", githubTools.tools.map(t => t.name));

// Use connections
await github.callTool("listRepos", {});
await slack.callTool("postMessage", { channel: "#dev", text: "test" });

// Health check
const health = await pool.healthCheck();
console.log("Connection health:", Object.fromEntries(health));

// Reconnect if needed
if (!health.get("github")) {
  await pool.reconnect("github");
}

// List all connections
console.log("Active connections:", pool.list());

// Clean up (keeps metadata for future restore)
await pool.closeAll(false);
```

### Workflow Orchestration

Coordinate operations across multiple servers:

```typescript
async function createAndNotifyIssue(
  githubConn: Connection,
  slackConn: Connection,
  dbConn: Connection
) {
  // First, verify all required tools are available
  const [githubTools, slackTools, dbTools] = await Promise.all([
    githubConn.listTools(),
    slackConn.listTools(),
    dbConn.listTools()
  ]);
  
  const hasRequired = 
    githubTools.tools.some(t => t.name === "createIssue") &&
    slackTools.tools.some(t => t.name === "postMessage") &&
    dbTools.tools.some(t => t.name === "insert");
  
  if (!hasRequired) {
    throw new Error("Required tools not available");
  }
  
  // Create issue
  const issue = await githubConn.callTool("createIssue", {
    repo: "my-repo",
    title: "Bug found",
    body: "Critical bug"
  });
  
  // Log and notify in parallel
  await Promise.all([
    // Log to database
    dbConn.callTool("insert", {
      table: "issues",
      data: {
        source: "github",
        id: issue.structuredContent?.id,
        title: "Bug found"
      }
    }),
    
    // Notify team
    slackConn.callTool("postMessage", {
      channel: "#dev",
      text: `New issue created: ${issue.structuredContent?.url}`
    })
  ]);
  
  return issue;
}
```

## TypeScript Types

### Connection Types

```typescript
import type {
  Connection,
  ToolCallResult,
  ListToolsResult,
  ListPromptsResult,
  PromptGetResult,
  ListResourcesResult,
  ResourceReadResult
} from "mcp-lite";

const connection: Connection = await connect(url);

const toolResult: ToolCallResult = await connection.callTool("echo", {});
const tools: ListToolsResult = await connection.listTools();
const prompts: ListPromptsResult = await connection.listPrompts();
const prompt: PromptGetResult = await connection.getPrompt("greet");
const resources: ListResourcesResult = await connection.listResources();
const resource: ResourceReadResult = await connection.readResource("file://test");
```

### Handler Types

```typescript
import type {
  SampleHandler,
  ElicitHandler,
  SamplingParams,
  SamplingResult,
  ElicitationParams,
  ElicitationResult,
  ClientConnectionInfo
} from "mcp-lite";

const sampleHandler: SampleHandler = async (
  params: SamplingParams,
  connection?: ClientConnectionInfo
): Promise<SamplingResult> => {
  return {
    role: "assistant",
    content: { type: "text", text: "..." },
    model: "gpt-4",
    stopReason: "endTurn"
  };
};

const elicitHandler: ElicitHandler = async (
  params: ElicitationParams,
  connection?: ClientConnectionInfo
): Promise<ElicitationResult> => {
  return {
    action: "accept",
    content: { answer: "..." }
  };
};

client.onSample(sampleHandler);
client.onElicit(elicitHandler);
```

### Client Capabilities Types

```typescript
import type { ClientCapabilities } from "mcp-lite";

const capabilities: ClientCapabilities = {
  elicitation: {},
  sampling: {},
  roots: {},
  // Custom capabilities
  customFeature: { enabled: true }
};

const client = new McpClient({
  name: "my-client",
  version: "1.0.0",
  capabilities
});
```

## Examples

The `packages/core/tests/integration/` directory contains comprehensive examples:

- **`client-stateless.test.ts`** - Basic stateless operations (tools, prompts, resources)
- **`client-server-requests.test.ts`** - Elicitation and sampling handlers
- **`client-e2e-full.test.ts`** - Multi-server workflows, progress notifications, error recovery

## Best Practices

### 1. Connection Lifecycle

```typescript
// Good: Reuse connection for multiple requests
const connection = await connect(serverUrl);
await connection.callTool("tool1", {});
await connection.callTool("tool2", {});
await connection.close(true);

// Bad: Creating new connection for each request
await (await connect(serverUrl)).callTool("tool1", {});
await (await connect(serverUrl)).callTool("tool2", {}); // Wasteful
```

### 2. Error Handling

```typescript
// Good: Handle specific error types
try {
  await connection.callTool("tool", {});
} catch (error) {
  if (error instanceof RpcError && error.code === -32601) {
    console.error("Tool not found");
  } else {
    console.error("Other error:", error);
  }
}

// Bad: Generic catch
try {
  await connection.callTool("tool", {});
} catch (error) {
  console.error("Error:", error); // Too broad
}
```

### 3. Session Management

```typescript
// Good: Open stream once, reuse for multiple operations
const stream = await connection.openSessionStream();
// ... multiple tool calls that may send notifications ...
await connection.close(true);

// Bad: Opening/closing stream repeatedly
await connection.openSessionStream();
await connection.closeSessionStream();
await connection.openSessionStream(); // Inefficient
```

### 4. Concurrent Operations

```typescript
// Good: Parallel execution when possible
const [tools, prompts, resources] = await Promise.all([
  connection.listTools(),
  connection.listPrompts(),
  connection.listResources()
]);

// Bad: Sequential execution when not needed
const tools = await connection.listTools();
const prompts = await connection.listPrompts();
const resources = await connection.listResources();
```

### 5. Capability Declaration

```typescript
// Good: Only declare capabilities you actually implement
const client = new McpClient({
  name: "my-client",
  version: "1.0.0",
  capabilities: {
    elicitation: {}  // Only if you register onElicit handler
  }
});

client.onElicit(async (params) => {
  // Handler implementation
});

// Bad: Declaring capabilities without handlers
const client = new McpClient({
  capabilities: {
    elicitation: {},
    sampling: {}
  }
});
// No handlers registered - will fail when server tries to use them
```

## Protocol Support

The client supports MCP protocol versions:

- **`2025-06-18`** (default) - Current version with full elicitation and structured output support
- **`2025-03-26`** - Backward compatible version

The client automatically negotiates the protocol version during initialization and stores it per connection.

For more details on protocol versioning, see the [MCP Specification](https://modelcontextprotocol.io/specification).

