# React Widget Example

This example demonstrates how to integrate React widgets with mcp-lite's `uiResource()` system.

## What's Included

This example shows three different widget patterns:

1. **Inline Counter** (`rawHtml`) - A vanilla JS widget that mimics React's `useWidget` hook pattern
2. **Weather Widget** (`externalUrl`) - How to register an externally hosted React app
3. **Task List** (`remoteDom`) - A lightweight interactive widget using DOM scripting

## Quick Start

```bash
# Terminal 1: Start the React widget dev server
cd examples/react-widget/widget-app
bun install
bun run dev  # Runs on http://localhost:5173

# Terminal 2: Start the MCP server
cd examples/react-widget
bun install
bun run dev  # Runs on http://localhost:3002

# Terminal 3: Run manual tests
cd examples/react-widget
bun run test:manual
```

📖 **See [TESTING.md](./TESTING.md) for complete manual testing guide**

## Key Concepts

### How Props Flow to React Widgets

1. **Tool Call**: LLM calls your widget tool with args (e.g., `{ city: "Paris", temperature: 22 }`)
2. **Server**: mcp-lite returns a `resource_link` with props encoded in the URL
3. **HTML Injection**: The server injects `window.openai.toolInput = { city: "Paris", ... }`
4. **React Hook**: Your React component uses `useWidget()` to read from `window.openai.toolInput`
5. **Render**: Component receives typed props and renders

### Widget Registration

```ts
server.uiResource({
  type: "externalUrl",
  name: "my-widget",
  url: "https://my-app.vercel.app/widget",  // Your deployed React app
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string" },
      temperature: { type: "number" }
    }
  }
});
```

## Building a Real React Widget

### 1. Create React App

```bash
# Create a new React + Vite project
npm create vite@latest my-widget -- --template react-ts
cd my-widget
npm install @mcp-lite/react
```

### 2. Create Widget Component

```tsx
// src/WeatherWidget.tsx
import { useWidget } from "@mcp-lite/react";

interface WeatherProps {
  city: string;
  temperature: number;
  weather: "sunny" | "rain" | "snow" | "cloudy";
}

export default function WeatherWidget() {
  const { props, theme, callTool, sendFollowUpMessage } = useWidget<WeatherProps>();

  const handleForecast = async () => {
    const result = await callTool("get-forecast", { city: props.city });
    console.log(result);
  };

  return (
    <div data-theme={theme} className="p-6">
      <h1 className="text-2xl font-bold">{props.city}</h1>
      <p className="text-4xl my-4">{props.temperature}°C</p>
      <p className="capitalize">{props.weather}</p>
      
      <button 
        onClick={handleForecast}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Get Forecast
      </button>
    </div>
  );
}
```

### 3. Build and Deploy

```bash
# Build for production
npm run build

# Deploy to Vercel/Netlify/Cloudflare Pages
vercel deploy
```

### 4. Register with MCP Server

```ts
import { McpServer } from "mcp-lite";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

server.uiResource({
  type: "externalUrl",
  name: "weather-widget",
  url: "https://your-app.vercel.app",  // Your deployed URL
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string" },
      temperature: { type: "number" },
      weather: { type: "string", enum: ["sunny", "rain", "snow", "cloudy"] }
    },
    required: ["city", "temperature", "weather"]
  }
});
```

## Running This Example

```bash
# From the example directory
bun install
bun run dev

# Or from repo root
bun run --filter=@mcp-lite/example-react-widget dev
```

Visit `http://localhost:3002/health` to verify the server is running.

## Testing Widgets

### With MCP Inspector

1. Start the server: `bun run dev`
2. Use an MCP inspector tool to connect to `http://localhost:3002/mcp`
3. Call tools like `inline-counter` with args: `{ "initialCount": 5 }`
4. View the rendered widget

### With ChatGPT

1. Deploy your server to a public URL
2. Register your MCP server with ChatGPT
3. Ask: "Show me a counter starting at 10"
4. ChatGPT will invoke the widget tool and display the UI

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ MCP Client (ChatGPT)                                │
│   Calls tool: weather-widget({ city: "Paris", ... })│
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ mcp-lite Server                                     │
│   server.uiResource({ type: "externalUrl", ... })   │
│   Returns: resource_link to HTML                    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ HTML Wrapper (generated by mcp-lite)                │
│   <script>                                          │
│     window.openai.toolInput = { city: "Paris", ... }│
│   </script>                                         │
│   <iframe src="https://your-app.vercel.app" />     │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ React App (your widget)                             │
│   const { props } = useWidget<WeatherProps>();      │
│   // props.city === "Paris" ✅                       │
└─────────────────────────────────────────────────────┘
```

## Tips

- **Type Safety**: Use TypeScript + Zod schemas for full type inference
- **Themes**: Always support both `light` and `dark` themes
- **Fallbacks**: Provide sensible defaults for all props
- **State**: Use `useWidgetState()` for persistent state across interactions
- **Testing**: Test standalone before integrating with MCP

## Next Steps

- See [@mcp-lite/react](../../packages/react) for full API docs
- Check out other examples in [examples/](../)
- Read the [uiResource() guide](../../packages/core#ui-widgets-experimental) in the core README
