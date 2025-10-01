import { beforeEach, describe, expect, it } from "bun:test";
import { type Type, type } from "arktype";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";
import type { JsonRpcRes } from "../../src/types.js";

describe("Structured Content Support", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    const mcp = new McpServer({
      name: "structured-content-test",
      version: "1.0.0",
      schemaAdapter: (schema) => (schema as Type).toJsonSchema(),
    });

    // Tool with outputSchema (Standard Schema)
    const weatherInput = type({ location: "string" });
    const weatherOutput = type({
      temperature: "number",
      conditions: "string",
      humidity: "number?",
    });

    mcp.tool("getWeather", {
      description: "Gets weather with structured output",
      inputSchema: weatherInput,
      outputSchema: weatherOutput,
      handler: (args: { location: string }) => ({
        content: [
          {
            type: "text",
            text: `Weather in ${args.location}: 22°C, sunny`,
          },
        ],
        structuredContent: {
          temperature: 22,
          conditions: "sunny",
          humidity: 65,
        },
      }),
    });

    // Tool with JSON Schema outputSchema
    mcp.tool("getData", {
      description: "Gets data with JSON Schema output",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          value: { type: "number" },
        },
        required: ["id", "value"],
      },
      handler: (args: { id: string }) => ({
        content: [{ type: "text", text: `Data for ${args.id}` }],
        structuredContent: {
          id: args.id,
          value: 42,
        },
      }),
    });

    // Tool without outputSchema
    mcp.tool("echo", {
      description: "Echoes input without structured output",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
      handler: (args: { text: string }) => ({
        content: [{ type: "text", text: args.text }],
      }),
    });

    // Tool with outputSchema that returns invalid data
    const strictOutput = type({
      result: "string",
      count: "number",
    });

    mcp.tool("invalidOutput", {
      description: "Returns invalid structured content",
      inputSchema: type({ input: "string" }),
      outputSchema: strictOutput,
      handler: () => ({
        content: [{ type: "text", text: "result" }],
        structuredContent: {
          result: "text",
          count: "not a number" as unknown as number, // Invalid!
        },
      }),
    });

    // Tool with outputSchema that returns error
    mcp.tool("errorTool", {
      description: "Returns error (skips validation)",
      inputSchema: type({ input: "string" }),
      outputSchema: weatherOutput,
      handler: () => ({
        content: [{ type: "text", text: "Error occurred" }],
        isError: true,
        // No structuredContent - should not throw error when isError=true
      }),
    });

    const transport = new StreamableHttpTransport();
    handler = transport.bind(mcp);
  });

  async function callTool(toolName: string, args: unknown) {
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
          name: toolName,
          arguments: args,
        },
      }),
    });

    const response = await handler(request);
    return (await response.json()) as JsonRpcRes;
  }

  async function listTools() {
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
    return (await response.json()) as JsonRpcRes;
  }

  it("should include outputSchema in tools/list", async () => {
    const result = await listTools();

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const tools = (
      result.result as {
        tools: Array<{ name: string; outputSchema?: unknown }>;
      }
    ).tools;
    const weatherTool = tools.find((t) => t.name === "getWeather");
    const dataTool = tools.find((t) => t.name === "getData");
    const echoTool = tools.find((t) => t.name === "echo");

    // Tool with outputSchema should expose it
    expect(weatherTool?.outputSchema).toBeDefined();
    const weatherSchema = weatherTool?.outputSchema as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(weatherSchema.type).toBe("object");
    expect(weatherSchema.properties.temperature).toEqual({ type: "number" });
    expect(weatherSchema.properties.conditions).toEqual({ type: "string" });
    expect(weatherSchema.properties.humidity).toEqual({ type: "number" });
    expect(weatherSchema.required).toContain("temperature");
    expect(weatherSchema.required).toContain("conditions");

    // JSON Schema output should be exposed
    expect(dataTool?.outputSchema).toBeDefined();
    expect(dataTool?.outputSchema).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        value: { type: "number" },
      },
      required: ["id", "value"],
    });

    // Tool without outputSchema should not have it
    expect(echoTool?.outputSchema).toBeUndefined();
  });

  it("should return valid structuredContent with Standard Schema", async () => {
    const result = await callTool("getWeather", { location: "Paris" });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: {
        temperature: number;
        conditions: string;
        humidity?: number;
      };
    };

    expect(toolResult.content).toHaveLength(1);
    expect(toolResult.content[0].text).toContain("Paris");

    expect(toolResult.structuredContent).toBeDefined();
    expect(toolResult.structuredContent?.temperature).toBe(22);
    expect(toolResult.structuredContent?.conditions).toBe("sunny");
    expect(toolResult.structuredContent?.humidity).toBe(65);
  });

  it("should return valid structuredContent with JSON Schema", async () => {
    const result = await callTool("getData", { id: "test-123" });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: unknown[];
      structuredContent?: {
        id: string;
        value: number;
      };
    };

    expect(toolResult.structuredContent).toBeDefined();
    expect(toolResult.structuredContent?.id).toBe("test-123");
    expect(toolResult.structuredContent?.value).toBe(42);
  });

  it("should not require structuredContent when no outputSchema", async () => {
    const result = await callTool("echo", { text: "hello" });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: unknown;
    };

    expect(toolResult.content).toHaveLength(1);
    expect(toolResult.content[0].text).toBe("hello");
    // structuredContent is optional when no outputSchema
    expect(toolResult.structuredContent).toBeUndefined();
  });

  it("should throw error for invalid structuredContent", async () => {
    const result = await callTool("invalidOutput", { input: "test" });

    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(-32602); // INVALID_PARAMS
    expect(result.error?.message).toContain("invalid structured content");
  });

  it("should skip validation when isError is true", async () => {
    const result = await callTool("errorTool", { input: "test" });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();

    const toolResult = result.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
      structuredContent?: unknown;
    };

    expect(toolResult.isError).toBe(true);
    expect(toolResult.content[0].text).toBe("Error occurred");
    // No error thrown even though structuredContent is missing
  });

  it("should allow structuredContent without outputSchema (unvalidated)", async () => {
    // Register a tool that returns structuredContent but has no outputSchema
    const mcp = new McpServer({
      name: "test",
      version: "1.0.0",
    });

    mcp.tool("unvalidated", {
      handler: () => ({
        content: [{ type: "text", text: "data" }],
        structuredContent: { anything: "goes", here: 123 },
      }),
    });

    const transport = new StreamableHttpTransport();
    const testHandler = transport.bind(mcp);

    const result = await (async () => {
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
            name: "unvalidated",
            arguments: {},
          },
        }),
      });

      const response = await testHandler(request);
      return (await response.json()) as JsonRpcRes;
    })();

    expect(result.error).toBeUndefined();
    const toolResult = result.result as { structuredContent?: unknown };
    expect(toolResult.structuredContent).toEqual({
      anything: "goes",
      here: 123,
    });
  });
});
