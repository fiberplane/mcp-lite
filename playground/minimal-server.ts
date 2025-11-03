import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";

const mcp = new McpServer({
  name: "example-server",
  version: "1.0.0",
});

mcp.use(async (c, n) => {
  console.log("MCP request received:", c);
  await n();
});

// Add a simple echo tool
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
  handler: (args: { message: string }) => ({
    content: [{ type: "text", text: args.message }],
  }),
});

mcp.tool("test", {
  description: "Test tool",
  handler: () => ({
    content: [{ type: "text", text: "test" }],
  }),
});

// Add a math tool
mcp.tool("add", {
  description: "Adds two numbers",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
  handler: (args: { a: number; b: number }) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
  }),
});

// Demonstrate uiResource: a raw HTML card
mcp.uiResource({
  type: "rawHtml",
  name: "welcome-card",
  title: "Welcome Card",
  description: "Simple welcome widget rendered as HTML",
  htmlContent: `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;">
      <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
        <h1 style="margin:0 0 8px 0;font-size:20px;">Welcome!</h1>
        <p style="margin:0;color:#6b7280;">This widget is served by mcp-lite uiResource()</p>
      </div>
    </div>
  `,
});

// Demonstrate uiResource: a remote DOM script widget
mcp.uiResource({
  type: "remoteDom",
  name: "quick-poll",
  title: "Quick Poll",
  description: "Interactive buttons rendered via script",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Poll question" },
    },
    required: ["question"],
  },
  script: `
    const h2 = document.createElement('h2');
    h2.textContent = (window.openai?.toolInput?.question ?? 'Do you like this demo?');
    h2.style.margin = '12px 0';
    h2.style.fontSize = '18px';
    root.appendChild(h2);
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    const mkBtn = (label) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.padding = '8px 12px';
      b.style.border = '1px solid #e5e7eb';
      b.style.borderRadius = '8px';
      b.style.cursor = 'pointer';
      b.onclick = () => { b.textContent = label + ' ✓'; };
      return b;
    };
    wrap.appendChild(mkBtn('Yes'));
    wrap.appendChild(mkBtn('No'));
    root.appendChild(wrap);
  `,
  size: ["500px", "220px"],
});

// Create HTTP transport in stateless mode (no session adapter)
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Create Hono app
const app = new Hono();

// Add MCP endpoint
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

// Add a simple health check
app.get("/health", (c) => {
  return c.json({ status: "ok", server: "example-mcp-server" });
});

const port = 3001;

export default app;

// If running directly (not imported), start the server
if (import.meta.main) {
  console.log(`Starting MCP server on port ${port}...`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  Bun.serve({
    port: 3001,
    fetch: app.fetch,
  });
}
