/** biome-ignore-all lint/style/noNonNullAssertion: tests */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  collectSseEventsCount,
  createTestHarness,
  openSessionStream,
  type TestServer,
} from "@internal/test-utils";
import {
  InMemoryClientRequestAdapter,
  InMemoryClientSessionAdapter,
  InMemorySessionAdapter,
  McpClient,
  McpServer,
  StreamableHttpClientTransport,
  StreamableHttpTransport,
} from "../../src/index.js";

describe("MCP Client - Server-Initiated Requests", () => {
  let testServer: TestServer;
  let mcpServer: McpServer;
  let serverUrl: string;

  beforeEach(async () => {
    // Create server with elicitation support
    mcpServer = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });

    testServer = await createTestHarness(mcpServer, {
      sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
      clientRequestAdapter: new InMemoryClientRequestAdapter(),
    });
    serverUrl = testServer.url;
  });

  afterEach(async () => {
    await testServer.stop();
  });

  test("should handle elicitation request from server", async () => {
    // Server tool that requests elicitation
    mcpServer.tool("ask-user", {
      description: "Asks user for input",
      handler: async (_, ctx) => {
        if (!ctx.client.supports("elicitation")) {
          return {
            content: [{ type: "text", text: "No elicitation support" }],
          };
        }

        const result = await ctx.elicit({
          message: "What is your name?",
          schema: { type: "object", properties: { name: { type: "string" } } },
        });

        if (result.action === "accept") {
          return {
            content: [
              {
                type: "text",
                text: `Hello, ${result.content?.name}!`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: `Action: ${result.action}` }],
        };
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: {
        elicitation: {},
      },
    });

    // Register elicitation handler
    client.onElicit(async (params, _ctx) => {
      expect(params.message).toBe("What is your name?");
      expect(params.requestedSchema).toBeDefined();

      return {
        action: "accept",
        content: { name: "Alice" },
      };
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    // Open SSE stream to enable server request handling
    await connection.openSessionStream();

    // Call tool that will trigger elicitation
    const result = await connection.callTool("ask-user", {});
    expect(result.content[0].text).toBe("Hello, Alice!");

    await connection.close(true);
  });

  test("should handle elicitation decline", async () => {
    mcpServer.tool("ask-user", {
      handler: async (_, ctx) => {
        const result = await ctx.elicit({
          message: "What is your age?",
          schema: { type: "object", properties: { age: { type: "number" } } },
        });

        return {
          content: [
            {
              type: "text",
              text: `Action: ${result.action}`,
            },
          ],
        };
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: { elicitation: {} },
    });

    client.onElicit(async () => ({
      action: "decline",
    }));

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await connection.openSessionStream();

    const result = await connection.callTool("ask-user", {});
    expect(result.content[0].text).toBe("Action: decline");

    await connection.close(true);
  });

  test("should handle elicitation cancel", async () => {
    mcpServer.tool("ask-user", {
      handler: async (_, ctx) => {
        const result = await ctx.elicit({
          message: "Confirm action?",
          schema: { type: "object", properties: {} },
        });

        return {
          content: [
            {
              type: "text",
              text: `Action: ${result.action}`,
            },
          ],
        };
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: { elicitation: {} },
    });

    client.onElicit(async () => ({
      action: "cancel",
    }));

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await connection.openSessionStream();

    const result = await connection.callTool("ask-user", {});
    expect(result.content[0].text).toBe("Action: cancel");

    await connection.close(true);
  });

  test("should run middleware for server requests", async () => {
    const log: string[] = [];

    mcpServer.tool("ask-user", {
      handler: async (_, ctx) => {
        const result = await ctx.elicit({
          message: "Test",
          schema: { type: "object", properties: {} },
        });
        return { content: [{ type: "text", text: "done" }] };
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: { elicitation: {} },
    });

    client.onElicit(async () => {
      log.push("handler");
      return { action: "accept", content: {} };
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await connection.openSessionStream();
    await connection.callTool("ask-user", {});

    // Wait a bit for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(log).toEqual(["handler"]);

    await connection.close(true);
  });

  test("should handle error in elicitation handler", async () => {
    mcpServer.tool("ask-user", {
      handler: async (_, ctx) => {
        try {
          await ctx.elicit({
            message: "Test",
            schema: { type: "object" },
          });
          return { content: [{ type: "text", text: "should not reach" }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
              },
            ],
          };
        }
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: { elicitation: {} },
    });

    client.onElicit(async () => {
      throw new Error("Handler failed");
    });

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await connection.openSessionStream();

    const result = await connection.callTool("ask-user", {});
    expect(result.content[0].text).toContain("Handler failed");

    await connection.close(true);
  });

  test("should handle missing handler gracefully", async () => {
    mcpServer.tool("ask-user", {
      handler: async (_, ctx) => {
        try {
          await ctx.elicit({
            message: "Test",
            schema: { type: "object" },
          });
          return { content: [{ type: "text", text: "should not reach" }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
              },
            ],
          };
        }
      },
    });

    const client = new McpClient({
      name: "test-client",
      version: "1.0.0",
      capabilities: { elicitation: {} },
    });

    // No handler registered!

    const transport = new StreamableHttpClientTransport({
      sessionAdapter: new InMemoryClientSessionAdapter(),
    });
    const connect = transport.bind(client);
    const connection = await connect(serverUrl);

    await connection.openSessionStream();

    const result = await connection.callTool("ask-user", {});
    expect(result.content[0].text).toContain(
      "No elicitation handler registered",
    );

    await connection.close(true);
  });
});
