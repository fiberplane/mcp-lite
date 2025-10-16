import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  collectSseEvents,
  collectSseEventsCount,
  createTestHarness,
  type TestServer,
} from "@internal/test-utils";
import {
  InMemoryClientSessionAdapter,
  InMemorySessionAdapter,
  McpClient,
  McpServer,
  StreamableHttpClientTransport,
} from "../../src/index.js";

describe("MCP Client - Session Management", () => {
  let testServer: TestServer;
  let mcpServer: McpServer;
  let serverUrl: string;

  beforeEach(async () => {
    // Create server with session support
    mcpServer = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });

    mcpServer.tool("echo", {
      description: "Echoes input",
      handler: (args: { message: string }) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    // Tool that sends progress notifications
    mcpServer.tool("longTask", {
      description: "Task with progress",
      handler: async (args: { count: number }, ctx) => {
        for (let i = 1; i <= args.count; i++) {
          await ctx.progress?.({
            progress: i,
            total: args.count,
            message: `step ${i}`,
          });
        }
        return { content: [{ type: "text", text: `done ${args.count}` }] };
      },
    });

    testServer = await createTestHarness(mcpServer, {
      sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
    });
    serverUrl = testServer.url;
  });

  afterEach(async () => {
    await testServer.stop();
  });

  it("should initialize session with server", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const clientSessionAdapter = new InMemoryClientSessionAdapter();
    const transport = new StreamableHttpClientTransport({
      sessionAdapter: clientSessionAdapter,
    });
    const connect = transport.bind(client);

    const connection = await connect(serverUrl);

    // Should have session ID
    expect(connection.sessionId).toBeDefined();
    expect(connection.serverInfo.name).toBe("test-server");

    // Session should be stored in adapter
    const sessionId = connection.sessionId;
    expect(sessionId).toBeDefined();
    const sessionData = await clientSessionAdapter.get(sessionId!);
    expect(sessionData).toBeDefined();
    expect(sessionData?.serverInfo.name).toBe("test-server");
    expect(sessionData?.protocolVersion).toBe("2025-06-18");

    await connection.close(true);
  });

  it("should open and receive notifications via session stream", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    // Open session stream
    const stream = await connection.openSessionStream();

    // Start collecting events (expect 1 ping + 3 progress = 4 events)
    const eventsPromise = collectSseEventsCount(stream, 4);

    // Make a tool call with progress token
    const sessionId = connection.sessionId;
    expect(sessionId).toBeDefined();

    await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
        "MCP-Session-Id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call1",
        method: "tools/call",
        params: {
          _meta: { progressToken: "test-token" },
          name: "longTask",
          arguments: { count: 3 },
        },
      }),
    });

    // Wait for events
    const events = await eventsPromise;

    expect(events).toHaveLength(4);

    // First event is ping
    expect(events[0].data.method).toBe("ping");

    // Next 3 are progress notifications
    expect(events[1].data.method).toBe("notifications/progress");
    expect(events[1].data.params.progressToken).toBe("test-token");
    expect(events[1].data.params.progress).toBe(1);

    expect(events[2].data.params.progress).toBe(2);
    expect(events[3].data.params.progress).toBe(3);

    await connection.close(true);
  });

  it("should reconnect with Last-Event-ID for replay", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    // Generate some events first
    const sessionId = connection.sessionId;
    expect(sessionId).toBeDefined();

    await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
        "MCP-Session-Id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "setup",
        method: "tools/call",
        params: {
          _meta: { progressToken: "replay-test" },
          name: "longTask",
          arguments: { count: 3 },
        },
      }),
    });

    // Wait a bit for events to be stored
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reconnect asking for replay from event 1
    const stream = await connection.openSessionStream("1#_GET_stream");
    const events = await collectSseEvents(stream, 1000);

    // Should receive events 2 and 3 (after event 1)
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].id).toBe("2#_GET_stream");
    expect(events[1].id).toBe("3#_GET_stream");

    await connection.close(true);
  });

  it("should close and delete session", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const clientSessionAdapter = new InMemoryClientSessionAdapter();
    const transport = new StreamableHttpClientTransport({
      sessionAdapter: clientSessionAdapter,
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const sessionId = connection.sessionId;
    expect(sessionId).toBeDefined();

    // Verify session exists on client side
    expect(await clientSessionAdapter.get(sessionId!)).toBeDefined();

    // Close with delete
    await connection.close(true);

    // Try to open a GET stream with deleted session - should fail
    // (POST requests don't validate session existence, but GET does)
    const response = await fetch(serverUrl, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        "MCP-Session-Id": sessionId!,
      },
    });

    expect(response.status).toBe(400); // Session no longer exists
    const errorText = await response.text();
    expect(errorText).toContain("Invalid or missing session ID");
  });

  it("should support multiple concurrent sessions", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);

    // Create 3 separate sessions
    const conn1 = await connect(serverUrl);
    const conn2 = await connect(serverUrl);
    const conn3 = await connect(serverUrl);

    expect(conn1.sessionId).toBeDefined();
    expect(conn2.sessionId).toBeDefined();
    expect(conn3.sessionId).toBeDefined();

    // All should be different
    expect(conn1.sessionId).not.toBe(conn2.sessionId);
    expect(conn2.sessionId).not.toBe(conn3.sessionId);

    // All should work independently
    const result1 = await conn1.callTool("echo", { message: "First" });
    const result2 = await conn2.callTool("echo", { message: "Second" });
    const result3 = await conn3.callTool("echo", { message: "Third" });

    expect(result1.content[0].text).toBe("First");
    expect(result2.content[0].text).toBe("Second");
    expect(result3.content[0].text).toBe("Third");

    await conn1.close(true);
    await conn2.close(true);
    await conn3.close(true);
  });

  it("should handle session stream closure gracefully", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const _stream = await connection.openSessionStream();

    // Close the stream
    connection.closeSessionStream();

    // Should be able to open a new one
    const stream2 = await connection.openSessionStream();
    expect(stream2).toBeDefined();

    await connection.close(true);
  });

  it("should work in stateless mode (no session adapter)", async () => {
    // Create a separate server WITHOUT session adapter for stateless testing
    const statelessServer = new McpServer({
      name: "stateless-server",
      version: "1.0.0",
    });

    statelessServer.tool("echo", {
      description: "Echoes input",
      handler: (args: { message: string }) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    // Create test harness WITHOUT sessionAdapter (stateless mode)
    const statelessTestServer = await createTestHarness(statelessServer, {});
    const statelessUrl = statelessTestServer.url;

    try {
      const client = new McpClient({
        name: "test-client",
        version: "1.0.0",
      });

      // No session adapter = stateless
      const transport = new StreamableHttpClientTransport();
      const connect = transport.bind(client);
      const connection = await connect(statelessUrl);

      // Should not have session ID
      expect(connection.sessionId).toBeUndefined();

      // Should still work for basic operations
      const result = await connection.callTool("echo", { message: "Test" });
      expect(result.content[0].text).toBe("Test");

      // Should fail to open session stream
      await expect(connection.openSessionStream()).rejects.toThrow(
        "Cannot open session stream without session ID",
      );
    } finally {
      await statelessTestServer.stop();
    }
  });

  it("should retrieve stored session data", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const clientSessionAdapter = new InMemoryClientSessionAdapter();
    const transport = new StreamableHttpClientTransport({
      sessionAdapter: clientSessionAdapter,
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const sessionId = connection.sessionId;
    expect(sessionId).toBeDefined();
    const sessionData = await clientSessionAdapter.get(sessionId!);

    expect(sessionData).toBeDefined();
    expect(sessionData?.serverInfo).toEqual({
      name: "test-server",
      version: "1.0.0",
    });
    expect(sessionData?.serverCapabilities.tools).toBeDefined();
    expect(sessionData?.createdAt).toBeGreaterThan(0);

    await connection.close(true);
  });
});
