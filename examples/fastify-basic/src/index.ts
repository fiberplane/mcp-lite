import Fastify, { type FastifyRequest } from "fastify";
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

// Convert Fastify request to Fetch API Request
async function fastifyRequestToFetchRequest(
  request: FastifyRequest,
): Promise<Request> {
  const url = `${request.protocol}://${request.hostname}${request.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    }
  }

  const options: RequestInit = {
    method: request.method,
    headers,
  };

  // Add body for POST/PUT requests
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    options.body = JSON.stringify(request.body);
  }

  return new Request(url, options);
}

// Add MCP endpoint
fastify.all("/mcp", async (request, reply) => {
  const fetchRequest = await fastifyRequestToFetchRequest(request);
  const response = await httpHandler(fetchRequest);

  // Convert Fetch API Response back to Fastify response
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  reply.code(response.status);
  Object.entries(headers).forEach(([key, value]) => {
    reply.header(key, value);
  });

  // Handle streaming responses (SSE)
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const reader = response.body?.getReader();
    if (reader) {
      reply.raw.writeHead(response.status, headers);
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(decoder.decode(value, { stream: true }));
      }

      reply.raw.end();
      return;
    }
  }

  // Handle regular responses
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
