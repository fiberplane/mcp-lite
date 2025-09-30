import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createExampleServer,
  createJsonRpcClient,
  type TestServer,
} from "@internal/test-utils";

describe("Groups Composition Example", () => {
  let server: TestServer;
  let request: ReturnType<typeof createJsonRpcClient>;

  beforeAll(async () => {
    // Start the example server
    server = await createExampleServer(() => import("../src/index.ts"));
    request = createJsonRpcClient(server.url);

    // Initialize the server
    await request("initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    });
  });

  afterAll(async () => {
    await server?.stop();
  });

  describe("Tool listing", () => {
    it("should list all tools from composed servers with correct names", async () => {
      const response = await request("tools/list", {});

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const tools = response.result.tools;
      const toolNames = tools.map((tool: { name: string }) => tool.name);

      // Validate tools - should have all 9 tools from the three composed servers
      expect(toolNames).toContain("validate/email");
      expect(toolNames).toContain("validate/url");
      expect(toolNames).toContain("validate/json");
      expect(toolNames).toContain("transform/camelCase");
      expect(toolNames).toContain("transform/snakeCase");
      expect(toolNames).toContain("transform/base64Encode");
      expect(toolNames).toContain("transform/base64Decode");
      expect(toolNames).toContain("format/json");
      expect(toolNames).toContain("format/bytes");

      // Should have exactly 9 tools
      expect(tools.length).toBe(9);
    });
  });

  describe("Tool execution", () => {
    it("should call validate/email tool successfully", async () => {
      const response = await request("tools/call", {
        name: "validate/email",
        arguments: {
          value: "test@example.com",
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        content: [
          {
            type: "text",
            text: "valid",
          },
        ],
      });
    });

    it("should call transform/camelCase tool successfully", async () => {
      const response = await request("tools/call", {
        name: "transform/camelCase",
        arguments: {
          value: "hello world example",
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        content: [
          {
            type: "text",
            text: "helloWorldExample",
          },
        ],
      });
    });

    it("should call format/bytes tool successfully", async () => {
      const response = await request("tools/call", {
        name: "format/bytes",
        arguments: {
          bytes: 1024,
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        content: [
          {
            type: "text",
            text: "1.00 KB",
          },
        ],
      });
    });
  });
});
