import { beforeEach, describe, expect, it } from "bun:test";
import { McpServer } from "../../src/core.js";
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

    expect(response.status).toBe(204);
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

    expect(response.status).toBe(204);
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
    expect(response.status).toBe(204);
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
    expect(notificationResponse.status).toBe(204);
    expect(notificationResponse.body).toBeNull();
  });
});
