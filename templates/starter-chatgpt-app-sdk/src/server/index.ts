import { Hono } from "hono";
import { cors } from "hono/cors";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  ItemListOutputSchema,
  ItemDetailOutputSchema,
  type Item,
  type ItemListOutput,
  type ItemDetailOutput,
} from "../types";

// IMPORTANT: ChatGPT widgets require a publicly accessible HTTPS URL (localhost is NOT supported)
const HOST_URL = process.env.HOST_URL || (() => {
  throw new Error("HOST_URL environment variable is required. ChatGPT widgets do not support localhost.");
})();

// Single widget URI for all tools
const WIDGET_URI = "ui://widget/index.html";

// Helper function to load widget HTML (reads pre-built HTML from dist/)
function loadWidgetHtml(): string {
  const htmlPath = resolve(process.cwd(), "dist/index.html");
  return readFileSync(htmlPath, "utf-8");
}

// Helper function to create widget metadata
function widgetMeta(invoking?: string, invoked?: string) {
  return {
    "openai/outputTemplate": WIDGET_URI,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

// Initialize MCP server
const mcp = new McpServer({
  name: "demo-widget-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

// In-memory data store
const items: Record<string, Item> = {};

// Tool 1: List all items
mcp.tool("list_items", {
  description: "List all items",
  inputSchema: z.object({}),
  outputSchema: ItemListOutputSchema,
  _meta: widgetMeta("Loading items", "Loaded items"),
  handler: async () => {
    const itemList = Object.values(items);

    return {
      structuredContent: {
        kind: "item_list",
        items: itemList,
      } as ItemListOutput,
      content: [
        {
          type: "text",
          text: `Found ${itemList.length} item${itemList.length === 1 ? "" : "s"}`,
        },
      ],
      _meta: widgetMeta(),
    };
  },
});

// Tool 2: Add a new item
mcp.tool("add_item", {
  description: "Add a new item",
  inputSchema: z.object({
    title: z.string().describe("Item title"),
    description: z.string().describe("Item description"),
  }),
  outputSchema: ItemDetailOutputSchema,
  _meta: widgetMeta("Adding item", "Added item"),
  handler: async (args) => {
    const newItem: Item = {
      id: Math.random().toString(36).substring(7),
      title: args.title,
      description: args.description,
      createdAt: new Date().toISOString(),
    };

    items[newItem.id] = newItem;

    return {
      structuredContent: {
        kind: "item_detail",
        ...newItem,
      } as ItemDetailOutput,
      content: [
        {
          type: "text",
          text: `Added "${newItem.title}"`,
        },
      ],
      _meta: widgetMeta(),
    };
  },
});

// Register widget resource
mcp.resource(
  WIDGET_URI,
  {
    name: "Widget",
    description: "Interactive widget for items",
    mimeType: "text/html+skybridge",
  },
  async (uri) => {
    const html = loadWidgetHtml();

    return {
      contents: [
        {
          uri: uri.href,
          type: "text",
          text: html,
          mimeType: "text/html+skybridge",
          _meta: {
            ...widgetMeta(),
            "openai/widgetCSP": {
              connect_domains: [HOST_URL],
              resource_domains: [HOST_URL],
            },
          },
        },
      ],
    };
  },
);

// Create HTTP transport for MCP
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Create Hono app
const app = new Hono();

// MCP endpoint
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

// Serve static assets from dist/ with CORS headers
app.use("/*", cors());
app.use("/*", serveStatic({ root: "./dist" }));

export default app;
