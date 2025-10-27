/** biome-ignore-all lint/style/noNonNullAssertion: tests */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  McpServer,
  McpClient,
  StreamableHttpClientTransport,
  InMemoryClientSessionAdapter,
  InMemorySessionAdapter,
  InMemoryClientRequestAdapter,
} from "../../src/index.js";
import {
  createTestHarness,
  openSessionStream,
  type TestServer,
} from "../../../test-utils/src/index.js";

describe("MCP Client - End-to-End Full Workflows", () => {
  describe("Multi-server workflow", () => {
    let githubServer: TestServer;
    let slackServer: TestServer;
    let dbServer: TestServer;

    beforeEach(async () => {
      // Create GitHub server
      const github = new McpServer({ name: "github-server", version: "1.0.0" });
      github.tool("listRepos", {
        description: "List repositories",
        handler: () => ({
          content: [{ type: "text", text: "repo1, repo2, repo3" }],
        }),
      });
      github.tool("createIssue", {
        description: "Create issue",
        handler: (args: { title: string }) => ({
          content: [{ type: "text", text: `Issue created: ${args.title}` }],
        }),
      });
      githubServer = await createTestHarness(github);

      // Create Slack server
      const slack = new McpServer({ name: "slack-server", version: "1.0.0" });
      slack.tool("postMessage", {
        description: "Post message",
        handler: (args: { channel: string; text: string }) => ({
          content: [
            { type: "text", text: `Posted to ${args.channel}: ${args.text}` },
          ],
        }),
      });
      slackServer = await createTestHarness(slack);

      // Create DB server
      const db = new McpServer({ name: "db-server", version: "1.0.0" });
      db.tool("query", {
        description: "Run query",
        handler: (args: { sql: string }) => ({
          content: [{ type: "text", text: `Query result: 5 rows` }],
        }),
      });
      dbServer = await createTestHarness(db);
    });

    afterEach(async () => {
      await githubServer.stop();
      await slackServer.stop();
      await dbServer.stop();
    });

    it("should connect to multiple servers and use tools from each", async () => {
      const client = new McpClient({
        name: "multi-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport();
      const connect = transport.bind(client);

      // Connect to all three servers
      const githubConn = await connect(githubServer.url);
      const slackConn = await connect(slackServer.url);
      const dbConn = await connect(dbServer.url);

      // Verify server info
      expect(githubConn.serverInfo.name).toBe("github-server");
      expect(slackConn.serverInfo.name).toBe("slack-server");
      expect(dbConn.serverInfo.name).toBe("db-server");

      // Get tools from each server
      const githubTools = await githubConn.listTools();
      const slackTools = await slackConn.listTools();
      const dbTools = await dbConn.listTools();

      expect(githubTools.tools).toHaveLength(2);
      expect(slackTools.tools).toHaveLength(1);
      expect(dbTools.tools).toHaveLength(1);

      // Execute a workflow using tools from all servers
      const repos = await githubConn.callTool("listRepos", {});
      expect(repos.content[0].text).toContain("repo1");

      const issue = await githubConn.callTool("createIssue", {
        title: "Bug in repo1",
      });
      expect(issue.content[0].text).toContain("Issue created");

      const message = await slackConn.callTool("postMessage", {
        channel: "#dev",
        text: "New issue created",
      });
      expect(message.content[0].text).toContain("Posted to #dev");

      const dbResult = await dbConn.callTool("query", {
        sql: "SELECT * FROM issues",
      });
      expect(dbResult.content[0].text).toContain("5 rows");
    });

    it("should handle concurrent operations across multiple servers", async () => {
      const client = new McpClient({
        name: "multi-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport();
      const connect = transport.bind(client);

      const githubConn = await connect(githubServer.url);
      const slackConn = await connect(slackServer.url);
      const dbConn = await connect(dbServer.url);

      // Execute operations in parallel
      const results = await Promise.all([
        githubConn.callTool("listRepos", {}),
        slackConn.callTool("postMessage", { channel: "#dev", text: "test" }),
        dbConn.callTool("query", { sql: "SELECT 1" }),
        githubConn.callTool("createIssue", { title: "Test" }),
      ]);

      expect(results).toHaveLength(4);
      expect(results[0].content[0].text).toContain("repo1");
      expect(results[1].content[0].text).toContain("Posted");
      expect(results[2].content[0].text).toContain("Query result");
      expect(results[3].content[0].text).toContain("Issue created");
    });
  });

  describe("Session with progress notifications", () => {
    let testServer: TestServer;
    let mcpServer: McpServer;

    beforeEach(async () => {
      mcpServer = new McpServer({
        name: "progress-server",
        version: "1.0.0",
      });

      mcpServer.tool("longRunning", {
        description: "Long running task",
        handler: async (args: { steps: number }, ctx) => {
          for (let i = 1; i <= args.steps; i++) {
            await ctx.progress?.({
              progress: i,
              total: args.steps,
              message: `Processing step ${i}`,
            });
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return { content: [{ type: "text", text: "Completed" }] };
        },
      });

      testServer = await createTestHarness(mcpServer, {
        sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
      });
    });

    afterEach(async () => {
      await testServer.stop();
    });

    it("should receive progress notifications during tool execution", async () => {
      const client = new McpClient({
        name: "progress-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport({
        sessionAdapter: new InMemoryClientSessionAdapter(),
      });
      const connect = transport.bind(client);
      const connection = await connect(testServer.url);

      // Track progress events
      const progressEvents: any[] = [];

      // For this test, we want to observe progress events, so use test-utils helper
      // (don't use connection.openSessionStream() - server only allows one stream)
      const stream = await openSessionStream(
        testServer.url,
        connection.sessionId!,
      );
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      // Start reading in background
      const readPromise = (async () => {
        try {
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
                }
              }
            }

            // Stop after getting some events
            if (progressEvents.length >= 3) {
              break;
            }
          }
        } catch (error) {
          // Stream cancelled
        }
      })();

      // Execute tool with progress token
      const resultPromise = fetch(testServer.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": connection.sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "progress-test",
          method: "tools/call",
          params: {
            _meta: { progressToken: "test-123" },
            name: "longRunning",
            arguments: { steps: 5 },
          },
        }),
      });

      await readPromise;
      reader.cancel();

      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      expect(progressEvents[0].progressToken).toBe("test-123");
      expect(progressEvents[0].message).toContain("step 1");

      await resultPromise;
      await connection.close(true);
    });
  });

  describe("Elicitation workflow", () => {
    let testServer: TestServer;
    let mcpServer: McpServer;

    beforeEach(async () => {
      mcpServer = new McpServer({
        name: "elicit-server",
        version: "1.0.0",
      });

      mcpServer.tool("getUserInfo", {
        description: "Get user information",
        handler: async (_, ctx) => {
          if (!ctx.client.supports("elicitation")) {
            return { content: [{ type: "text", text: "No elicitation" }] };
          }

          const nameResult = await ctx.elicit({
            message: "What is your name?",
            schema: {
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            },
          });

          if (nameResult.action !== "accept") {
            return { content: [{ type: "text", text: "User declined" }] };
          }

          const ageResult = await ctx.elicit({
            message: "What is your age?",
            schema: {
              type: "object",
              properties: { age: { type: "number" } },
              required: ["age"],
            },
          });

          if (ageResult.action !== "accept") {
            return { content: [{ type: "text", text: "User declined age" }] };
          }

          return {
            content: [
              {
                type: "text",
                text: `Name: ${nameResult.content?.name}, Age: ${ageResult.content?.age}`,
              },
            ],
          };
        },
      });

      testServer = await createTestHarness(mcpServer, {
        sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
        clientRequestAdapter: new InMemoryClientRequestAdapter(),
      });
    });

    afterEach(async () => {
      await testServer.stop();
    });

    it("should handle multiple elicitations in sequence", async () => {
      const client = new McpClient({
        name: "elicit-client",
        version: "1.0.0",
        capabilities: { elicitation: {} },
      });

      let elicitCount = 0;
      client.onElicit(async (params) => {
        elicitCount++;

        if (params.message.includes("name")) {
          return { action: "accept", content: { name: "Alice" } };
        } else if (params.message.includes("age")) {
          return { action: "accept", content: { age: 30 } };
        }

        return { action: "decline" };
      });

      const transport = new StreamableHttpClientTransport({
        sessionAdapter: new InMemoryClientSessionAdapter(),
      });
      const connect = transport.bind(client);
      const connection = await connect(testServer.url);

      await connection.openSessionStream();

      const result = await connection.callTool("getUserInfo", {});

      expect(elicitCount).toBe(2); // Both elicitations called
      expect(result.content[0].text).toBe("Name: Alice, Age: 30");

      await connection.close(true);
    });
  });

  describe("Error recovery", () => {
    let testServer: TestServer;
    let mcpServer: McpServer;

    beforeEach(async () => {
      mcpServer = new McpServer({
        name: "error-server",
        version: "1.0.0",
      });

      let callCount = 0;
      mcpServer.tool("flaky", {
        description: "Sometimes fails",
        handler: () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("Temporary failure");
          }
          return { content: [{ type: "text", text: "Success" }] };
        },
      });

      testServer = await createTestHarness(mcpServer);
    });

    afterEach(async () => {
      await testServer.stop();
    });

    it("should handle tool errors and allow retry", async () => {
      const client = new McpClient({
        name: "retry-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport();
      const connect = transport.bind(client);
      const connection = await connect(testServer.url);

      // First call fails
      await expect(connection.callTool("flaky", {})).rejects.toThrow();

      // Second call succeeds
      const result = await connection.callTool("flaky", {});
      expect(result.content[0].text).toBe("Success");
    });
  });

  describe("Tool adapter interface", () => {
    let testServer: TestServer;

    beforeEach(async () => {
      const server = new McpServer({
        name: "adapter-server",
        version: "1.0.0",
      });

      server.tool("calculate", {
        description: "Calculate something",
        inputSchema: {
          type: "object",
          properties: {
            operation: { type: "string" },
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["operation", "a", "b"],
        },
        handler: (args: { operation: string; a: number; b: number }) => {
          let result = 0;
          if (args.operation === "add") result = args.a + args.b;
          else if (args.operation === "multiply") result = args.a * args.b;

          return {
            content: [{ type: "text", text: `Result: ${result}` }],
            structuredContent: { result },
          };
        },
      });

      testServer = await createTestHarness(server);
    });

    afterEach(async () => {
      await testServer.stop();
    });

    it("should demonstrate tool adapter pattern", async () => {
      const client = new McpClient({
        name: "adapter-client",
        version: "1.0.0",
      });

      const transport = new StreamableHttpClientTransport();
      const connect = transport.bind(client);
      const connection = await connect(testServer.url);

      // Get tools
      const { tools } = await connection.listTools();
      expect(tools).toHaveLength(1);

      // Example adapter pattern (user would implement this)
      class SimpleAdapter {
        toSDK(mcpTool: any) {
          return {
            name: mcpTool.name,
            description: mcpTool.description,
            parameters: mcpTool.inputSchema,
          };
        }

        async execute(connection: any, toolName: string, args: any) {
          const result = await connection.callTool(toolName, args);
          // Convert MCP result to SDK format
          if (result.structuredContent) {
            return result.structuredContent;
          }
          return result.content[0]?.text;
        }
      }

      const adapter = new SimpleAdapter();
      const sdkTool = adapter.toSDK(tools[0]);

      expect(sdkTool.name).toBe("calculate");
      expect(sdkTool.parameters).toBeDefined();

      const result = await adapter.execute(connection, "calculate", {
        operation: "add",
        a: 5,
        b: 3,
      });

      expect(result).toEqual({ result: 8 });
    });
  });
});
