import { describe, expect, it } from "bun:test";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";
import type { Converter, StandardSchemaV1 } from "../../src/types.js";

// Mock Zod-like Standard Schema
const createMockZodSchema = (jsonSchema: unknown): StandardSchemaV1 => {
  const schema: StandardSchemaV1 & { _mockJsonSchema: unknown } = {
    "~standard": {
      version: 1,
      vendor: "zod",
      validate: (value: unknown) => ({ value }),
    },
    _mockJsonSchema: jsonSchema, // For converter to extract
  };
  return schema;
};

// Mock converter
const mockConverter: Converter = (schema: StandardSchemaV1) => {
  return (
    (schema as unknown as { _mockJsonSchema: unknown })._mockJsonSchema || {
      type: "object",
    }
  );
};

describe("Converter Support", () => {
  it("should convert Standard Schema to JSON Schema for wire protocol", async () => {
    const mcp = new McpServer({
      name: "converter-test",
      version: "1.0.0",
      converter: mockConverter,
    });

    const zodSchema = createMockZodSchema({
      type: "object",
      properties: { value: { type: "number" } },
      required: ["value"],
    });

    mcp.tool("double", {
      description: "Doubles a number",
      inputSchema: zodSchema,
      handler: (args: { value: number }) => ({
        content: [{ type: "text", text: String(args.value * 2) }],
      }),
    });

    // Test that tools/list returns proper JSON Schema
    const transport = new StreamableHttpTransport();
    const handler = transport.bind(mcp);

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const response = await handler(request);
    const data = await response.json();

    const doubleTool = data.result.tools.find(
      (t: { name: string }) => t.name === "double",
    );
    expect(doubleTool.inputSchema).toEqual({
      type: "object",
      properties: { value: { type: "number" } },
      required: ["value"],
    });
  });

  it("should throw clear error when Standard Schema used without converter", () => {
    const mcp = new McpServer({
      name: "no-converter",
      version: "1.0.0",
    });

    const zodSchema = createMockZodSchema({ type: "object" });

    expect(() => {
      mcp.tool("test", {
        inputSchema: zodSchema,
        handler: () => ({ content: [] }),
      });
    }).toThrow(/Cannot use Standard Schema.*vendor: "zod"/);
  });

  it("should work with JSON Schema when no converter provided", async () => {
    const mcp = new McpServer({
      name: "json-only",
      version: "1.0.0",
    });

    // This should work fine
    mcp.tool("add", {
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
      handler: (args: { a: number; b: number }) => ({
        content: [{ type: "text", text: String(args.a + args.b) }],
      }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(mcp);

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const response = await handler(request);
    const data = await response.json();

    expect(data.result.tools).toHaveLength(1);
  });

  it("should maintain backward compatibility with existing inputSchema", async () => {
    const mcp = new McpServer({
      name: "backward-compatible",
      version: "1.0.0",
    });

    // Test with no inputSchema (should use default)
    mcp.tool("noSchema", {
      description: "Tool without schema",
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    // Test with JSON Schema
    mcp.tool("jsonSchema", {
      inputSchema: {
        type: "object",
        properties: { test: { type: "string" } },
      },
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(mcp);

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const response = await handler(request);
    const data = await response.json();

    expect(data.result.tools).toHaveLength(2);

    const noSchemaTool = data.result.tools.find(
      (t: { name: string }) => t.name === "noSchema",
    );
    expect(noSchemaTool.inputSchema).toEqual({ type: "object" });

    const jsonSchemaTool = data.result.tools.find(
      (t: { name: string }) => t.name === "jsonSchema",
    );
    expect(jsonSchemaTool.inputSchema).toEqual({
      type: "object",
      properties: { test: { type: "string" } },
    });
  });
});
