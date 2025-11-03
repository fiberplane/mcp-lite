import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";

const mcp = new McpServer({
  name: "react-widget-example",
  version: "1.0.0",
});

// Example 1: Inline HTML widget with useWidget (no React build needed)
mcp.uiResource({
  type: "rawHtml",
  name: "inline-counter",
  title: "Inline Counter",
  description: "Simple counter widget using vanilla JS + useWidget pattern",
  inputSchema: {
    type: "object",
    properties: {
      initialCount: { type: "number", description: "Initial counter value" },
    },
  },
  htmlContent: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: system-ui; padding: 20px; }
          .counter { text-align: center; }
          .count { font-size: 48px; font-weight: bold; margin: 20px 0; }
          button { padding: 10px 20px; margin: 5px; border-radius: 8px; border: 1px solid #ccc; cursor: pointer; }
          button:hover { background: #f0f0f0; }
          [data-theme="dark"] { background: #1a1a1a; color: white; }
          [data-theme="dark"] button { background: #333; color: white; border-color: #555; }
          [data-theme="dark"] button:hover { background: #444; }
        </style>
      </head>
      <body>
        <div class="counter">
          <h1>Counter Widget</h1>
          <div class="count" id="count">0</div>
          <button onclick="increment()">+1</button>
          <button onclick="decrement()">-1</button>
          <button onclick="reset()">Reset</button>
        </div>
        
        <script>
          // Mimic useWidget hook behavior
          const props = window.openai?.toolInput || { initialCount: 0 };
          const theme = window.openai?.theme || 'light';
          
          document.body.setAttribute('data-theme', theme);
          
          let count = props.initialCount || 0;
          const countEl = document.getElementById('count');
          
          function updateCount() {
            countEl.textContent = count;
          }
          
          function increment() {
            count++;
            updateCount();
          }
          
          function decrement() {
            count--;
            updateCount();
          }
          
          function reset() {
            count = props.initialCount || 0;
            updateCount();
          }
          
          updateCount();
        </script>
      </body>
    </html>
  `,
});

// Example 2: External React widget (you'd build this separately with Vite/Next.js)
// In a real setup, you'd:
// 1. Create a React app with @mcp-lite/react
// 2. Build it and deploy to a static host
// 3. Point the URL to your deployed app

mcp.uiResource({
  type: "externalUrl",
  name: "weather-widget",
  title: "Weather Widget",
  description: "Display weather information (React)",
  // In production, this would be your deployed React app URL
  // For now, using a placeholder that shows the pattern
  url: "https://your-react-app.vercel.app/weather",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      temperature: { type: "number", description: "Temperature in Celsius" },
      weather: {
        type: "string",
        enum: ["sunny", "rain", "snow", "cloudy"],
        description: "Weather condition",
      },
    },
    required: ["city", "temperature", "weather"],
  },
  size: ["600px", "400px"],
});

// Example 3: Remote DOM with script (lightweight interactivity)
mcp.uiResource({
  type: "remoteDom",
  name: "task-list",
  title: "Task List",
  description: "Interactive task list widget",
  inputSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: { type: "string" },
        description: "List of tasks",
      },
    },
  },
  script: `
    const props = window.openai?.toolInput || { tasks: [] };
    const theme = window.openai?.theme || 'light';
    
    const isDark = theme === 'dark';
    
    // Create title
    const h1 = document.createElement('h1');
    h1.textContent = 'My Tasks';
    h1.style.margin = '0 0 16px 0';
    h1.style.fontSize = '24px';
    h1.style.color = isDark ? '#fff' : '#000';
    root.appendChild(h1);
    
    // Create task list
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    
    (props.tasks || []).forEach((task, index) => {
      const li = document.createElement('li');
      li.style.padding = '12px';
      li.style.margin = '8px 0';
      li.style.background = isDark ? '#2a2a2a' : '#f5f5f5';
      li.style.borderRadius = '8px';
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      li.style.color = isDark ? '#fff' : '#000';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'task-' + index;
      checkbox.style.width = '20px';
      checkbox.style.height = '20px';
      
      const label = document.createElement('label');
      label.htmlFor = 'task-' + index;
      label.textContent = task;
      label.style.flex = '1';
      label.style.cursor = 'pointer';
      
      checkbox.addEventListener('change', () => {
        label.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
        label.style.opacity = checkbox.checked ? '0.6' : '1';
      });
      
      li.appendChild(checkbox);
      li.appendChild(label);
      ul.appendChild(li);
    });
    
    root.appendChild(ul);
    
    // Add a hint about no tasks
    if (!props.tasks || props.tasks.length === 0) {
      const hint = document.createElement('p');
      hint.textContent = 'No tasks yet! Add some in the chat.';
      hint.style.color = isDark ? '#888' : '#666';
      hint.style.textAlign = 'center';
      hint.style.marginTop = '20px';
      root.appendChild(hint);
    }
  `,
  size: ["500px", "400px"],
});

// Create HTTP transport and bind server
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Create Hono app
const app = new Hono();

app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

app.get("/health", (c) => {
  return c.json({ status: "ok", server: "react-widget-example" });
});

const port = 3002;

export default app;

if (import.meta.main) {
  console.log(`🚀 MCP Server with React widgets running on port ${port}`);
  console.log(`   Health: http://localhost:${port}/health`);
  console.log(`   MCP endpoint: http://localhost:${port}/mcp`);
  console.log();
  console.log(`📦 Registered widgets:`);
  console.log(`   - inline-counter (rawHtml with useWidget pattern)`);
  console.log(`   - weather-widget (externalUrl - React app)`);
  console.log(`   - task-list (remoteDom with script)`);
  console.log();
  console.log(`💡 To test with a real React widget:`);
  console.log(`   1. Create a React app with @mcp-lite/react`);
  console.log(`   2. Build and deploy to Vercel/Netlify/etc`);
  console.log(`   3. Update the weather-widget URL above`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}
