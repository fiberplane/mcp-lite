import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  InMemoryClientRequestAdapter,
  InMemorySessionAdapter,
  McpServer,
  StreamableHttpTransport,
} from "../../src/index.js";

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

function createTestHandler() {
  const mcp = new McpServer({
    name: "metadata-test-server",
    version: "1.0.0",
    schemaAdapter: (s) => z.toJSONSchema(s as z.ZodType),
  });

  // Tool with _meta and title
  mcp.tool("tool-with-metadata", {
    description: "A tool with metadata fields",
    title: "Tool With Metadata",
    _meta: {
      customField: "customValue",
      version: 2,
      tags: ["test", "metadata"],
    },
    inputSchema: z.object({ input: z.string() }),
    handler: async (args) => ({
      content: [{ type: "text", text: `Received: ${args.input}` }],
      _meta: {
        executionTime: 123,
        cached: false,
      },
    }),
  });

  // Tool without _meta or title (backwards compatibility)
  mcp.tool("tool-without-metadata", {
    description: "A tool without metadata fields",
    inputSchema: z.object({ input: z.string() }),
    handler: async (args) => ({
      content: [{ type: "text", text: `Received: ${args.input}` }],
    }),
  });

  // Prompt with _meta and title
  mcp.prompt("prompt-with-metadata", {
    description: "A prompt with metadata fields",
    title: "Prompt With Metadata",
    _meta: {
      category: "test",
      priority: 1,
      experimental: true,
    },
    arguments: [
      { name: "topic", description: "Topic to discuss", required: true },
    ],
    handler: (args: { topic: string }) => ({
      description: "Test prompt",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Let's discuss ${args.topic}`,
          },
        },
      ],
      _meta: {
        templateVersion: "2.0",
        generated: true,
      },
    }),
  });

  // Prompt without _meta (backwards compatibility)
  mcp.prompt("prompt-without-metadata", {
    description: "A prompt without metadata fields",
    handler: () => ({
      description: "Simple prompt",
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: "Hello" },
        },
      ],
    }),
  });

  // Static resource with _meta
  mcp.resource(
    "test://static-resource",
    {
      name: "Static Resource",
      description: "A static resource with metadata",
      mimeType: "text/plain",
      _meta: {
        source: "test",
        version: "1.0.0",
      },
    },
    async () => ({
      contents: [
        {
          uri: "test://static-resource",
          type: "text",
          text: "Static resource content",
        },
      ],
    }),
  );

  // Resource template with _meta
  mcp.resource(
    "test://items/{id}",
    {
      name: "Item Resource",
      description: "A templated resource with metadata",
      mimeType: "application/json",
      _meta: {
        templateType: "item",
        cacheable: false,
      },
    },
    {},
    async (uri, vars) => ({
      contents: [
        {
          uri: uri.toString(),
          type: "text",
          text: JSON.stringify({ id: vars.id }),
        },
      ],
    }),
  );

  const clientRequestAdapter = new InMemoryClientRequestAdapter();
  const sessionAdapter = new InMemorySessionAdapter({
    maxEventBufferSize: 1024,
  });

  const transport = new StreamableHttpTransport({
    clientRequestAdapter,
    sessionAdapter,
  });

  return transport.bind(mcp);
}

describe("Metadata Passthrough Tests", () => {
  let handler: (request: Request) => Promise<Response>;
  let sessionId: string;

  beforeEach(async () => {
    handler = createTestHandler();

    // Initialize session
    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: {},
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    sessionId = initResponse.headers.get("mcp-session-id") as string;
    expect(sessionId).toBeTruthy();
  });

  describe("Tool metadata passthrough", () => {
    it("should include _meta and title in tools/list response", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-tools",
            method: "tools/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const tools = (
        result.result as {
          tools: Array<{
            name: string;
            description?: string;
            title?: string;
            _meta?: { [key: string]: unknown };
          }>;
        }
      ).tools;

      const toolWithMeta = tools.find((t) => t.name === "tool-with-metadata");
      expect(toolWithMeta).toBeDefined();
      expect(toolWithMeta?.title).toBe("Tool With Metadata");
      expect(toolWithMeta?._meta).toEqual({
        customField: "customValue",
        version: 2,
        tags: ["test", "metadata"],
      });

      const toolWithoutMeta = tools.find(
        (t) => t.name === "tool-without-metadata",
      );
      expect(toolWithoutMeta).toBeDefined();
      expect(toolWithoutMeta?.title).toBeUndefined();
      expect(toolWithoutMeta?._meta).toBeUndefined();
    });
  });

  describe("Prompt metadata passthrough", () => {
    it("should include _meta and title in prompts/list response", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-prompts",
            method: "prompts/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const prompts = (
        result.result as {
          prompts: Array<{
            name: string;
            description?: string;
            title?: string;
            _meta?: { [key: string]: unknown };
          }>;
        }
      ).prompts;

      const promptWithMeta = prompts.find(
        (p) => p.name === "prompt-with-metadata",
      );
      expect(promptWithMeta).toBeDefined();
      expect(promptWithMeta?.title).toBe("Prompt With Metadata");
      expect(promptWithMeta?._meta).toEqual({
        category: "test",
        priority: 1,
        experimental: true,
      });

      const promptWithoutMeta = prompts.find(
        (p) => p.name === "prompt-without-metadata",
      );
      expect(promptWithoutMeta).toBeDefined();
      expect(promptWithoutMeta?.title).toBeUndefined();
      expect(promptWithoutMeta?._meta).toBeUndefined();
    });
  });

  describe("Resource metadata passthrough", () => {
    it("should include _meta in resources/list response", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-resources",
            method: "resources/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const resources = (
        result.result as {
          resources: Array<{
            uri: string;
            name?: string;
            _meta?: { [key: string]: unknown };
          }>;
        }
      ).resources;

      const staticResource = resources.find(
        (r) => r.uri === "test://static-resource",
      );
      expect(staticResource).toBeDefined();
      expect(staticResource?._meta).toEqual({
        source: "test",
        version: "1.0.0",
      });
    });

    it("should include _meta in resourceTemplates/list response", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-templates",
            method: "resources/templates/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const templates = (
        result.result as {
          resourceTemplates: Array<{
            uriTemplate: string;
            name?: string;
            _meta?: { [key: string]: unknown };
          }>;
        }
      ).resourceTemplates;

      const itemTemplate = templates.find(
        (t) => t.uriTemplate === "test://items/{id}",
      );
      expect(itemTemplate).toBeDefined();
      expect(itemTemplate?._meta).toEqual({
        templateType: "item",
        cacheable: false,
      });
    });
  });

  describe("Response _meta fields", () => {
    it("should include _meta in tool call results", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "call-tool",
            method: "tools/call",
            params: {
              name: "tool-with-metadata",
              arguments: { input: "test" },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const toolResult = result.result as {
        content: Array<unknown>;
        _meta?: { [key: string]: unknown };
      };
      expect(toolResult._meta).toEqual({
        executionTime: 123,
        cached: false,
      });
    });

    it("should include _meta in prompt get results", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "get-prompt",
            method: "prompts/get",
            params: {
              name: "prompt-with-metadata",
              arguments: { topic: "testing" },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const promptResult = result.result as {
        messages: Array<unknown>;
        _meta?: { [key: string]: unknown };
      };
      expect(promptResult._meta).toEqual({
        templateVersion: "2.0",
        generated: true,
      });
    });
  });

  describe("Backwards compatibility", () => {
    it("should allow tools without _meta or title", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-tools",
            method: "tools/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const tools = (result.result as { tools: Array<{ name: string }> }).tools;
      expect(
        tools.find((t) => t.name === "tool-without-metadata"),
      ).toBeDefined();
    });

    it("should allow prompts without _meta", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "mcp-session-id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-prompts",
            method: "prompts/list",
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const prompts = (result.result as { prompts: Array<{ name: string }> })
        .prompts;
      expect(
        prompts.find((p) => p.name === "prompt-without-metadata"),
      ).toBeDefined();
    });
  });
});
