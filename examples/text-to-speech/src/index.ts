import type { Serve } from "bun";
import { Hono } from "hono";
import {
  InMemoryClientRequestAdapter,
  InMemorySessionAdapter,
  StreamableHttpTransport,
} from "mcp-lite";
import { mcp } from "./mcp";

// Create HTTP transport with session and client request adapters for
// elicitation support
const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({
    maxEventBufferSize: 1024,
  }),
  clientRequestAdapter: new InMemoryClientRequestAdapter(),
});
const httpHandler = transport.bind(mcp);

const app = new Hono();

app.all("/mcp", async (c) => httpHandler(c.req.raw));

app.get("/", (c) => {
  return c.text("Text-to-speech MCP Server - MCP endpoint available at /mcp");
});

export default {
  fetch: app.fetch,
  idleTimeout: 30,
} satisfies Serve.Options;
