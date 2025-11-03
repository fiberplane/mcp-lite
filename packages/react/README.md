# @mcp-lite/react

React hooks for building UI widgets with mcp-lite's `uiResource()` system.

## Installation

```bash
npm install @mcp-lite/react react
```

## Quick Start

### 1. Create a React Widget

```tsx
// MyWidget.tsx
import { useWidget } from "@mcp-lite/react";

interface MyProps {
  city: string;
  temperature: number;
}

export default function WeatherWidget() {
  const { props, theme } = useWidget<MyProps>();

  return (
    <div data-theme={theme}>
      <h1>{props.city}</h1>
      <p>{props.temperature}°C</p>
    </div>
  );
}
```

### 2. Register with uiResource()

Use `type: "externalUrl"` to serve your built React app:

```ts
import { McpServer } from "mcp-lite";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

server.uiResource({
  type: "externalUrl",
  name: "weather-widget",
  title: "Weather Widget",
  description: "Display weather information",
  url: "https://your-widget-host.com/weather", // Your React app URL
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string" },
      temperature: { type: "number" },
    },
    required: ["city", "temperature"],
  },
  size: ["600px", "400px"],
});
```

### 3. How Props Flow

1. **LLM** calls the tool `weather-widget` with args: `{ city: "Paris", temperature: 22 }`
2. **MCP Server** (mcp-lite) returns a `resource_link` to the widget HTML with props encoded in the query string
3. **Client** (ChatGPT/Apps SDK) loads the widget HTML
4. **Server** injects `window.openai.toolInput = { city: "Paris", temperature: 22 }`
5. **useWidget hook** reads from `window.openai.toolInput` and provides it as `props`
6. **Your React component** renders with the props

## API Reference

### `useWidget<TProps, TState>(defaultProps?)`

Main hook for accessing widget context and APIs.

```tsx
const {
  props,        // Tool input parameters
  theme,        // "light" | "dark"
  displayMode,  // "inline" | "fullscreen" | "pip"
  locale,       // User locale (e.g., "en")
  state,        // Persistent widget state
  setState,     // Update widget state
  
  // Actions
  callTool,            // Call other MCP tools
  sendFollowUpMessage, // Send message to chat
  openExternal,        // Open external URL
  requestDisplayMode,  // Request display mode change
  
  isAvailable,  // Whether Apps SDK APIs are available
} = useWidget<MyProps, MyState>();
```

### `useWidgetProps<TProps>(defaultProps?)`

Shorthand for just getting props:

```tsx
const props = useWidgetProps<{ city: string }>();
```

### `useWidgetTheme()`

Get current theme:

```tsx
const theme = useWidgetTheme();
const bgColor = theme === "dark" ? "bg-gray-900" : "bg-white";
```

### `useWidgetState<TState>(defaultState?)`

Persistent widget state:

```tsx
const [favorites, setFavorites] = useWidgetState<string[]>([]);

await setFavorites([...favorites, "Paris"]);
```

## Complete Example

```tsx
import { useWidget } from "@mcp-lite/react";
import { useState } from "react";

interface WeatherProps {
  city: string;
  weather: "sunny" | "rain" | "snow" | "cloudy";
  temperature: number;
}

export default function WeatherWidget() {
  const { props, theme, callTool, sendFollowUpMessage } = useWidget<WeatherProps>();
  const [loading, setLoading] = useState(false);

  const fetchForecast = async () => {
    setLoading(true);
    try {
      const result = await callTool("get-forecast", {
        city: props.city,
        days: 7,
      });
      console.log("Forecast:", result);
    } finally {
      setLoading(false);
    }
  };

  const askForMore = () => {
    sendFollowUpMessage(`Tell me more about weather in ${props.city}`);
  };

  const bgColor = theme === "dark" ? "bg-gray-900" : "bg-white";
  const textColor = theme === "dark" ? "text-white" : "text-gray-900";

  return (
    <div className={`p-6 rounded-lg ${bgColor} ${textColor}`}>
      <h1 className="text-2xl font-bold mb-2">{props.city}</h1>
      <p className="text-4xl mb-4">{props.temperature}°C</p>
      <p className="capitalize mb-4">{props.weather}</p>
      
      <button
        onClick={fetchForecast}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        {loading ? "Loading..." : "Get 7-day Forecast"}
      </button>
      
      <button
        onClick={askForMore}
        className="ml-2 px-4 py-2 bg-gray-500 text-white rounded"
      >
        Ask for More Info
      </button>
    </div>
  );
}
```

## TypeScript Support

Full type inference for props:

```tsx
import { z } from "zod";

const WeatherSchema = z.object({
  city: z.string(),
  temperature: z.number(),
  weather: z.enum(["sunny", "rain", "snow", "cloudy"]),
});

type WeatherProps = z.infer<typeof WeatherSchema>;

// Props are fully typed
const { props } = useWidget<WeatherProps>();
props.city;        // ✅ string
props.temperature; // ✅ number
props.weather;     // ✅ "sunny" | "rain" | "snow" | "cloudy"
```

## Differences from mcp-use

This is a minimal, standalone React hook package for mcp-lite. Key differences:

- **No auto-registration**: You register widgets explicitly with `server.uiResource()`
- **No Vite dev server**: You build and host your React app separately
- **Simpler API surface**: Focuses on the core `window.openai` bridge
- **Framework agnostic server**: Works with any build tool and hosting setup

If you need auto-registration, HMR, and a full development pipeline, consider using [mcp-use](https://github.com/mcp-use/mcp-use).

## License

MIT
