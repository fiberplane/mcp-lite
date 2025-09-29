import { env } from "cloudflare:workers";
import { toJsonSchema } from "@valibot/to-json-schema";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import * as v from "valibot";

export const mcpServer = new McpServer({
  name: "cloudflare-worker-kv",
  version: "1.0.0",
  schemaAdapter: (schema) => toJsonSchema(schema as v.AnySchema),
});

mcpServer.tool("get-kv", {
  description: "Gets a value from the KV store",
  inputSchema: v.object({
    key: v.string(),
  }),
  handler: async (args) => {
    const value = await env.KV.get(args.key);

    if (value === null) {
      return {
        content: [{ type: "text", text: "Key not found" }],
      };
    }

    return {
      content: [{ type: "text", text: value }],
    };
  },
});

mcpServer.tool("put-kv", {
  description: "Puts a value into the KV store",
  inputSchema: v.object({
    key: v.string(),
    value: v.string(),
  }),
  handler: async (args) => {
    await env.KV.put(args.key, args.value);

    return {
      content: [{ type: "text", text: "Value put" }],
    };
  },
});

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcpServer);

export { httpHandler };
