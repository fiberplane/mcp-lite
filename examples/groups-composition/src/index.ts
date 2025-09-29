import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";

// Git server with middleware tracking and error handling
const gitServer = new McpServer({ name: "git", version: "1.0.0" })
  .use(async (ctx, next) => {
    // Track git operations in context state
    ctx.state.gitOperationStart = Date.now();
    console.log("[git middleware] Starting git operation");
    await next();
    const duration = Date.now() - (ctx.state.gitOperationStart as number);
    console.log(`[git middleware] Completed in ${duration}ms`);
  })
  .tool("clone", {
    description: "Clone a git repository",
    handler: async (args: { url: string }, ctx) => {
      // Validate URL format
      if (!args.url.startsWith("https://")) {
        throw new Error("Only HTTPS URLs are supported");
      }

      // Simulate progress reporting if available
      if (ctx.progress) {
        await ctx.progress({ progress: 0, total: 100 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        await ctx.progress({ progress: 50, total: 100 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        await ctx.progress({ progress: 100, total: 100 });
      }

      return {
        content: [{ type: "text", text: `Successfully cloned ${args.url}` }],
      };
    },
  })
  .tool("status", {
    description: "Show git status",
    handler: () => ({
      content: [{ type: "text", text: "On branch main\\nnothing to commit" }],
    }),
  })
  .prompt("commitMessage", {
    description: "Generate a commit message",
    handler: (args: { changes: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a commit message for: ${args.changes}`,
          },
        },
      ],
    }),
  });

// Filesystem server with state tracking
const fsServer = new McpServer({ name: "fs", version: "1.0.0" })
  .tool("read", {
    description: "Read a file",
    handler: (args: { path: string }) => ({
      content: [{ type: "text", text: `Contents of ${args.path}` }],
    }),
  })
  .tool("write", {
    description: "Write to a file",
    handler: (args: { path: string; content: string }, ctx) => {
      // Track writes in context state
      if (!ctx.state.writtenFiles) {
        ctx.state.writtenFiles = [];
      }
      (ctx.state.writtenFiles as string[]).push(args.path);

      return {
        content: [
          {
            type: "text",
            text: `Wrote ${args.content.length} bytes to ${args.path}`,
          },
        ],
      };
    },
  })
  .resource(
    "file://{path}",
    { description: "Access a file", mimeType: "text/plain" },
    async (uri, vars) => ({
      contents: [
        { uri: uri.href, type: "text", text: `File content for ${vars.path}` },
      ],
    }),
  );

// Database server (flat mounted)
const dbServer = new McpServer({ name: "db", version: "1.0.0" }).tool(
  "query",
  {
    description: "Execute a database query",
    handler: (args: { sql: string }) => {
      // Basic SQL injection check (example only - not production ready!)
      if (args.sql.toLowerCase().includes("drop table")) {
        throw new Error("DROP TABLE is not allowed");
      }

      return {
        content: [{ type: "text", text: `Executing: ${args.sql}` }],
      };
    },
  },
);

// Parent server with request tracking
const mcp = new McpServer({ name: "app", version: "1.0.0" })
  .use(async (ctx, next) => {
    // Generate unique request ID
    ctx.state.requestId = Math.random().toString(36).substring(7);

    const method = (ctx.request as { method?: string }).method || "unknown";
    const requestId = ctx.state.requestId as string;

    console.log(`[${requestId}] ${method} - start`);

    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    console.log(`[${requestId}] ${method} - completed in ${duration}ms`);

    // Log any files written during this request
    if (ctx.state.writtenFiles) {
      console.log(
        `[${requestId}] Files written:`,
        ctx.state.writtenFiles,
      );
    }
  })
  .group("git", gitServer)
  .group("fs", fsServer)
  .group(dbServer);

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono();

app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

app.get("/", (c) => {
  return c.json({
    message: "Groups Composition MCP Server - Real-World Example",
    description:
      "Demonstrates server composition with error handling, progress reporting, " +
      "context state sharing, and middleware composition patterns.",
    endpoints: {
      mcp: "/mcp",
      inspector: "Use 'bunx @modelcontextprotocol/inspect' to explore",
    },
    features: [
      "Error handling in tools (URL validation, SQL injection prevention)",
      "Progress reporting (git/clone)",
      "Context state sharing across parent/child middleware",
      "Request tracking with unique IDs",
      "Performance monitoring",
    ],
    tools: [
      "git/clone - with HTTPS validation and progress reporting",
      "git/status",
      "fs/read",
      "fs/write - tracks writes in ctx.state",
      "query - with basic SQL injection prevention (flat mounted)",
    ],
    prompts: ["git/commitMessage"],
    resources: ["file://{path}"],
  });
});

export default app;