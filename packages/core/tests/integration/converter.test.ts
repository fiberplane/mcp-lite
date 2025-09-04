import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";
import type { Converter } from "../../src/types.js";

// Practical Zod to JSON Schema converter for testing
// In a real implementation, you'd use a library like zod-to-json-schema
const zodToJsonSchema: Converter = (zodSchema: any) => {
  // Handle Zod object schemas
  if (zodSchema.def?.type === "object" && zodSchema.def.shape) {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Static mapping for test schemas - in practice you'd parse the actual schema
    const descriptions: Record<string, Record<string, string>> = {
      search: {
        query: "Search query",
        limit: "Maximum results",
        category: "Search category",
      },
      codeReview: {
        code: "Code to review",
        language: "Programming language",
        severity: "Review severity",
      },
      fileSearch: {
        pattern: "File name pattern or regex",
        directory: "Directory to search in",
        maxDepth: "Maximum search depth",
        fileType: "Type of files to find",
        caseSensitive: "Case sensitive search",
      },
    };

    // Try to determine which schema we're converting by checking the field names
    let schemaType = "";
    const fieldNames = Object.keys(zodSchema.def.shape);
    if (fieldNames.includes("query") && fieldNames.includes("category")) {
      schemaType = "search";
    } else if (fieldNames.includes("code") && fieldNames.includes("severity")) {
      schemaType = "codeReview";
    }

    for (const [key, field] of Object.entries(zodSchema.def.shape)) {
      const fieldSchema = field as any;
      const desc = descriptions[schemaType]?.[key];

      if (fieldSchema.def?.type === "string") {
        properties[key] = { type: "string" };
        if (desc) properties[key].description = desc;
        required.push(key);
      } else if (fieldSchema.def?.type === "number") {
        properties[key] = { type: "number" };
        if (desc) properties[key].description = desc;
        required.push(key);
      } else if (fieldSchema.def?.type === "enum") {
        properties[key] = {
          type: "string",
          enum:
            fieldSchema.options || Object.values(fieldSchema.def.entries || {}),
        };
        if (desc) properties[key].description = desc;
        required.push(key);
      } else if (fieldSchema.def?.type === "optional") {
        const innerType = fieldSchema.def.innerType;
        if (innerType?.def?.type === "string") {
          properties[key] = { type: "string" };
        } else if (innerType?.def?.type === "number") {
          properties[key] = { type: "number" };
        } else if (innerType?.def?.type === "enum") {
          properties[key] = {
            type: "string",
            enum:
              innerType.options || Object.values(innerType.def.entries || {}),
          };
        }
        if (desc) properties[key].description = desc;
        // Optional fields are not added to required
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 && { required }),
    };
  }

  return { type: "object" };
};

describe("End-to-End Converter Integration", () => {
  it("registers tool with Zod schema → tools/list returns proper JSON Schema to client", async () => {
    const server = new McpServer({
      name: "test-server",
      version: "1.0.0",
      converter: zodToJsonSchema,
    });

    // Register tool with realistic Zod schema
    const searchSchema = z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Maximum results"),
      category: z.enum(["all", "docs", "code"]).describe("Search category"),
    });

    server.tool("search", {
      description: "Search for content",
      inputSchema: searchSchema,
      handler: (args: z.infer<typeof searchSchema>) => ({
        content: [{ type: "text", text: `Found results for: ${args.query}` }],
      }),
    });

    // Simulate MCP client calling tools/list
    const transport = new StreamableHttpTransport();
    const handler = transport.bind(server);

    const response = await handler(
      new Request("http://test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "test-1",
          method: "tools/list",
        }),
      }),
    );

    // Verify client receives proper tool schema information
    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe("test-1");
    expect(data.result.tools).toHaveLength(1);

    const searchTool = data.result.tools[0];
    expect(searchTool.name).toBe("search");
    expect(searchTool.description).toBe("Search for content");
    expect(searchTool.inputSchema).toEqual({
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results" },
        category: {
          type: "string",
          enum: ["all", "docs", "code"],
          description: "Search category",
        },
      },
      required: ["query", "category"],
    });
  });

  it("registers prompt with Zod schema → prompts/list returns proper argument metadata to client", async () => {
    const server = new McpServer({
      name: "prompt-server",
      version: "1.0.0",
      converter: zodToJsonSchema,
    });

    // Register prompt with Zod schema
    const reviewSchema = z.object({
      code: z.string().describe("Code to review"),
      language: z.string().optional().describe("Programming language"),
      severity: z
        .enum(["strict", "moderate", "gentle"])
        .describe("Review severity"),
    });

    server.prompt("codeReview", {
      description: "Generate code review",
      inputSchema: reviewSchema,
      handler: (args: z.infer<typeof reviewSchema>) => ({
        description: "Code review prompt",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review this ${args.language} code: ${args.code}`,
            },
          },
        ],
      }),
    });

    // Simulate MCP client calling prompts/list
    const transport = new StreamableHttpTransport();
    const handler = transport.bind(server);

    const response = await handler(
      new Request("http://test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "prompt-1",
          method: "prompts/list",
        }),
      }),
    );

    // Verify client receives proper prompt argument information
    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe("prompt-1");
    expect(data.result.prompts).toHaveLength(1);

    const reviewPrompt = data.result.prompts[0];
    expect(reviewPrompt.name).toBe("codeReview");
    expect(reviewPrompt.description).toBe("Generate code review");
    expect(reviewPrompt.arguments).toEqual([
      { name: "code", description: "Code to review", required: true },
      {
        name: "language",
        description: "Programming language",
        required: false,
      },
      { name: "severity", description: "Review severity", required: true },
    ]);
  });

  it("demonstrates complex tool scenario → file search with multiple options", async () => {
    const server = new McpServer({
      name: "file-server",
      version: "1.0.0",
      converter: zodToJsonSchema,
    });

    // More complex realistic schema showing the value proposition
    const fileSearchSchema = z.object({
      pattern: z.string().describe("File name pattern or regex"),
      directory: z.string().optional().describe("Directory to search in"),
      maxDepth: z.number().optional().describe("Maximum search depth"),
      fileType: z
        .enum(["all", "files", "directories"])
        .describe("Type of files to find"),
      caseSensitive: z.boolean().optional().describe("Case sensitive search"),
    });

    server.tool("fileSearch", {
      description: "Search for files and directories",
      inputSchema: fileSearchSchema,
      handler: (args: z.infer<typeof fileSearchSchema>) => ({
        content: [
          {
            type: "text",
            text: `Searching for ${args.pattern} in ${args.directory || "current directory"}`,
          },
        ],
      }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(server);

    const response = await handler(
      new Request("http://test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "file-1",
          method: "tools/list",
        }),
      }),
    );

    const data = await response.json();
    expect(data.result.tools).toHaveLength(1);

    const fileSearchTool = data.result.tools[0];
    expect(fileSearchTool.name).toBe("fileSearch");
    expect(fileSearchTool.inputSchema.properties).toHaveProperty("pattern");
    expect(fileSearchTool.inputSchema.properties).toHaveProperty("directory");
    expect(fileSearchTool.inputSchema.properties).toHaveProperty("fileType");
    expect(fileSearchTool.inputSchema.required).toContain("pattern");
    expect(fileSearchTool.inputSchema.required).toContain("fileType");
    expect(fileSearchTool.inputSchema.required).not.toContain("directory");
  });

  it("fails clearly when Zod schema used without converter", () => {
    const server = new McpServer({
      name: "no-converter-server",
      version: "1.0.0",
      // No converter provided
    });

    const schema = z.object({ query: z.string() });

    expect(() => {
      server.tool("search", {
        inputSchema: schema,
        handler: () => ({ content: [] }),
      });
    }).toThrow(/Cannot use Standard Schema.*without a converter/);
  });

  it("works normally with JSON Schema when no converter needed", async () => {
    const server = new McpServer({
      name: "json-server",
      version: "1.0.0",
      // No converter needed for JSON Schema
    });

    server.tool("calculate", {
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["a", "b"],
      },
      handler: (args: { a: number; b: number }) => ({
        content: [{ type: "text", text: String(args.a + args.b) }],
      }),
    });

    const transport = new StreamableHttpTransport();
    const handler = transport.bind(server);

    const response = await handler(
      new Request("http://test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "json-1",
          method: "tools/list",
        }),
      }),
    );

    const data = await response.json();
    const calcTool = data.result.tools[0];
    expect(calcTool.inputSchema).toEqual({
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    });
  });
});
