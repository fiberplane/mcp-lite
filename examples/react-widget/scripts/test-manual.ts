#!/usr/bin/env bun

/**
 * Manual test script for mcp-lite React widgets
 *
 * This script tests the widget flow:
 * 1. Initialize MCP session
 * 2. Call widget tools with test data
 * 3. Read widget resources
 * 4. Verify props injection
 *
 * Usage:
 *   bun run scripts/test-manual.ts
 */

const MCP_URL = "http://localhost:3002/mcp";
const PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let sessionId: string | null = null;

async function mcpRequest(
  method: string,
  params?: unknown,
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };

  if (sessionId) {
    headers["MCP-Session-Id"] = sessionId;
  }

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: Math.random().toString(36).slice(2),
    method,
    params,
  };

  console.log(`\n→ ${method}`);
  if (params) {
    console.log(
      `  Params: ${JSON.stringify(params, null, 2).split("\n").join("\n  ")}`,
    );
  }

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  // Capture session ID from first response
  if (!sessionId) {
    const sid = response.headers.get("MCP-Session-Id");
    if (sid) {
      sessionId = sid;
      console.log(`  Session ID: ${sessionId}`);
    }
  }

  const json = (await response.json()) as JsonRpcResponse;

  if (json.error) {
    console.error(`  ✗ Error: ${json.error.message}`);
    if (json.error.data) {
      console.error(`    Data: ${JSON.stringify(json.error.data)}`);
    }
    return json;
  }

  console.log(`  ✓ Success`);
  return json;
}

function extractResourceUri(
  result: Record<string, unknown>,
): string | undefined {
  const content = result.content as Array<{ type: string; uri?: string }>;
  return content?.find((c) => c.type === "resource_link")?.uri;
}

function verifyPropsInjection(
  html: string,
  expectedProps: Record<string, unknown>,
): boolean {
  // Check if window.openai.toolInput is present
  if (!html.includes("window.openai")) {
    console.error("  ✗ Missing window.openai injection");
    return false;
  }

  if (!html.includes("toolInput")) {
    console.error("  ✗ Missing toolInput property");
    return false;
  }

  // Try to extract the injected props
  const match = html.match(/window\.openai\.toolInput\s*=\s*({[^}]+})/);
  if (!match) {
    console.error("  ✗ Could not extract toolInput from HTML");
    return false;
  }

  try {
    const injectedProps = JSON.parse(match[1]?.replace(/\s/g, "") ?? "{}");
    const expected = JSON.stringify(expectedProps);
    const actual = JSON.stringify(injectedProps);

    if (expected === actual) {
      console.log(`  ✓ Props correctly injected: ${actual}`);
      return true;
    }

    console.error(`  ✗ Props mismatch`);
    console.error(`    Expected: ${expected}`);
    console.error(`    Actual: ${actual}`);
    return false;
  } catch (error) {
    console.error(`  ✗ Failed to parse injected props: ${error}`);
    return false;
  }
}

async function testWidgetFlow(
  widgetName: string,
  args: Record<string, unknown>,
  description: string,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${description}`);
  console.log("=".repeat(60));

  // Step 1: Call the tool
  console.log(`\nStep 1: Call tool '${widgetName}'`);
  const toolResult = await mcpRequest("tools/call", {
    name: widgetName,
    arguments: args,
  });

  if (toolResult.error) {
    console.error(`\n✗ Test failed at tool call\n`);
    return false;
  }

  // Step 2: Extract resource URI
  const result = toolResult.result as Record<string, unknown>;
  const uri = extractResourceUri(result);

  if (!uri) {
    console.error(`\n✗ No resource URI in tool response`);
    console.error(`  Result: ${JSON.stringify(result, null, 2)}`);
    return false;
  }

  console.log(`\n  Resource URI: ${uri}`);

  // Step 3: Read the resource
  console.log(`\nStep 2: Read resource`);
  const resourceResult = await mcpRequest("resources/read", { uri });

  if (resourceResult.error) {
    console.error(`\n✗ Test failed at resource read\n`);
    return false;
  }

  // Step 4: Verify props injection
  console.log(`\nStep 3: Verify props injection`);
  const resourceData = resourceResult.result as {
    contents: Array<{ text: string }>;
  };
  const html = resourceData.contents[0]?.text;

  if (!html) {
    console.error(`\n✗ No HTML content in resource`);
    return false;
  }

  const propsOk = verifyPropsInjection(html, args);

  console.log(`\n${propsOk ? "✓ Test PASSED" : "✗ Test FAILED"}\n`);
  return propsOk;
}

async function runTests() {
  console.log("MCP-LITE REACT WIDGET MANUAL TESTS");
  console.log("==================================");
  console.log(`Server: ${MCP_URL}\n`);

  // Initialize session
  console.log("Initializing MCP session...");
  const initResult = await mcpRequest("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "test-script",
      version: "1.0.0",
    },
  });

  if (initResult.error) {
    console.error("\n✗ Failed to initialize session");
    console.error("Make sure the MCP server is running:");
    console.error("  cd examples/react-widget && bun run dev\n");
    process.exit(1);
  }

  // List available tools
  console.log(`\n${"=".repeat(60)}`);
  console.log("Available Tools");
  console.log("=".repeat(60));

  const toolsResult = await mcpRequest("tools/list");
  if (!toolsResult.error) {
    const tools = (toolsResult.result as { tools: Array<{ name: string }> })
      .tools;
    console.log(`\nFound ${tools.length} tools:`);
    tools.forEach((tool) => {
      console.log(`  • ${tool.name}`);
    });
  }

  // Run widget tests
  const tests = [
    {
      name: "inline-counter",
      args: { initialCount: 42 },
      description: "Inline Counter with initialCount=42",
    },
    {
      name: "inline-counter",
      args: { initialCount: 0 },
      description: "Inline Counter with initialCount=0",
    },
    {
      name: "weather-widget",
      args: {
        city: "Tokyo",
        temperature: 28,
        weather: "sunny",
      },
      description: "Weather Widget for Tokyo (sunny, 28°C)",
    },
    {
      name: "weather-widget",
      args: {
        city: "London",
        temperature: 12,
        weather: "rain",
      },
      description: "Weather Widget for London (rain, 12°C)",
    },
    {
      name: "task-list",
      args: {
        tasks: ["Buy groceries", "Walk the dog", "Finish project"],
      },
      description: "Task List with 3 tasks",
    },
    {
      name: "task-list",
      args: {
        tasks: [],
      },
      description: "Task List with empty array",
    },
  ];

  const results = [];
  for (const test of tests) {
    const passed = await testWidgetFlow(test.name, test.args, test.description);
    results.push({ ...test, passed });
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST SUMMARY");
  console.log(`${"=".repeat(60)}\n`);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((r) => {
    console.log(`${r.passed ? "✓" : "✗"} ${r.description}`);
  });

  console.log(`\n${passed}/${total} tests passed\n`);

  if (passed < total) {
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("\n✗ Fatal error:");
  console.error(error);
  console.error("\nMake sure the MCP server is running:");
  console.error("  cd examples/react-widget && bun run dev\n");
  process.exit(1);
});

export {};
