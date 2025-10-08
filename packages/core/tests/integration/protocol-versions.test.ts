/** biome-ignore-all lint/style/noNonNullAssertion: tests */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { buildInitializeRequest, createStatefulTestServer } from "../utils.js";

describe("Protocol Version Negotiation", () => {
  test("should accept 2025-03-26 and echo it back", async () => {
    const { handler } = createStatefulTestServer();

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    });

    const response = await handler(initRequest);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result.result.protocolVersion).toBe("2025-03-26");
  });

  test("should accept 2025-06-18 and echo it back", async () => {
    const { handler } = createStatefulTestServer();

    const initRequest = buildInitializeRequest();
    const response = await handler(initRequest);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result.result.protocolVersion).toBe("2025-06-18");
  });

  test("should negotiate to 2025-03-26 when client requests unsupported version", async () => {
    const { handler } = createStatefulTestServer();

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2024-01-01", // Unsupported version
          capabilities: {},
        },
      }),
    });

    const response = await handler(initRequest);
    expect(response.status).toBe(200); // Success, not error

    const result = await response.json();
    expect(result.result).toBeDefined();
    expect(result.error).toBeUndefined();

    // Server responds with most compatible version (2025-03-26) per spec
    expect(result.result.protocolVersion).toBe("2025-03-26");

    // Should omit elicitation for 2025-03-26
    expect(result.result.capabilities.elicitation).toBeUndefined();
  });

  test("should return same server capabilities for 2025-03-26", async () => {
    const { server, handler } = createStatefulTestServer();

    // Register a tool to enable tools capability
    server.tool("test-tool", {
      description: "Test tool",
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    });

    const response = await handler(initRequest);
    expect(response.status).toBe(200);

    const result = await response.json();
    // Server capabilities (tools, prompts, resources) are version-independent
    expect(result.result.capabilities.tools).toBeDefined();
    // Elicitation is a CLIENT capability, not server capability
    expect(result.result.capabilities.elicitation).toBeUndefined();
  });

  test("should return same server capabilities for 2025-06-18", async () => {
    const { server, handler } = createStatefulTestServer();

    // Register a tool to enable tools capability
    server.tool("test-tool", {
      description: "Test tool",
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-06-18",
          capabilities: { elicitation: {} }, // This is CLIENT capability
        },
      }),
    });

    const response = await handler(initRequest);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result.result.protocolVersion).toBe("2025-06-18");
    // Server capabilities (tools, prompts, resources) are version-independent
    expect(result.result.capabilities.tools).toBeDefined();
    // Elicitation is a CLIENT capability, not server capability
    expect(result.result.capabilities.elicitation).toBeUndefined();
  });
});

describe("Protocol Header Enforcement", () => {
  test("2025-06-18: header required for non-initialize requests", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("test-tool", {
      description: "Test tool",
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const initResponse = await handler(buildInitializeRequest());
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Request without header should fail
    const requestWithoutHeader = new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "test-tool", arguments: {} },
      }),
    });

    const response = await handler(requestWithoutHeader);
    expect(response.status).toBe(400);

    const result = await response.json();
    expect(result.error.message).toContain(
      "Missing required MCP-Protocol-Version header",
    );
  });

  test("2025-03-26: header optional for non-initialize requests", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("test-tool", {
      description: "Test tool",
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    });

    const initResponse = await handler(initRequest);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Request without header should succeed for 2025-03-26
    const requestWithoutHeader = new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "test-tool", arguments: {} },
      }),
    });

    const response = await handler(requestWithoutHeader);
    expect(response.status).toBe(200);
  });

  test("2025-03-26: header mismatch should fail", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("test-tool", {
      description: "Test tool",
      inputSchema: z.object({}),
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    });

    const initResponse = await handler(initRequest);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Request with wrong header should fail
    const requestWithWrongHeader = new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "test-tool", arguments: {} },
      }),
    });

    const response = await handler(requestWithWrongHeader);
    expect(response.status).toBe(400);

    const result = await response.json();
    expect(result.error.message).toContain("Protocol version mismatch");
    expect(result.error.data.expectedVersion).toBe("2025-03-26");
    expect(result.error.data.receivedVersion).toBe("2025-06-18");
  });
});

describe("Batch Request Support", () => {
  test("2025-03-26: should support batch requests", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("echo", {
      description: "Echo tool",
      inputSchema: z.object({ message: z.string() }),
      handler: async (args) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    const initRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    });

    const initResponse = await handler(initRequest);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Send batch request
    const batchRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "echo", arguments: { message: "hello" } },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "echo", arguments: { message: "world" } },
        },
      ]),
    });

    const response = await handler(batchRequest);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].result.content[0].text).toBe("hello");
    expect(result[1].result.content[0].text).toBe("world");
  });

  test("2025-06-18: should reject batch requests", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("echo", {
      description: "Echo tool",
      inputSchema: z.object({ message: z.string() }),
      handler: async (args) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    const initResponse = await handler(buildInitializeRequest());
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Send batch request
    const batchRequest = new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "echo", arguments: { message: "hello" } },
        },
      ]),
    });

    const response = await handler(batchRequest);
    expect(response.status).toBe(400);

    const result = await response.json();
    expect(result.error.message).toContain("Batch requests are not supported");
  });
});
