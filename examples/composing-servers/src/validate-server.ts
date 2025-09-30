import { McpServer } from "mcp-lite";

// Validation server
export const validateServer = new McpServer({
  name: "validate",
  version: "1.0.0",
})
  // This middleware will only run for the validate server
  .use(async (ctx, next) => {
    console.log("[validate] Request:", ctx.request.method);
    await next();
  })
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
