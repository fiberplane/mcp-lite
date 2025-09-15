/**
 * Optional in-process server harness for testing
 */

import {
  InMemoryEventStore,
  McpServer,
  StreamableHttpTransport,
} from "mcp-lite";
import type { TestServer } from "./index.js";

export interface TestHarnessOptions {
  /** Fixed session ID generator for deterministic testing */
  sessionId?: string;
  /** Event store instance */
  eventStore?: InMemoryEventStore;
  /** Port for server (defaults to 0 for random) */
  port?: number;
}

/**
 * Create an in-process test harness with a real HTTP server and transport
 */
export async function createTestHarness(
  server: McpServer,
  options: TestHarnessOptions = {},
): Promise<TestServer> {
  const { sessionId, eventStore, port = 0 } = options;

  const transportOptions: ConstructorParameters<
    typeof StreamableHttpTransport
  >[0] = {};

  if (sessionId !== undefined) {
    // Session-based transport
    transportOptions.generateSessionId = () => sessionId;
    transportOptions.eventStore = eventStore || new InMemoryEventStore();
  } else if (eventStore !== undefined) {
    // Session-based with random IDs
    transportOptions.generateSessionId = () => crypto.randomUUID();
    transportOptions.eventStore = eventStore;
  }
  // If neither sessionId nor eventStore are provided, create stateless transport

  const transport = new StreamableHttpTransport(transportOptions);

  const handler = transport.bind(server);

  // Create Bun server
  const bunServer = Bun.serve({
    port,
    fetch: handler,
  });

  const url = `http://localhost:${bunServer.port}`;

  return {
    url,
    stop: async () => {
      bunServer.stop();
    },
  };
}

/**
 * Create a test server with a simple echo tool for testing
 */
export async function createEchoTestServer(
  options: TestHarnessOptions = {},
): Promise<{ server: TestServer; mcpServer: McpServer }> {
  const mcpServer = new McpServer({ name: "test-server", version: "1.0.0" });

  // Add a simple echo tool
  mcpServer.tool("echo", {
    description: "Echo the input",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    handler: async (args: { message: string }) => {
      return { content: [{ type: "text", text: args.message }] };
    },
  });

  // Add a tool that emits progress
  mcpServer.tool("progressTask", {
    description: "Task that emits progress updates",
    inputSchema: {
      type: "object",
      properties: { count: { type: "integer" } },
      required: ["count"],
    },
    handler: async (args: { count: number }, ctx) => {
      for (let i = 1; i <= args.count; i++) {
        await ctx.progress?.({
          progress: i,
          total: args.count,
          message: `Step ${i} of ${args.count}`,
        });
      }
      return {
        content: [{ type: "text", text: `Completed ${args.count} steps` }],
      };
    },
  });

  const server = await createTestHarness(mcpServer, options);

  return { server, mcpServer };
}
