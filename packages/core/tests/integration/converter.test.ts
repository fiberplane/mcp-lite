import { describe, expect, it } from "bun:test";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";
import type { Converter, StandardSchemaV1 } from "../../src/types.js";

const createMockZodSchema = (jsonSchema: unknown): StandardSchemaV1 => {
  const schema: StandardSchemaV1 & { _mockJsonSchema: unknown } = {
    "~standard": {
      version: 1,
      vendor: "zod",
      validate: (value: unknown) => ({ value }),
    },
    _mockJsonSchema: jsonSchema,
  };
  return schema;
};

const mockConverter: Converter = (schema: StandardSchemaV1) => {
  return (
    (schema as unknown as { _mockJsonSchema: unknown })._mockJsonSchema || {
      type: "object",
    }
  );
};

describe("Converter Support", () => {
  it("should convert Standard Schema to JSON Schema for tool wire protocol", async () => {
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

  it("should convert Standard Schema to extract prompt arguments correctly", async () => {
    const mcp = new McpServer({
      name: "prompt-converter-test",
      version: "1.0.0",
      converter: mockConverter,
    });

    const zodSchema = createMockZodSchema({
      type: "object",
      properties: {
        code: { type: "string", description: "The code to review" },
        language: { type: "string", description: "Programming language" },
        strictness: { type: "string", description: "Review strictness" },
      },
      required: ["code"],
    });

    mcp.prompt("codeReview", {
      description: "Generate code review",
      inputSchema: zodSchema,
      handler: () => ({ description: "Review", messages: [] }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(mcp);

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/list",
      }),
    });

    const response = await handler(request);
    const data = await response.json();

    const codeReviewPrompt = data.result.prompts.find(
      (p: { name: string }) => p.name === "codeReview",
    );
    expect(codeReviewPrompt.arguments).toHaveLength(3);
    expect(codeReviewPrompt.arguments).toEqual([
      { name: "code", description: "The code to review", required: true },
      {
        name: "language",
        description: "Programming language",
        required: false,
      },
      { name: "strictness", description: "Review strictness", required: false },
    ]);
  });

  it("should throw clear error when Standard Schema used without converter for tools", () => {
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

  it("should throw clear error when Standard Schema used without converter for prompts", () => {
    const mcp = new McpServer({
      name: "no-converter",
      version: "1.0.0",
    });

    const zodSchema = createMockZodSchema({ type: "object" });

    expect(() => {
      mcp.prompt("test", {
        inputSchema: zodSchema,
        handler: () => ({ messages: [] }),
      });
    }).toThrow(/Cannot use Standard Schema.*vendor: "zod"/);
  });

  it("should work with JSON Schema when no converter provided", async () => {
    const mcp = new McpServer({
      name: "json-only",
      version: "1.0.0",
    });

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

    mcp.prompt("simplePrompt", {
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Input text" },
        },
        required: ["text"],
      },
      handler: () => ({ messages: [] }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(mcp);

    const toolsRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const toolsResponse = await handler(toolsRequest);
    const toolsData = await toolsResponse.json();
    expect(toolsData.result.tools).toHaveLength(1);

    const promptsRequest = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "prompts/list",
      }),
    });

    const promptsResponse = await handler(promptsRequest);
    const promptsData = await promptsResponse.json();
    expect(promptsData.result.prompts).toHaveLength(1);

    const prompt = promptsData.result.prompts[0];
    expect(prompt.arguments).toHaveLength(1);
    expect(prompt.arguments[0]).toEqual({
      name: "text",
      description: "Input text",
      required: true,
    });
  });

  it("should maintain backward compatibility with existing inputSchema", async () => {
    const mcp = new McpServer({
      name: "backward-compatible",
      version: "1.0.0",
    });

    mcp.tool("noSchema", {
      description: "Tool without schema",
      handler: () => ({ content: [{ type: "text", text: "ok" }] }),
    });

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
