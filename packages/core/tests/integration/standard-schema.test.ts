import { beforeEach, describe, expect, it } from "bun:test";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";

// Mock Standard Schema validator
const createMockValidator = <T>(validator: (input: unknown) => T) => {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "test-validator",
      validate: (value: unknown) => {
        try {
          const result = validator(value);
          return { value: result };
        } catch (error) {
          return {
            issues: [
              {
                message:
                  error instanceof Error ? error.message : "Validation failed",
                path: [],
              },
            ],
          };
        }
      },
    },
  };
};

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

describe("Standard Schema Support", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    const mcp = new McpServer({
      name: "schema-test-server",
      version: "1.0.0",
    });

    // Tool with Standard Schema validation
    const numberValidator = createMockValidator((input: unknown) => {
      if (typeof input !== "object" || input === null) {
        throw new Error("Expected object");
      }
      const obj = input as Record<string, unknown>;
      if (typeof obj.value !== "number") {
        throw new Error("Expected value to be a number");
      }
      return { value: obj.value };
    });

    mcp.tool("doubleNumber", {
      description: "Doubles a number with validation",
      inputSchema: numberValidator,
      handler: (args: { value: number }) => ({
        content: [{ type: "text", text: String(args.value * 2) }],
      }),
    });

    // Tool with JSON schema
    mcp.tool("concat", {
      description: "Concatenates two strings",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
        },
        required: ["a", "b"],
      },
      handler: (args: { a: string; b: string }) => ({
        content: [{ type: "text", text: args.a + args.b }],
      }),
    });

    // Tool without schema
    mcp.tool("echo", {
      description: "Echoes input",
      handler: (args: { message: string }) => ({
        content: [{ type: "text", text: args.message }],
      }),
    });

    const transport = new StreamableHttpTransport();
    handler = transport.bind(mcp);
  });

  it("should validate with Standard Schema validator", async () => {
    // Valid input
    const validRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/call",
        params: {
          name: "doubleNumber",
          arguments: { value: 5 },
        },
      }),
    });

    const validResponse = await handler(validRequest);
    const validResult = (await validResponse.json()) as JsonRpcResponse;
    expect(validResult.error).toBeUndefined();
    expect(validResult.result).toEqual({
      content: [{ type: "text", text: "10" }],
    });

    // Invalid input
    const invalidRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "2",
        method: "tools/call",
        params: {
          name: "doubleNumber",
          arguments: { value: "not a number" },
        },
      }),
    });

    const invalidResponse = await handler(invalidRequest);
    const invalidResult = (await invalidResponse.json()) as JsonRpcResponse;
    expect(invalidResult.error).toBeDefined();
    expect(invalidResult.error?.code).toBe(-32602);
    // The validation error message should appear in the data field or message
    const errorMessage =
      invalidResult.error?.data || invalidResult.error?.message || "";
    expect(errorMessage.toString()).toContain("Expected value to be a number");
  });

  it("should list tools with proper schemas", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
      }),
    });

    const response = await handler(request);
    const result = (await response.json()) as JsonRpcResponse;

    expect(result.result).toEqual({
      tools: [
        {
          name: "doubleNumber",
          description: "Doubles a number with validation",
          inputSchema: { type: "object" }, // Standard Schema stored as generic object
        },
        {
          name: "concat",
          description: "Concatenates two strings",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "string" },
              b: { type: "string" },
            },
            required: ["a", "b"],
          }, // Regular JSON schema preserved
        },
        {
          name: "echo",
          description: "Echoes input",
          inputSchema: { type: "object" }, // Default schema
        },
      ],
    });
  });

  it("should enforce ToolCallResult return type", async () => {
    // This test verifies that handlers must return ToolCallResult format
    // The compilation would fail if handlers returned raw values instead of ToolCallResult
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/call",
        params: {
          name: "echo",
          arguments: { message: "test" },
        },
      }),
    });

    const response = await handler(request);
    const result = (await response.json()) as JsonRpcResponse;

    // Verify the result has the proper ToolCallResult structure
    expect(result.result).toHaveProperty("content");
    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(Array.isArray(toolResult.content)).toBe(true);
    expect(toolResult.content[0]).toEqual({
      type: "text",
      text: "test",
    });
  });
});
