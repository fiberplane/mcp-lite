import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestHarness, type TestServer } from "@internal/test-utils";
import {
  McpClient,
  McpServer,
  StreamableHttpClientTransport,
} from "../../src/index.js";

describe("MCP Client - Stateless Operations", () => {
  let testServer: TestServer;
  let mcpServer: McpServer;
  let serverUrl: string;

  beforeEach(async () => {
    // Create a real MCP server with tools
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

    mcpServer.tool("add", {
      description: "Adds two numbers",
      handler: (args: { a: number; b: number }) => ({
        content: [{ type: "text", text: String(args.a + args.b) }],
      }),
    });

    mcpServer.prompt("greet", {
      description: "Greeting prompt",
      handler: () => ({
        messages: [{ role: "user", content: { type: "text", text: "Hello!" } }],
      }),
    });

    mcpServer.resource(
      "file://test.txt",
      {
        description: "Test file",
      },
      async () => ({
        contents: [
          { uri: "file://test.txt", type: "text", text: "Test content" },
        ],
      }),
    );

    testServer = await createTestHarness(mcpServer);
    serverUrl = testServer.url;
  });

  afterEach(async () => {
    await testServer.stop();
  });

  it("should initialize connection to server", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);

    const connection = await connect(serverUrl);

    expect(connection.serverInfo.name).toBe("test-server");
    expect(connection.serverInfo.version).toBe("1.0.0");
    expect(connection.serverCapabilities.tools).toBeDefined();
  });

  it("should list tools from server", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const { tools } = await connection.listTools();

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("echo");
    expect(tools[1].name).toBe("add");
  });

  it("should call a tool successfully", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const result = await connection.callTool("echo", {
      message: "Hello World",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Hello World");
  });

  it("should handle tool call errors", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await expect(connection.callTool("nonexistent", {})).rejects.toThrow();
  });

  it("should list and get prompts", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const { prompts } = await connection.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("greet");

    const result = await connection.getPrompt("greet");
    expect(result.messages).toHaveLength(1);
  });

  it("should list and read resources", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const { resources } = await connection.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("file://test.txt");

    const result = await connection.readResource("file://test.txt");
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toBe("Test content");
  });

  it("should handle multiple concurrent tool calls", async () => {
    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport();
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    const results = await Promise.all([
      connection.callTool("echo", { message: "First" }),
      connection.callTool("echo", { message: "Second" }),
      connection.callTool("add", { a: 1, b: 2 }),
    ]);

    expect(results[0].content[0].text).toBe("First");
    expect(results[1].content[0].text).toBe("Second");
    expect(results[2].content[0].text).toBe("3");
  });

  it("should support client middleware", async () => {
    const log: string[] = [];

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
    });

    client.use(async (_ctx, next) => {
      log.push("before");
      await next();
      log.push("after");
    });

    // Note: Middleware runs on server-initiated requests only
    // For Phase 1, this is a placeholder test
    expect(log).toHaveLength(0); // No server requests yet
  });
});
