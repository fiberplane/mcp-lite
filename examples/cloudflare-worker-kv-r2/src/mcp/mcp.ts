import { env } from "cloudflare:workers";
import { toJsonSchema } from "@valibot/to-json-schema";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import * as v from "valibot";
import { CloudflareKVClientRequestAdapter } from "./client-request-adapter";
import { CloudflareKVSessionAdapter } from "./session-adapter";

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

const transport = new StreamableHttpTransport({
  sessionAdapter: new CloudflareKVSessionAdapter({
    kv: env.SESSIONS_KV,
    maxEventBufferSize: 1000,
    keyPrefix: "mcp-session:",
  }),
  clientRequestAdapter: new CloudflareKVClientRequestAdapter(
    env.PENDING_REQUESTS_KV,
    30000, // 30s timeout
    1000, // 1s poll interval
  ),
});
const httpHandler = transport.bind(mcpServer);

export { httpHandler };
