# mcp-lite with Cloudflare bindings

This is an example of using mcp-lite with Cloudflare KV.

The MCP server exposes get, put, and delete functionality for a KV instance,
so that an MCP client can manage values in the KV store.
The server requests a confirmation, via an elicitation, when the client attempts to delete a record.

The example also uses two additional KV stores for session persistence and for client request handling (e.g., elicitations).

- **Session persistence**: Using CloudflareKVSessionAdapter for session storage
- **Client request handling**: Using CloudflareKVClientRequestAdapter for async request processing

To make this work properly, we generate types for the Worker (`bun cf-typegen`), then import the KV bindings on the env _at the top level_ using:

```ts
import { env } from "cloudflare:workers";

// now `env.KV` gives us access to the KV store
// however! we can only call it from within an execution context (like inside a tool call)
```

## Architecture

This example includes two custom adapters to enable statefulness:

### CloudflareKVSessionAdapter
- Stores MCP session data in Cloudflare KV
- Handles session lifecycle (create, get, update, delete)
- Manages event streaming with buffering and replay functionality

### CloudflareKVClientRequestAdapter  
- Handles asynchronous server-to-client requests (sampling, elicitation) using KV for coordination
- Implements polling mechanism for request/response communication
- Manages request timeouts and cleanup

> **NOTE** This adapter would be better modeled in Cloudflare's ecosystem as a Durable Object.

## Development

Run the development server

```sh
bun install
bun dev
```

## Configuration

The following three KV namespaces are enabled in the `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "your-main-kv-namespace-id"
  },
  {
    "binding": "SESSIONS_KV", 
    "id": "your-sessions-kv-namespace-id"
  },
  {
    "binding": "PENDING_REQUESTS_KV",
    "id": "your-requests-kv-namespace-id"
  }
]
```

## Deployment 

```sh
bun run deploy
```

## Type Generation

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```sh
bun run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
