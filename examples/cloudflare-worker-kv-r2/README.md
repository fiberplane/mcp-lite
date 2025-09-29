# mcp-lite with Cloudflare bindings

This is an example of using mcp-lite with Cloudflare KV, making calls to KV from within a tool handler.

To make this work, we generate types for the Worker (`bun cf-typegen`), then import the bindings using:

```ts
import { env } from "cloudflare:workers";

// now `env.KV` gives us access to the KV store
// however! we can only call it from within an execution context (like inside a tool call)
```

## Development

Run the development server

```sh
bun install
bun dev
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
