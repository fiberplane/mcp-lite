# Hono + Vite + ChatGPT Widgets Starter

Minimal template for building MCP servers with interactive ChatGPT widgets using TanStack Router.

## Features

- **Single widget with routing**: One widget bundle with TanStack Router for navigation
- **2 example tools** with separate views
- **Type-safe** with Zod schemas
- **Tailwind CSS** for styling

## Quick Start

```bash
# Install dependencies
bun install

# Set up public tunnel (ChatGPT widgets require HTTPS, not localhost)
ngrok http 5173
# or
cloudflared tunnel --url http://localhost:5173

# Export the HTTPS URL
export HOST_URL=https://your-tunnel-url.ngrok.io

# Start dev server
bun run dev
```

## Project Structure

```
src/
├── server/index.ts              # MCP server
├── types/index.ts               # Zod schemas
└── widgets/
    ├── widget.tsx               # Main widget entry point
    ├── routes.tsx               # TanStack Router setup
    ├── NavigationSync.tsx       # Syncs tool output with routes
    ├── openai-types.ts          # OpenAI API types
    ├── index.css                # Shared styles
    └── components/
        ├── LoadingWidget.tsx    # Loading state
        ├── ItemListWidget.tsx   # List view
        └── ItemDetailWidget.tsx # Detail view
```

## How It Works

### 1. Single Widget with Router

All tools reference the same widget URI. The widget uses TanStack Router to show different views:

```typescript
// Server: All tools use the same widget
const WIDGET_URI = "ui://widget/index.html";

mcp.tool("list_items", {
  _meta: {
    "openai/outputTemplate": WIDGET_URI  // Same URI for all tools
  },
  handler: async () => ({
    structuredContent: {
      kind: "item_list",  // Discriminator for routing
      items: [...]
    }
  })
});
```

### 2. Route Configuration

Routes defined in `src/widgets/routes.tsx`:

```typescript
const listRoute = createRoute({
  path: "/list",
  component: ItemListWidget,
});

const detailRoute = createRoute({
  path: "/detail/$itemId",
  component: ItemDetailWidget,
});
```

### 3. NavigationSync Component

Watches tool output and navigates to the appropriate route based on the `kind` discriminator:

```typescript
// src/widgets/NavigationSync.tsx
export function NavigationSync() {
  const data = useToolOutput();
  const navigate = useNavigate();

  useEffect(() => {
    if (!data) return;

    switch (data.kind) {
      case "item_list":
        navigate({ to: "/list" });
        break;
      case "item_detail":
        navigate({ to: "/detail/$itemId", params: { itemId: data.id } });
        break;
    }
  }, [data, navigate]);

  return null;
}
```

### 4. Widget Components

Components use useState/useEffect to initialize from OpenAI API:

```typescript
export function ItemListWidget() {
  const [items, setItems] = useState<Item[]>([]);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const openai = getOpenAI();
    const initialData = openai?.widgetState || openai?.toolOutput;
    if (initialData && "items" in initialData) {
      setItems(initialData.items);
    }
    setTheme(openai?.theme || "light");

    function handleGlobalsChange() {
      setTheme(getOpenAI()?.theme || "light");
    }
    window.addEventListener("openai:set_globals", handleGlobalsChange);
    return () => window.removeEventListener("openai:set_globals", handleGlobalsChange);
  }, []);

  // ... render UI
}
```

## Adding a New View

1. **Create a component** in `src/widgets/components/`:

```tsx
// src/widgets/components/MyWidget.tsx
import { useState, useEffect } from "react";
import { getOpenAI } from "../openai-types";

export function MyWidget() {
  const [data, setData] = useState(null);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const openai = getOpenAI();
    const initialData = openai?.widgetState || openai?.toolOutput;
    setData(initialData);
    setTheme(openai?.theme || "light");
  }, []);

  return <div className="p-6">My Widget Content</div>;
}
```

2. **Add a route** in `src/widgets/routes.tsx`:

```typescript
import { MyWidget } from "./components/MyWidget";

const myRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-view",
  component: MyWidget,
});

// Add to routeTree
const routeTree = rootRoute.addChildren([
  loadingRoute,
  listRoute,
  detailRoute,
  myRoute,  // Add here
]);
```

3. **Update NavigationSync** in `src/widgets/NavigationSync.tsx`:

```typescript
switch (data.kind) {
  case "item_list":
    navigate({ to: "/list" });
    break;
  case "item_detail":
    navigate({ to: "/detail/$itemId", params: { itemId: data.id } });
    break;
  case "my_kind":  // Add your case
    navigate({ to: "/my-view" });
    break;
}
```

4. **Add a tool** in `src/server/index.ts`:

```typescript
mcp.tool("my_tool", {
  _meta: widgetMeta("Loading", "Loaded"),
  handler: async () => ({
    structuredContent: {
      kind: "my_kind",  // Matches NavigationSync switch
      // ... your data
    }
  })
});
```

5. **Define types** in `src/types/index.ts`:

```typescript
export const MyOutputSchema = z.object({
  kind: z.literal("my_kind"),
  // ... your fields
});

export type MyOutput = z.infer<typeof MyOutputSchema>;

export type WidgetState =
  | ItemListOutput
  | ItemDetailOutput
  | MyOutput;  // Add to union
```

## Key Patterns

### Widget Data Access

```typescript
import { getOpenAI } from "./openai-types";

// Access tool output
const data = getOpenAI()?.toolOutput;

// Check theme
const isDark = getOpenAI()?.theme === "dark";

// Call tools from widget
await getOpenAI()?.callTool("my_tool", { args });

// Send follow-up message
await getOpenAI()?.sendFollowUpMessage({
  prompt: "Show me more details"
});
```

### Route Parameters

```tsx
import { useParams } from "@tanstack/react-router";

export function ItemDetailWidget() {
  const { itemId } = useParams({ strict: false });
  // Use itemId in your component
}
```

## Important Gotchas

### Localhost Not Supported

ChatGPT widgets require a publicly accessible HTTPS URL. Use:
- ngrok: `ngrok http 5173`
- Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:5173`
- Production: Deploy to real domain

### HOST_URL Must Match

Set `HOST_URL` in:
1. Environment variable
2. vite.config.ts `base` path
3. Resource CSP `connect_domains` and `resource_domains`

### Correct MIME Type

Resources MUST use `text/html+skybridge` - other types won't work.

### Discriminated Unions

All output types MUST have a unique `kind` field for routing:
- `kind: "item_list"` → routes to `/list`
- `kind: "item_detail"` → routes to `/detail/$itemId`

## Production Deployment

1. **HTTPS required** - ChatGPT only loads widgets over HTTPS
2. **Build first** - Run `bun run build` to generate widget bundle
3. **Persistent storage** - Replace in-memory `items` with a database
4. **Session management** - Implement session/request adapters for MCP transport

## Build Output

```bash
bun run build

# Generates:
dist/
├── index.html
└── assets/
    ├── index-[hash].js
    └── index-[hash].css
```

The server reads `dist/index.html` for the widget resource and serves the assets (JS/CSS) via static file serving with CORS headers.

## Resources

- [ChatGPT Apps SDK](https://developers.openai.com/apps-sdk/build/mcp-server)
- [MCP Lite](https://github.com/fiberplane/mcp-lite)
- [TanStack Router](https://tanstack.com/router)
- [Hono](https://hono.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
