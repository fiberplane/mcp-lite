# Fastify + mcp-lite Example

A simple example demonstrating how to use `mcp-lite` with Fastify, a fast and low-overhead web framework for Node.js.

## Features

- ✨ Modern TypeScript with Fastify 5.x
- 🔧 MCP server with tools and resources
- 📝 Type-safe tool definitions using Zod 4
- 🌊 Streaming SSE support for MCP protocol
- 🔄 Request/Response conversion between Fastify and Fetch API

> **Note:** This example uses Zod 4, which includes `z.toJSONSchema()` as a built-in method for schema conversion.

## What's Included

This example includes:

1. **Tools:**
   - `echo` - Simple echo tool that returns the input message
   - `getWeather` - Tool with structured output returning weather data

2. **Resources:**
   - `config://app.json` - Application configuration resource

3. **HTTP Endpoints:**
   - `GET /` - Server information
   - `GET /health` - Health check endpoint
   - `ALL /mcp` - MCP protocol endpoint (POST for requests, GET for SSE streaming)

## Installation

```bash
npm install
```

## Running the Example

```bash
# Development mode with auto-reload
npm run dev

# Build and run production
npm run build
npm start
```

The server will start on `http://localhost:3000` by default.

## Usage

### Test the MCP endpoint

```bash
# List available tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'

# Call the echo tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "Hello from Fastify!"
      }
    },
    "id": 2
  }'

# Get weather (with structured output)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "getWeather",
      "arguments": {
        "location": "San Francisco"
      }
    },
    "id": 3
  }'

# List resources
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/list",
    "id": 4
  }'

# Read a resource
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "params": {
      "uri": "config://app.json"
    },
    "id": 5
  }'
```

## Key Implementation Details

### Fastify to Fetch API Conversion

The example includes a utility function `fastifyRequestToFetchRequest` that converts Fastify's request object to a standard Fetch API `Request`. This is necessary because `mcp-lite`'s `StreamableHttpTransport` expects standard Fetch API objects.

```typescript
async function fastifyRequestToFetchRequest(request: any): Promise<Request> {
  const url = `${request.protocol}://${request.hostname}${request.url}`;
  const headers = new Headers();
  // ... header conversion
  return new Request(url, options);
}
```

### Response Handling

The example handles both regular JSON responses and Server-Sent Events (SSE) for streaming:

```typescript
// Handle streaming responses (SSE)
if (response.headers.get("content-type")?.includes("text/event-stream")) {
  // Stream the response
}
// Handle regular responses
else {
  const body = await response.text();
  return reply.send(body);
}
```

## Comparison with Hono

Unlike Hono which provides direct access to the raw Fetch API request via `c.req.raw`, Fastify requires conversion between its request/response model and the Fetch API. This example demonstrates how to bridge these two paradigms.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)

## Learn More

- [Fastify Documentation](https://fastify.dev/)
- [mcp-lite Documentation](../../packages/core/README.md)
- [Model Context Protocol](https://modelcontextprotocol.io/)
