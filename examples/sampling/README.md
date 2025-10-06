# `mcp-lite` Sampling Example

A simple MCP server demonstrating the sampling capability, where your server can request the LLM to generate content on its behalf.

To run the example:

```bash
# Install dependencies
bun install

# Start the server
bun start
```

The mcp server runs on `http://localhost:3001/mcp`, and you can inspect it at that endpoint with the mcp inspector package:

```bash
bunx @modelcontextprotocol/inspector
```

## How Sampling Works

The `craft_wonky_prompt` tool checks if the client supports sampling, then uses `ctx.sample()` to request LLM completions:

```typescript
// Check capability
if (!ctx.client.supports("sampling")) {
  throw new Error("This tool requires a client that supports sampling");
}

// Request completion
const response = await ctx.sample({
  prompt: `Craft absolutely unhinged prose on the topic of ${args.theme}`,
  modelPreferences: {
    hints: [{ name: "claude-4.5-sonnet" }],
    intelligencePriority: 0.8,
    speedPriority: 0.5,
  },
  systemPrompt: "You are a wonky assistant.",
  maxTokens: 100,
});

// Use the generated content
const textContent = response.content.text;
```
