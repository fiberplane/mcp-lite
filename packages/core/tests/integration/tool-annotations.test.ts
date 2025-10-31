import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";

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
    name: "annotations-test-server",
    version: "1.0.0",
    schemaAdapter: (s) => z.toJSONSchema(s as z.ZodType),
  });

  // Read-only tool with annotations
  mcp.tool("getConfig", {
    description: "Retrieves configuration settings",
    annotations: {
      readOnlyHint: true,
      audience: ["assistant"],
      priority: 0.8,
      title: "Get Configuration",
    },
    inputSchema: z.object({}),
    handler: () => ({
      content: [{ type: "text", text: JSON.stringify({ setting: "value" }) }],
    }),
  });

  // Destructive tool with annotations
  mcp.tool("deleteDatabase", {
    description: "Permanently deletes the database",
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
      audience: ["user"],
      priority: 0.3,
      openWorldHint: true,
      idempotentHint: false,
    },
    inputSchema: z.object({ confirm: z.boolean() }),
    handler: (args) => ({
      content: [
        {
          type: "text",
          text: args.confirm ? "Database deleted" : "Deletion cancelled",
        },
      ],
    }),
  });

  // Idempotent tool with annotations
  mcp.tool("setConfig", {
    description: "Updates a configuration value",
    annotations: {
      idempotentHint: true,
      readOnlyHint: false,
      priority: 0.5,
      lastModified: "2025-01-15T10:00:00Z",
    },
    inputSchema: z.object({ key: z.string(), value: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: `Set ${args.key} to ${args.value}` }],
    }),
  });

  // Tool with only base annotations (no behavioral hints)
  mcp.tool("queryData", {
    description: "Queries data from external source",
    annotations: {
      audience: ["assistant", "user"],
      priority: 0.7,
    },
    inputSchema: z.object({ query: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: `Query results for: ${args.query}` }],
    }),
  });

  // Tool without any annotations (backwards compatibility)
  mcp.tool("simpleEcho", {
    description: "Simple echo without annotations",
    inputSchema: z.object({ message: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: args.message }],
    }),
  });

  // Tool with open world hint
  mcp.tool("fetchWebPage", {
    description: "Fetches content from a web page",
    annotations: {
      openWorldHint: true,
      readOnlyHint: true,
      audience: ["assistant"],
    },
    inputSchema: z.object({ url: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: `Content from ${args.url}` }],
    }),
  });

  const transport = new StreamableHttpTransport();

  return transport.bind(mcp);
}

describe("Tool Annotations Tests", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    handler = createTestHandler();
  });

  describe("Tool annotations in tools/list", () => {
    it("should include full annotations for read-only tool", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: {
              readOnlyHint?: boolean;
              destructiveHint?: boolean;
              idempotentHint?: boolean;
              openWorldHint?: boolean;
              audience?: string[];
              priority?: number;
              lastModified?: string;
              title?: string;
            };
          }>;
        }
      ).tools;

      const getConfigTool = tools.find((t) => t.name === "getConfig");
      expect(getConfigTool).toBeDefined();
      expect(getConfigTool?.annotations).toEqual({
        readOnlyHint: true,
        audience: ["assistant"],
        priority: 0.8,
        title: "Get Configuration",
      });
    });

    it("should include annotations for destructive tool", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: {
              readOnlyHint?: boolean;
              destructiveHint?: boolean;
              idempotentHint?: boolean;
              openWorldHint?: boolean;
              audience?: string[];
              priority?: number;
            };
          }>;
        }
      ).tools;

      const deleteTool = tools.find((t) => t.name === "deleteDatabase");
      expect(deleteTool).toBeDefined();
      expect(deleteTool?.annotations).toEqual({
        destructiveHint: true,
        readOnlyHint: false,
        audience: ["user"],
        priority: 0.3,
        openWorldHint: true,
        idempotentHint: false,
      });
    });

    it("should include annotations with lastModified timestamp", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: {
              idempotentHint?: boolean;
              readOnlyHint?: boolean;
              priority?: number;
              lastModified?: string;
            };
          }>;
        }
      ).tools;

      const setConfigTool = tools.find((t) => t.name === "setConfig");
      expect(setConfigTool).toBeDefined();
      expect(setConfigTool?.annotations).toEqual({
        idempotentHint: true,
        readOnlyHint: false,
        priority: 0.5,
        lastModified: "2025-01-15T10:00:00Z",
      });
    });

    it("should include annotations with multiple audience values", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: {
              audience?: string[];
              priority?: number;
            };
          }>;
        }
      ).tools;

      const queryTool = tools.find((t) => t.name === "queryData");
      expect(queryTool).toBeDefined();
      expect(queryTool?.annotations).toEqual({
        audience: ["assistant", "user"],
        priority: 0.7,
      });
    });

    it("should include openWorldHint annotation", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: {
              openWorldHint?: boolean;
              readOnlyHint?: boolean;
              audience?: string[];
            };
          }>;
        }
      ).tools;

      const fetchTool = tools.find((t) => t.name === "fetchWebPage");
      expect(fetchTool).toBeDefined();
      expect(fetchTool?.annotations).toEqual({
        openWorldHint: true,
        readOnlyHint: true,
        audience: ["assistant"],
      });
    });
  });

  describe("Backwards compatibility", () => {
    it("should allow tools without annotations", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
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
            annotations?: unknown;
          }>;
        }
      ).tools;

      const simpleEcho = tools.find((t) => t.name === "simpleEcho");
      expect(simpleEcho).toBeDefined();
      expect(simpleEcho?.annotations).toBeUndefined();
    });
  });

  describe("Tool execution with annotations", () => {
    it("should execute read-only tool successfully", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "call-tool",
            method: "tools/call",
            params: {
              name: "getConfig",
              arguments: {},
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const toolResult = result.result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0].text).toContain("setting");
    });

    it("should execute destructive tool successfully", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "call-tool",
            method: "tools/call",
            params: {
              name: "deleteDatabase",
              arguments: { confirm: true },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();

      const toolResult = result.result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0].text).toBe("Database deleted");
    });
  });

  describe("Annotation field types", () => {
    it("should accept boolean hints", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-tools",
            method: "tools/list",
          }),
        }),
      );

      const result = (await response.json()) as JsonRpcResponse;
      const tools = (result.result as { tools: Array<{ name: string }> }).tools;

      expect(tools.length).toBeGreaterThan(0);
    });

    it("should accept priority as number", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-tools",
            method: "tools/list",
          }),
        }),
      );

      const result = (await response.json()) as JsonRpcResponse;
      const tools = (
        result.result as {
          tools: Array<{
            name: string;
            annotations?: { priority?: number };
          }>;
        }
      ).tools;

      const getConfigTool = tools.find((t) => t.name === "getConfig");
      expect(typeof getConfigTool?.annotations?.priority).toBe("number");
      expect(getConfigTool?.annotations?.priority).toBe(0.8);
    });

    it("should accept audience as array of strings", async () => {
      const response = await handler(
        new Request("http://localhost:3000/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-tools",
            method: "tools/list",
          }),
        }),
      );

      const result = (await response.json()) as JsonRpcResponse;
      const tools = (
        result.result as {
          tools: Array<{
            name: string;
            annotations?: { audience?: string[] };
          }>;
        }
      ).tools;

      const getConfigTool = tools.find((t) => t.name === "getConfig");
      expect(Array.isArray(getConfigTool?.annotations?.audience)).toBe(true);
      expect(getConfigTool?.annotations?.audience).toEqual(["assistant"]);
    });
  });
});
