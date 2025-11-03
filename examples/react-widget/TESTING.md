# Manual Testing Guide for React Widgets

This guide shows you how to manually test React widgets with mcp-lite in different scenarios.

## Testing Scenarios

1. **Standalone Testing** - Test React widget in isolation (browser only)
2. **Server Integration Testing** - Test widget served by MCP server
3. **End-to-End Testing** - Test with MCP Inspector or Claude Desktop

---

## 1. Standalone Testing (React Widget Only)

Test your React widget in isolation before integrating with the MCP server.

### Setup

```bash
cd examples/react-widget/widget-app
bun install
bun run dev
```

This starts Vite dev server at `http://localhost:5173`

### Test Cases

#### A. Test with Default Props

Open `http://localhost:5173` - Should show weather widget with defaults:
- City: "Unknown"
- Temperature: 0
- Weather: "cloudy"

#### B. Test with Simulated Props

Open browser console and manually inject `window.openai`:

```javascript
// Simulate OpenAI Apps SDK environment
window.openai = {
  toolInput: {
    city: "Paris",
    temperature: 22,
    weather: "sunny"
  },
  theme: "dark"
};

// Reload the page to pick up new props
location.reload();
```

**Expected**: Widget shows Paris, 22°, sunny with dark theme

#### C. Test Theme Switching

```javascript
window.openai = {
  toolInput: { city: "London", temperature: 15, weather: "rain" },
  theme: "light"  // Try "light" and "dark"
};
location.reload();
```

**Expected**: Widget adapts background/text colors based on theme

#### D. Test Missing window.openai

Clear `window.openai` and reload:

```javascript
delete window.openai;
location.reload();
```

**Expected**: 
- Widget shows "Standalone Mode" notice
- Action buttons show alert when clicked
- Default props are used

---

## 2. Server Integration Testing

Test the widget served through the MCP server's `uiResource()`.

### Setup

Terminal 1 - Start Widget Dev Server:
```bash
cd examples/react-widget/widget-app
bun run dev
# Running at http://localhost:5173
```

Terminal 2 - Start MCP Server:
```bash
cd examples/react-widget
bun run dev
# Running at http://localhost:3002
```

### Test Cases

#### A. List Available Tools

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0" }
    }
  }'
```

Save the `MCP-Session-Id` from response headers.

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/list"
  }'
```

**Expected**: Response includes:
- `inline-counter`
- `weather-widget`
- `task-list`

#### B. Call a Widget Tool

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "3",
    "method": "tools/call",
    "params": {
      "name": "inline-counter",
      "arguments": {
        "initialCount": 10
      }
    }
  }'
```

**Expected**: Response contains:
- `content[0].type === "resource_link"`
- `content[0].uri` starts with `ui://widget/inline-counter-`
- `structuredContent.initialCount === 10`

#### C. Read Widget Resource

Extract the `uri` from previous response, then:

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "4",
    "method": "resources/read",
    "params": {
      "uri": "ui://widget/inline-counter-abc123.html?props=%7B%22initialCount%22%3A10%7D"
    }
  }'
```

**Expected**: Response contains HTML with:
- `window.openai.toolInput` script tag
- Props decoded: `{ initialCount: 10 }`

#### D. Test External URL Widget

```bash
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "MCP-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "5",
    "method": "tools/call",
    "params": {
      "name": "weather-widget",
      "arguments": {
        "city": "Tokyo",
        "temperature": 25,
        "weather": "sunny"
      }
    }
  }'
```

Then read the resource and verify it contains an iframe pointing to the external URL.

---

## 3. End-to-End Testing with Browser

### Setup

1. Start both servers (widget-app on :5173, MCP server on :3002)
2. Create a simple HTML test page

### Test Page

Create `examples/react-widget/test.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Widget Test Page</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .test-section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; }
    iframe { width: 100%; height: 500px; border: 1px solid #ccc; }
    button { padding: 10px 20px; margin: 5px; }
  </style>
</head>
<body>
  <h1>mcp-lite Widget Testing</h1>
  
  <div class="test-section">
    <h2>Test 1: Inline Counter (rawHtml)</h2>
    <button onclick="loadCounter(0)">Load with 0</button>
    <button onclick="loadCounter(10)">Load with 10</button>
    <button onclick="loadCounter(100)">Load with 100</button>
    <div id="counter-container"></div>
  </div>

  <div class="test-section">
    <h2>Test 2: Weather Widget (externalUrl)</h2>
    <button onclick="loadWeather('Paris', 22, 'sunny')">Paris Sunny</button>
    <button onclick="loadWeather('London', 15, 'rain')">London Rainy</button>
    <button onclick="loadWeather('Tokyo', 28, 'cloudy')">Tokyo Cloudy</button>
    <div id="weather-container"></div>
  </div>

  <div class="test-section">
    <h2>Test 3: Task List (remoteDom)</h2>
    <button onclick="loadTasks(['Buy groceries', 'Walk dog'])">2 Tasks</button>
    <button onclick="loadTasks([])">Empty List</button>
    <button onclick="loadTasks(['Task 1', 'Task 2', 'Task 3', 'Task 4'])">4 Tasks</button>
    <div id="tasks-container"></div>
  </div>

  <script>
    const MCP_URL = 'http://localhost:3002/mcp';
    let sessionId = null;

    async function initSession() {
      if (sessionId) return sessionId;
      
      const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-06-18'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' }
          }
        })
      });
      
      sessionId = res.headers.get('MCP-Session-Id');
      return sessionId;
    }

    async function callTool(name, args) {
      await initSession();
      
      const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-06-18',
          'MCP-Session-Id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.random().toString(),
          method: 'tools/call',
          params: { name, arguments: args }
        })
      });
      
      return res.json();
    }

    async function readResource(uri) {
      await initSession();
      
      const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-06-18',
          'MCP-Session-Id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.random().toString(),
          method: 'resources/read',
          params: { uri }
        })
      });
      
      return res.json();
    }

    async function loadCounter(initialCount) {
      const result = await callTool('inline-counter', { initialCount });
      const uri = result.result.content[0].uri;
      const resource = await readResource(uri);
      const html = resource.result.contents[0].text;
      
      const container = document.getElementById('counter-container');
      container.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.srcdoc = html;
      container.appendChild(iframe);
    }

    async function loadWeather(city, temperature, weather) {
      const result = await callTool('weather-widget', { city, temperature, weather });
      const uri = result.result.content[0].uri;
      const resource = await readResource(uri);
      const html = resource.result.contents[0].text;
      
      const container = document.getElementById('weather-container');
      container.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.srcdoc = html;
      container.appendChild(iframe);
    }

    async function loadTasks(tasks) {
      const result = await callTool('task-list', { tasks });
      const uri = result.result.content[0].uri;
      const resource = await readResource(uri);
      const html = resource.result.contents[0].text;
      
      const container = document.getElementById('tasks-container');
      container.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.srcdoc = html;
      container.appendChild(iframe);
    }
  </script>
</body>
</html>
```

### Running the Test

```bash
cd examples/react-widget
python3 -m http.server 8000
# Or: python -m SimpleHTTPServer 8000
# Or any static file server
```

Open `http://localhost:8000/test.html`

**Test Actions:**
1. Click "Load with 10" → Counter shows 10
2. Click increment buttons → Counter updates
3. Click "Paris Sunny" → Weather widget loads in iframe with props
4. Click "2 Tasks" → Task list shows with checkboxes

---

## 4. Testing with MCP Inspector

If you have the MCP Inspector tool:

```bash
# Start MCP server
cd examples/react-widget
bun run dev

# In another terminal, start inspector
npx @modelcontextprotocol/inspector http://localhost:3002/mcp
```

**Test Flow:**
1. Connect to server
2. Navigate to "Tools" tab
3. Select `inline-counter` tool
4. Fill arguments: `{ "initialCount": 50 }`
5. Click "Call Tool"
6. Copy resource URI from response
7. Navigate to "Resources" tab
8. Paste URI and click "Read"
9. Verify HTML contains correct props

---

## 5. Debugging Tips

### Check Props Injection

In any widget iframe, open DevTools console:

```javascript
// Should show your props
console.log(window.openai?.toolInput);

// Should show theme
console.log(window.openai?.theme);
```

### Verify Resource URI Encoding

Props are URL-encoded in the resource URI. To decode:

```javascript
const uri = "ui://widget/counter-abc.html?props=%7B%22initialCount%22%3A10%7D";
const url = new URL(uri);
const propsParam = url.searchParams.get('props');
const props = JSON.parse(decodeURIComponent(propsParam));
console.log(props); // { initialCount: 10 }
```

### Test Theme Changes

In widget DevTools console:

```javascript
// Simulate theme change
window.openai = { ...window.openai, theme: 'dark' };
location.reload();
```

### Network Tab

Check MCP server responses:
- `tools/call` should return `resource_link`
- `resources/read` should return HTML with proper props script

---

## Common Issues

### Issue: Widget shows "Standalone Mode"

**Cause**: `window.openai` not available

**Solutions**:
- Check if props are injected in HTML (View Source)
- Verify iframe srcdoc includes the script tag
- Test prop encoding/decoding

### Issue: Props are empty/undefined

**Cause**: Props not passed correctly through the flow

**Check**:
1. Tool call includes correct arguments
2. Resource URI has `?props=...` query param
3. Server decodes props correctly
4. HTML script injects into `window.openai.toolInput`

### Issue: Theme not applying

**Cause**: Theme value not passed or widget not reading it

**Solutions**:
- Check `window.openai.theme` in DevTools
- Verify widget reads theme from `useWidget()` hook
- Test with manual theme injection

### Issue: External URL widget shows wrong URL

**Cause**: URL not matching between dev and production

**Solutions**:
- Update `url` in `uiResource()` config
- For dev: use `http://localhost:5173`
- For prod: use deployed URL (Vercel/Netlify)

---

## Success Criteria

✅ **Standalone Mode**: Widget loads with defaults, shows standalone notice

✅ **Props Flow**: Tool call → resource URI → decoded props → widget renders correctly

✅ **Theme Support**: Widget adapts to light/dark theme

✅ **Interactive Features**: Buttons work, actions trigger (in MCP-enabled mode)

✅ **Error Handling**: Graceful fallbacks when `window.openai` unavailable

✅ **Multiple Instances**: Can load same widget multiple times with different props

---

## Next Steps

- **Add Tests**: Write integration tests using the patterns above
- **Deploy Widget**: Build and deploy React app to Vercel/Netlify
- **Update Server Config**: Point `url` in `uiResource()` to deployed URL
- **Test in Claude Desktop**: Configure as MCP server and test end-to-end
