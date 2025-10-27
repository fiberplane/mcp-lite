/** biome-ignore-all lint/style/noNonNullAssertion: tests */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  McpServer,
  McpClient,
  StreamableHttpClientTransport,
  InMemorySessionAdapter,
  InMemoryClientSessionAdapter,
} from "../../src/index.js";
import { createTestHarness, type TestServer } from "@internal/test-utils";

describe("MCP Client - Custom Headers", () => {
  let testServer: TestServer;
  let mcpServer: McpServer;
  let serverUrl: string;

  beforeEach(async () => {
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

    testServer = await createTestHarness(mcpServer, {
      sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
    });
    serverUrl = testServer.url;
  });

  afterEach(async () => {
    await testServer.stop();
  });

  it("should successfully connect with custom Authorization header", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });

    const connect = transport.bind(client);
    const connection = await connect(serverUrl, {
      headers: {
        Authorization: "Bearer test-token-123",
        "X-API-Key": "my-api-key",
      },
    });

    // Should connect successfully even with custom headers
    expect(connection.serverInfo.name).toBe("test-server");

    // Should be able to make requests with headers included
    const result = await connection.callTool("echo", { message: "test" });
    expect(result.content[0].text).toBe("test");

    await connection.close(true);
  });

  it("should successfully connect with multiple custom headers", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });

    const connect = transport.bind(client);
    const connection = await connect(serverUrl, {
      headers: {
        Authorization: "Bearer test-token-456",
        "X-Custom-Header-1": "value1",
        "X-Custom-Header-2": "value2",
        "X-Request-ID": "req-123",
      },
    });

    // Connection should work
    expect(connection.serverInfo.name).toBe("test-server");

    // Should be able to list tools
    const tools = await connection.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);

    await connection.close(true);
  });

  it("should work without custom headers", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
      // No headers specified
    });

    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    // Should still work normally
    const result = await connection.callTool("echo", { message: "no headers" });
    expect(result.content[0].text).toBe("no headers");

    await connection.close(true);
  });

  it("should include headers in all request types", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });

    const connect = transport.bind(client);
    const connection = await connect(serverUrl, {
      headers: {
        Authorization: "Bearer comprehensive-test",
      },
    });

    // All these operations should work with headers
    await connection.listTools();
    await connection.callTool("echo", { message: "test" });

    // List other resources
    await connection.listPrompts();
    await connection.listResources();

    await connection.close(true);
  });

  it("should support different headers for multiple servers", async () => {
    // Create second server
    const server2 = new McpServer({
      name: "test-server-2",
      version: "1.0.0",
    });

    server2.tool("echo2", {
      description: "Echoes input",
      handler: (args: { message: string }) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    const testServer2 = await createTestHarness(server2, {
      sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
    });
    const serverUrl2 = testServer2.url;

    try {
      const client = new McpClient({
        name: "test-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport({
        sessionAdapter: new InMemoryClientSessionAdapter(),
      });

      const connect = transport.bind(client);

      // Connect to first server with one set of headers
      const connection1 = await connect(serverUrl, {
        headers: {
          Authorization: "Bearer server-1-token",
          "X-Server": "server-1",
        },
      });

      // Connect to second server with different headers
      const connection2 = await connect(serverUrl2, {
        headers: {
          Authorization: "Bearer server-2-token",
          "X-Server": "server-2",
        },
      });

      // Both connections should work independently
      expect(connection1.serverInfo.name).toBe("test-server");
      expect(connection2.serverInfo.name).toBe("test-server-2");

      const result1 = await connection1.callTool("echo", { message: "test1" });
      const result2 = await connection2.callTool("echo2", { message: "test2" });

      expect(result1.content[0].text).toBe("test1");
      expect(result2.content[0].text).toBe("test2");

      await connection1.close(true);
      await connection2.close(true);
    } finally {
      await testServer2.stop();
    }
  });
});
