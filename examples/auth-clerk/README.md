# mcp-lit with auth (featuring: Clerk)

This is an example of using mcp-lite with auth, using Clerk as the auth provider.

## Development

Set secret variables in `.dev.vars`

```sh
# Fill in the values for the secret variables from the example file
cp .dev.vars.example .dev.vars
```

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
