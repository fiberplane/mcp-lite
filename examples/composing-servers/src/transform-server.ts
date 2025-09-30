import { McpServer } from "mcp-lite";

// Transform server
export const transformServer = new McpServer({
  name: "transform",
  version: "1.0.0",
})
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
