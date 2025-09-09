import { beforeEach, describe, expect, it } from "bun:test";
import {
  InMemoryEventStore,
  MCP_PROTOCOL_HEADER,
  MCP_SESSION_ID_HEADER,
  McpServer,
  StreamableHttpTransport,
} from "../../src/index.js";

//

// Mock notification sender to capture progress notifications
let capturedNotifications: Array<{ method: string; params?: unknown }> = [];

function createMockTransport(
  server: McpServer,
): (req: Request) => Promise<Response> {
  const transport = new StreamableHttpTransport({
    eventStore: new InMemoryEventStore(),
  });

  const handler = transport.bind(server);

  // Override the notification sender after binding
  server._setNotificationSender((_sessionId, notification) => {
    capturedNotifications.push(notification);
  });

  return handler;
}

describe("Progress notifications (integration)", () => {
  let server: McpServer;
  let handler: (req: Request) => Promise<Response>;

  beforeEach(() => {
    server = new McpServer({ name: "test-server", version: "1.0.0" });
    capturedNotifications = []; // Clear captured notifications

    // Tool that emits progress updates when progressToken is present
    server.tool("longTask", {
      description: "emits progress 3 times",
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
            message: `step ${i}`,
          });
        }
        return { content: [{ type: "text", text: `done ${args.count}` }] };
      },
    });

    handler = createMockTransport(server);
  });

  async function initializeAndGetSessionId(): Promise<string> {
    const initRes = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: "2025-06-18",
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
      }),
    );
    expect(initRes.ok).toBe(true);

    const initJson = await initRes.json();
    expect(initJson.error).toBeUndefined();
    expect(initJson.result).toBeDefined();

    const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER) ?? "";
    expect(sessionId).toBeTruthy();

    return sessionId;
  }

  it("sends notifications/progress when progressToken is provided", async () => {
    const sessionId = await initializeAndGetSessionId();

    // Fire a tool call with a progressToken
    const callRes = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: "2025-06-18",
          [MCP_SESSION_ID_HEADER]: sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "42",
          method: "tools/call",
          params: {
            _meta: { progressToken: "abc123" },
            name: "longTask",
            arguments: { count: 3 },
          },
        }),
      }),
    );
    expect(callRes.status).toBe(200);

    // Verify the tool call succeeded
    const callJson = await callRes.json();
    expect(callJson.error).toBeUndefined();
    expect(callJson.result.content[0].text).toBe("done 3");

    // Verify progress notifications were captured
    expect(capturedNotifications).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const notification = capturedNotifications[i];
      expect(notification.method).toBe("notifications/progress");
      expect(notification.params).toEqual({
        progressToken: "abc123",
        progress: i + 1,
        total: 3,
        message: `step ${i + 1}`,
      });
    }
  });

  it("persists progress notifications for replay", async () => {
    const sessionId = await initializeAndGetSessionId();

    // Produce 3 progress events
    const callRes = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: "2025-06-18",
          [MCP_SESSION_ID_HEADER]: sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "100",
          method: "tools/call",
          params: {
            _meta: { progressToken: "replay-1" },
            name: "longTask",
            arguments: { count: 3 },
          },
        }),
      }),
    );
    expect(callRes.ok).toBe(true);

    // Verify the tool call succeeded
    const callJson = await callRes.json();
    expect(callJson.error).toBeUndefined();
    expect(callJson.result.content[0].text).toBe("done 3");

    // Verify progress notifications were captured
    expect(capturedNotifications).toHaveLength(3);
    capturedNotifications.forEach((notification, i) => {
      expect(notification.method).toBe("notifications/progress");
      expect(notification.params).toEqual({
        progressToken: "replay-1",
        progress: i + 1,
        total: 3,
        message: `step ${i + 1}`,
      });
    });
  });

  it("does not emit progress when no progressToken present", async () => {
    const sessionId = await initializeAndGetSessionId();

    // Call tool without _meta.progressToken — ctx.progress is a no-op
    const callRes = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: "2025-06-18",
          [MCP_SESSION_ID_HEADER]: sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "no-token",
          method: "tools/call",
          params: { name: "longTask", arguments: { count: 2 } },
        }),
      }),
    );
    expect(callRes.ok).toBe(true);

    // Verify the tool call succeeded
    const callJson = await callRes.json();
    expect(callJson.error).toBeUndefined();
    expect(callJson.result.content[0].text).toBe("done 2");

    // Verify no progress notifications were captured
    expect(capturedNotifications).toHaveLength(0);
  });
});
