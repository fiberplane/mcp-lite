import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  closeSession,
  collectSseEventsCount,
  createTestHarness,
  initializeSession,
  openSessionStream,
  type TestServer,
} from "@internal/test-utils";
import { McpServer } from "../../src/index.js";
import { StreamableHttpTransport } from "../../src/transport-http.js";

describe("JSON-RPC Notification Handling", () => {
  let server: McpServer;
  let transport: StreamableHttpTransport;
  let httpHandler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "1.0.0" });
    transport = new StreamableHttpTransport();
    httpHandler = transport.bind(server);
  });

  it("should handle notifications/initialized with HTTP 204 response", async () => {
    const notificationRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    const response = await httpHandler(notificationRequest);

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();

    const text = await response.text();
    expect(text).toBe("");
  });

  it("should handle regular requests with HTTP 200 and JSON response", async () => {
    const requestRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "ping",
      }),
    });

    const response = await httpHandler(requestRequest);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");

    const json = await response.json();
    expect(json).toEqual({
      jsonrpc: "2.0",
      id: "1",
      result: {},
    });
  });

  it("should handle notifications/cancelled without response", async () => {
    const notificationRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: {
          requestId: "test-request",
          reason: "User cancelled",
        },
      }),
    });

    const response = await httpHandler(notificationRequest);

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
  });

  it("should handle unknown notification method gracefully", async () => {
    const notificationRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/unknown",
        params: {
          someData: "test",
        },
      }),
    });

    const response = await httpHandler(notificationRequest);

    // Should still return 204 even for unknown notification methods
    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
  });

  it("should handle mixed request and notification in sequence", async () => {
    // First send a request
    const requestRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "ping",
      }),
    });

    const requestResponse = await httpHandler(requestRequest);
    expect(requestResponse.status).toBe(200);

    const requestJson = await requestResponse.json();
    expect(requestJson.id).toBe("1");
    expect(requestJson.result).toEqual({});

    // Then send a notification
    const notificationRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    const notificationResponse = await httpHandler(notificationRequest);
    expect(notificationResponse.status).toBe(202);
    expect(notificationResponse.body).toBeNull();
  });
});

describe("List changed notifications over SSE", () => {
  let testServer: TestServer;
  let mcpServer: McpServer;

  beforeEach(async () => {
    mcpServer = new McpServer({ name: "test-server", version: "1.0.0" });
    testServer = await createTestHarness(mcpServer, {
      // enable sessions
      sessionId: "sess-listchanged",
    });
  });

  afterEach(async () => {
    await testServer.stop();
  });

  it("emits notifications/tools/list_changed when a tool is registered after initialize", async () => {
    const sessionId = await initializeSession(testServer.url, {
      name: "test-client",
      version: "1.0.0",
    });

    const sse = await openSessionStream(testServer.url, sessionId);

    // Register a tool post-initialize; should emit a list_changed notification
    mcpServer.tool("dynTool", {
      description: "dynamic tool",
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const events = await collectSseEventsCount(sse, 2, 2000);
    await closeSession(testServer.url, sessionId);

    expect(events).toHaveLength(2);
    // First event is connection
    expect(events[0].data).toEqual({
      type: "connection",
      status: "established",
    });
    // Second is the notification
    expect(events[1].data).toEqual({
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
      params: undefined,
    });
  });

  it("emits notifications/prompts/list_changed when a prompt is registered after initialize", async () => {
    const sessionId = await initializeSession(testServer.url, {
      name: "test-client",
      version: "1.0.0",
    });

    const sse = await openSessionStream(testServer.url, sessionId);

    // Register a prompt post-initialize
    mcpServer.prompt("dynPrompt", {
      description: "dynamic prompt",
      handler: () => ({ messages: [] }),
    });

    const events = await collectSseEventsCount(sse, 2, 2000);
    await closeSession(testServer.url, sessionId);

    expect(events).toHaveLength(2);
    expect(events[0].data).toEqual({
      type: "connection",
      status: "established",
    });
    expect(events[1].data).toEqual({
      jsonrpc: "2.0",
      method: "notifications/prompts/list_changed",
      params: undefined,
    });
  });

  it("emits notifications/resources/list_changed when a resource is registered after initialize", async () => {
    const sessionId = await initializeSession(testServer.url, {
      name: "test-client",
      version: "1.0.0",
    });

    const sse = await openSessionStream(testServer.url, sessionId);

    // Register a resource post-initialize
    mcpServer.resource(
      "mem://foo",
      { description: "dynamic resource" },
      async () => ({
        contents: [{ uri: "mem://foo", text: "bar", type: "text" }],
      }),
    );

    const events = await collectSseEventsCount(sse, 2, 2000);
    await closeSession(testServer.url, sessionId);

    expect(events).toHaveLength(2);
    expect(events[0].data).toEqual({
      type: "connection",
      status: "established",
    });
    expect(events[1].data).toEqual({
      jsonrpc: "2.0",
      method: "notifications/resources/list_changed",
      params: undefined,
    });
  });
});

describe("POST SSE notifications in stateless mode (bug reproduction)", () => {
  let server: McpServer;
  let transport: StreamableHttpTransport;
  let httpHandler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    server = new McpServer({ name: "test-server", version: "1.0.0" });
    // Create transport in stateless mode (no generateSessionId)
    transport = new StreamableHttpTransport();
    httpHandler = transport.bind(server);

    // Add a tool that triggers notifications
    server.tool("test-tool", {
      description: "A test tool",
      handler: () => ({ content: [{ type: "text", text: "test result" }] }),
    });
  });

  it("should receive notifications in POST SSE requests in stateless mode", async () => {
    // First initialize the server in stateless mode
    const initRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
        // No session ID header - stateless mode
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });

    const initResponse = await httpHandler(initRequest);
    expect(initResponse.status).toBe(200);

    // Make a POST request with SSE Accept header (but no session ID because we're in stateless mode)
    const postSseRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        // Omit the MCP-Session-Id header because we're in stateless mode
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-request",
        method: "tools/call",
        params: {
          name: "test-tool",
          arguments: {},
        },
      }),
    });

    const response = await httpHandler(postSseRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    // Start reading the SSE stream
    const _stream = response.body as ReadableStream<Uint8Array>;

    // Add a tool that triggers a notification during processing
    server.tool("slow-tool", {
      description: "A tool that registers another tool during execution",
      handler: async () => {
        // Register a new tool during tool execution - this should trigger a notification
        server.tool("dynamic-tool", {
          description: "A dynamic tool added during processing",
          handler: () => ({
            content: [{ type: "text", text: "dynamic result" }],
          }),
        });
        // Add a small delay to ensure notification is sent before response
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { content: [{ type: "text", text: "test result" }] };
      },
    });

    // Now update the request to call the slow-tool instead
    const postSseRequest2 = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        // Omit the MCP-Session-Id header because we're in stateless mode
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-request",
        method: "tools/call",
        params: {
          name: "slow-tool",
          arguments: {},
        },
      }),
    });

    const response2 = await httpHandler(postSseRequest2);
    expect(response2.status).toBe(200);
    expect(response2.headers.get("content-type")).toBe("text/event-stream");

    // Start reading the new SSE stream
    const stream2 = response2.body as ReadableStream<Uint8Array>;

    // Try to collect events from the stream
    const events = await collectSseEventsCount(stream2, 2, 1000);

    // We expect:
    // 1. A notification about the new tool being added (notifications/tools/list_changed)
    // 2. The response to the original tools/call request
    //
    expect(events).toHaveLength(2);

    // The first event should be the notification (sent immediately when tool is registered)
    expect(events[0].data).toEqual({
      jsonrpc: "2.0",
      method: "notifications/tools/list_changed",
      params: undefined,
    });

    // The second event should be the response to our tools/call
    expect(events[1].data).toMatchObject({
      jsonrpc: "2.0",
      id: "test-request",
      result: {
        content: [{ type: "text", text: "test result" }],
      },
    });
  });

  it("should handle regular POST requests with JSON responses", async () => {
    // Make a regular POST request (no SSE)
    const postRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test-request",
        method: "tools/call",
        params: {
          name: "test-tool",
          arguments: {},
        },
      }),
    });

    const response = await httpHandler(postRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");

    const json = await response.json();
    expect(json).toEqual({
      jsonrpc: "2.0",
      id: "test-request",
      result: {
        content: [{ type: "text", text: "test result" }],
      },
    });
  });
});
