import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";

// Create MCP server with Zod schema adapter
const mcp = new McpServer({
  name: "fastify-echo-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

// Add a simple echo tool
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: z.object({
    message: z.string(),
  }),
  handler: (args) => ({
    content: [{ type: "text", text: args.message }],
  }),
});

// Add a tool with structured output
const WeatherOutputSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
  location: z.string(),
});

mcp.tool("getWeather", {
  description: "Gets weather information for a location",
  inputSchema: z.object({
    location: z.string(),
  }),
  outputSchema: WeatherOutputSchema,
  handler: (args) => ({
    content: [
      {
        type: "text",
        text: `Weather in ${args.location}: 22°C, sunny`,
      },
    ],
    structuredContent: {
      temperature: 22,
      conditions: "sunny",
      location: args.location,
    },
  }),
});

// Add a simple resource
mcp.resource(
  "config://app.json",
  {
    name: "App Configuration",
    description: "Application configuration file",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        type: "text",
        text: JSON.stringify(
          {
            name: "fastify-mcp-server",
            version: "1.0.0",
            features: ["echo", "weather"],
          },
          null,
          2,
        ),
        mimeType: "application/json",
      },
    ],
  }),
);

// Create HTTP transport
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Create Fastify app
const fastify = Fastify({
  logger: {
    level: "info",
  },
});

// Convert Fastify headers to Fetch API Headers
function buildFetchHeaders(fastifyHeaders: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(fastifyHeaders)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    }
  }
  return headers;
}

// Build Fetch API URL from Fastify request
function buildFetchUrl(request: FastifyRequest): string {
  return `${request.protocol}://${request.hostname}${request.url}`;
}

// Check if request method should include a body
function shouldIncludeBody(method: string): boolean {
  return ["POST", "PUT", "PATCH"].includes(method);
}

// Convert Fastify request to Fetch API Request
async function fastifyRequestToFetchRequest(
  request: FastifyRequest,
): Promise<Request> {
  const url = buildFetchUrl(request);
  const headers = buildFetchHeaders(request.headers);

  const options: RequestInit = {
    method: request.method,
    headers,
  };

  if (shouldIncludeBody(request.method)) {
    options.body = JSON.stringify(request.body);
  }

  return new Request(url, options);
}

// Convert Fetch API Headers to plain object
function extractFetchHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// Check if response is a streaming response
function isStreamingResponse(response: Response): boolean {
  return (
    response.headers.get("content-type")?.includes("text/event-stream") ?? false
  );
}

// Apply response status and headers to Fastify reply
function applyResponseHeaders(
  reply: FastifyReply,
  status: number,
  headers: Record<string, string>,
): void {
  reply.code(status);
  Object.entries(headers).forEach(([key, value]) => {
    reply.header(key, value);
  });
}

// Handle streaming response
async function handleStreamingResponse(
  reply: FastifyReply,
  response: Response,
  headers: Record<string, string>,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  reply.raw.writeHead(response.status, headers);
  const decoder = new TextDecoder();

  reply.raw.once("close", () => {
    reader.cancel();
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply.raw.write(decoder.decode(value, { stream: true }));
  }

  reply.raw.end();
}

// Add MCP endpoint
fastify.all("/mcp", async (request, reply) => {
  const fetchRequest = await fastifyRequestToFetchRequest(request);
  const response = await httpHandler(fetchRequest);

  const headers = extractFetchHeaders(response.headers);
  applyResponseHeaders(reply, response.status, headers);

  if (isStreamingResponse(response)) {
    await handleStreamingResponse(reply, response, headers);
    return;
  }

  const body = await response.text();
  return reply.send(body);
});

// Root endpoint
fastify.get("/", async () => {
  return {
    name: "Fastify MCP Server",
    description: "A simple example of using mcp-lite with Fastify",
    endpoints: {
      mcp: "/mcp",
    },
    tools: ["echo", "getWeather"],
    resources: ["config://app.json"],
  };
});

// Health check endpoint
fastify.get("/health", async () => {
  return { status: "ok" };
});

// Start the server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    console.log(`🚀 Fastify MCP Server running on http://${host}:${port}`);
    console.log(`📡 MCP endpoint available at http://${host}:${port}/mcp`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
