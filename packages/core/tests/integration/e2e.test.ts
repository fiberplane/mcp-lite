import { beforeEach, describe, expect, it } from "vitest";
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

    it("should reject unsupported protocol version", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18", // Correct header
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "initialize",
          params: {
            protocolVersion: "1.0.0", // Wrong params version - this should be caught
          },
        }),
      });

      const response = await handler(request);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32000);
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

    it("should reject non-POST methods", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "GET",
      });

      const response = await handler(request);
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-32600);
    });
  });
});
