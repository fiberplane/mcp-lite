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

mcpServer.tool("delete-kv", {
  description: "Deletes a value from the KV store",
  inputSchema: v.object({
    key: v.string(),
  }),
  handler: async (args, ctx) => {
    if (!ctx.client.supports("elicitation")) {
      throw new Error("This tool requires a client that supports elicitation");
    }

    const response = await ctx.elicit({
      message: `Are you sure you want to delete record "${args.key}" from the KV store? This action cannot be undone.`,
      schema: v.object({
        confirmed: v.boolean(),
      }),
    });

    if (response.action === "decline") {
      return {
        content: [{ type: "text", text: "Value not deleted" }],
      };
    }

    if (response.action === "accept") {
      await env.KV.delete(args.key);

      return {
        content: [{ type: "text", text: "Value deleted" }],
      };
    }

    if (response.action === "cancel") {
      throw new Error("Operation was cancelled");
    }

    return {
      content: [{ type: "text", text: "Value not deleted" }],
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
