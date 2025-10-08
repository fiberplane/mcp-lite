import { beforeEach, describe, expect, it } from "bun:test";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";

// Type for JSON-RPC response
interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Create a test handler function
function createTestHandler() {
  const mcp = new McpServer({
    name: "test-server",
    version: "1.0.0",
  });

  // Add a simple echo tool
  mcp.tool("echo", {
    description: "Echoes the input message",
    handler: (args: { message: string }) => ({
      content: [{ type: "text", text: args.message }],
    }),
  });

  // Add a math tool
  mcp.tool("add", {
    description: "Adds two numbers",
    handler: (args: { a: number; b: number }) => ({
      content: [{ type: "text", text: String(args.a + args.b) }],
    }),
  });

  const transport = new StreamableHttpTransport();
  return transport.bind(mcp);
}

// Create a test handler with middleware for response testing
function createTestHandlerWithMiddleware() {
  const mcp = new McpServer({
    name: "test-server",
    version: "1.0.0",
  });

  // Track middleware execution order and response access
  const middlewareLog: string[] = [];

  // First middleware - logs before and after
  mcp.use(async (ctx, next) => {
    middlewareLog.push("middleware1-before");
    expect(ctx.response).toBe(null); // Response should be null before next()

    await next();

    middlewareLog.push("middleware1-after");
    expect(ctx.response).toBeTruthy(); // Response should be set after next()
    expect(ctx.response?.jsonrpc).toBe("2.0");

    // Middleware can inspect the tool result
    if (ctx.response?.result && typeof ctx.response.result === "object") {
      const result = ctx.response.result as {
        content: Array<{ type: string; text: string }>;
      };
      if (result.content?.[0]?.text === "Hello World") {
        middlewareLog.push("middleware1-saw-echo-result");
      }
    }
  });

  // Second middleware - also logs and can modify state
  mcp.use(async (ctx, next) => {
    middlewareLog.push("middleware2-before");
    ctx.state.middlewareData = "test-data";

    await next();

    middlewareLog.push("middleware2-after");
    expect(ctx.response).toBeTruthy();
  });

  mcp.tool("echo", {
    description: "Echoes the input message",
    handler: (args: { message: string }) => {
      middlewareLog.push("handler-executed");
      return {
        content: [{ type: "text", text: args.message }],
      };
    },
  });

  const transport = new StreamableHttpTransport();
  const handler = transport.bind(mcp);

  // Return both handler and log accessor
  return {
    handler,
    getMiddlewareLog: () => middlewareLog,
  };
}

describe("E2E MCP Integration", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    handler = createTestHandler();
  });

  describe("Initialize handshake", () => {
    it("should successfully initialize with correct protocol version", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const response = await handler(request);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.jsonrpc).toBe("2.0");
      expect(result.id).toBe("1");
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        protocolVersion: "2025-06-18",
        serverInfo: {
          name: "test-server",
          version: "1.0.0",
        },
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      });
    });

    it("should negotiate to compatible version when client requests unsupported version", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "initialize",
          params: {
            protocolVersion: "1.0.0", // Unsupported version
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }),
      });

      const response = await handler(request);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      // Server should negotiate to 2025-03-26 (most compatible)
      expect(
        (result.result as { protocolVersion?: string })?.protocolVersion,
      ).toBe("2025-03-26");
    });

    it("should reject protocol version mismatch in header for non-initialize requests", async () => {
      // First initialize the server with correct protocol version
      const initRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const initResponse = await handler(initRequest);
      expect(initResponse.ok).toBe(true);

      // Now make a non-initialize request with wrong protocol header
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "1.0.0", // Wrong header version
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "2",
          method: "tools/call",
          params: {
            name: "echo",
            arguments: { message: "test" },
          },
        }),
      });

      const response = await handler(toolRequest);
      expect(response.status).toBe(400);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32602); // INVALID_PARAMS
      expect(result.error?.message).toBe("Protocol version mismatch");
      const errorData = result.error?.data as {
        expectedVersion?: string[];
        receivedVersion?: string;
      };
      expect(errorData.expectedVersion).toContain("2025-03-26");
      expect(errorData.expectedVersion).toContain("2025-06-18");
      expect(errorData.receivedVersion).toBe("1.0.0");
    });

    it("should handle unknown methods", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "unknown-method",
        }),
      });

      const response = await handler(request);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32601);
      expect(result.error?.message).toBe("Method not found");
    });

    it("should reject GET methods without proper headers", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "GET",
      });

      const response = await handler(request);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe(
        "Bad Request: Accept header must be text/event-stream",
      );
    });

    it("should reject unsupported HTTP methods", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "PUT",
      });

      const response = await handler(request);
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST, GET, DELETE");

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32600);
    });
  });

  describe("Middleware response access", () => {
    it("should allow middleware to access response after await next()", async () => {
      // Use the middleware-enabled handler
      const { handler: handlerWithMiddleware, getMiddlewareLog } =
        createTestHandlerWithMiddleware();

      // First initialize the server
      const initRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
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

      await handlerWithMiddleware(initRequest);

      // Clear the log after initialization to focus on tool call middleware
      getMiddlewareLog().length = 0;

      // Now call a tool to test middleware response access
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call",
          method: "tools/call",
          params: {
            name: "echo",
            arguments: { message: "Hello World" },
          },
        }),
      });

      const response = await handlerWithMiddleware(toolRequest);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        content: [{ type: "text", text: "Hello World" }],
      });

      // Get the middleware log to verify execution order and response access
      const middlewareLog = getMiddlewareLog();

      // Verify execution order: middleware runs in order, handler executes, then middleware completes in reverse order
      expect(middlewareLog).toEqual([
        "middleware1-before",
        "middleware2-before",
        "handler-executed",
        "middleware2-after",
        "middleware1-after",
        "middleware1-saw-echo-result", // This proves middleware could access and inspect the response
      ]);
    });
  });
});
