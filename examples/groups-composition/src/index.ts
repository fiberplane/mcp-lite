import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";

// Validation server
const validateServer = new McpServer({ name: "validate", version: "1.0.0" })
  .tool("email", {
    description: "Check if string is valid email",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.value);
      return {
        content: [{ type: "text", text: isValid ? "valid" : "invalid" }],
      };
    },
  })
  .tool("url", {
    description: "Check if string is valid URL",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      try {
        new URL(args.value);
        return { content: [{ type: "text", text: "valid" }] };
      } catch {
        return { content: [{ type: "text", text: "invalid" }] };
      }
    },
  })
  .tool("json", {
    description: "Check if string is valid JSON",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      try {
        JSON.parse(args.value);
        return { content: [{ type: "text", text: "valid" }] };
      } catch {
        return { content: [{ type: "text", text: "invalid" }] };
      }
    },
  });

// Transform server
const transformServer = new McpServer({ name: "transform", version: "1.0.0" })
  .tool("camelCase", {
    description: "Convert string to camelCase",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      const camel = args.value
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
      return { content: [{ type: "text", text: camel }] };
    },
  })
  .tool("snakeCase", {
    description: "Convert string to snake_case",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      const snake = args.value
        .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      return { content: [{ type: "text", text: snake }] };
    },
  })
  .tool("base64Encode", {
    description: "Encode string to base64",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      const encoded = btoa(args.value);
      return { content: [{ type: "text", text: encoded }] };
    },
  })
  .tool("base64Decode", {
    description: "Decode base64 string",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
    handler: (args: { value: string }) => {
      try {
        const decoded = atob(args.value);
        return { content: [{ type: "text", text: decoded }] };
      } catch {
        throw new Error("Invalid base64 string");
      }
    },
  });

// Format server
const formatServer = new McpServer({ name: "format", version: "1.0.0" })
  .tool("json", {
    description: "Pretty-print JSON with indentation",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
        indent: { type: "number" },
      },
      required: ["value"],
    },
    handler: (args: { value: string; indent?: number }) => {
      try {
        const parsed = JSON.parse(args.value);
        const formatted = JSON.stringify(parsed, null, args.indent || 2);
        return { content: [{ type: "text", text: formatted }] };
      } catch {
        throw new Error("Invalid JSON");
      }
    },
  })
  .tool("bytes", {
    description: "Format bytes to human-readable size",
    inputSchema: {
      type: "object",
      properties: {
        bytes: { type: "number" },
      },
      required: ["bytes"],
    },
    handler: (args: { bytes: number }) => {
      const units = ["B", "KB", "MB", "GB", "TB"];
      let size = args.bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return {
        content: [
          { type: "text", text: `${size.toFixed(2)} ${units[unitIndex]}` },
        ],
      };
    },
  });

// Parent server with request tracking
const mcp = new McpServer({ name: "data-utils", version: "1.0.0" })
  .use(async (ctx, next) => {
    const method = (ctx.request as { method?: string }).method || "unknown";
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`[${method}] completed in ${duration}ms`);
  })
  .group("validate", validateServer)
  .group("transform", transformServer)
  .group("format", formatServer);

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono();

app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

app.get("/", (c) => {
  return c.json({
    message: "Data Utilities MCP Server - Groups Composition Example",
    description:
      "Three independent servers (validate, transform, format) composed into " +
      "a single MCP endpoint. Pure JavaScript, works in any environment.",
    endpoints: {
      mcp: "/mcp",
    },
    tools: {
      validate: ["email", "url", "json"],
      transform: ["camelCase", "snakeCase", "base64Encode", "base64Decode"],
      format: ["json", "bytes"],
    },
  });
});

export default app;
