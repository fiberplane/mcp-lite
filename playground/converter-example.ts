import type { Converter, StandardSchemaV1 } from "mcp-mcp-mcp";
import { McpServer, StreamableHttpTransport } from "mcp-mcp-mcp";

// Mock Standard Schema (simulating Zod or similar library)
const createMockZodSchema = (
  jsonSchema: unknown,
): StandardSchemaV1 & { _mockJsonSchema: unknown } => ({
  "~standard": {
    version: 1,
    vendor: "zod",
    validate: (value: unknown) => ({ value }),
  },
  _mockJsonSchema: jsonSchema,
});

// Converter function that extracts JSON Schema from mock Zod schemas
const mockConverter: Converter = (schema: StandardSchemaV1) => {
  return (
    (schema as unknown as { _mockJsonSchema: unknown })._mockJsonSchema || {
      type: "object",
    }
  );
};

// Example 1: Server with converter - Standard Schema works
console.log("=== Example 1: Server WITH converter ===");
const mcpWithConverter = new McpServer({
  name: "converter-example",
  version: "1.0.0",
  converter: mockConverter, // Enable Standard Schema support
});

const zodNumberSchema = createMockZodSchema({
  type: "object",
  properties: { value: { type: "number" } },
  required: ["value"],
});

mcpWithConverter.tool("double", {
  description: "Doubles a number using Standard Schema",
  inputSchema: zodNumberSchema, // This works because we have a converter
  handler: (args: { value: number }) => ({
    content: [{ type: "text", text: String(args.value * 2) }],
  }),
});

console.log("✅ Successfully registered tool with Standard Schema!");

// Example 2: Server without converter - Standard Schema fails
console.log("\n=== Example 2: Server WITHOUT converter ===");
const mcpNoConverter = new McpServer({
  name: "no-converter-example",
  version: "1.0.0",
  // No converter provided
});

try {
  mcpNoConverter.tool("will-fail", {
    description: "This will fail",
    inputSchema: zodNumberSchema, // This will throw an error
    handler: () => ({ content: [] }),
  });
} catch (error) {
  console.log("❌ Expected error:", (error as Error).message);
}

// Example 3: JSON Schema still works without converter
mcpNoConverter.tool("json-schema-works", {
  description: "JSON Schema works fine",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  handler: (args: { text: string }) => ({
    content: [{ type: "text", text: `Echo: ${args.text}` }],
  }),
});

console.log("✅ JSON Schema works without converter!");

// Demonstrate tools/list output
async function demonstrateToolsList() {
  console.log("\n=== Example 3: tools/list output ===");

  const transport = new StreamableHttpTransport();
  const handler = transport.bind(mcpWithConverter);

  const request = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  });

  const response = await handler(request);
  const data = (await response.json()) as { result?: { tools?: unknown[] } };

  console.log("Tools list result:");
  console.log(JSON.stringify(data.result, null, 2));
}

demonstrateToolsList().catch(console.error);
