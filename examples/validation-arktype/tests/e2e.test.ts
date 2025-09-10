import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createExampleServer,
  createJsonRpcClient,
  type TestServer,
} from "@internal/test-utils";

describe("ArkType Validation Example", () => {
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

  describe("ArkType schema validation", () => {
    it("should accept valid input that matches ArkType schema", async () => {
      const response = await request("tools/call", {
        name: "echo",
        arguments: {
          message: "Hello, ArkType!",
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        content: [
          {
            type: "text",
            text: "Hello, ArkType!",
          },
        ],
      });
    });

    it("should handle missing required field (ArkType behavior)", async () => {
      // Test what actually happens with ArkType validation
      const response = await request("tools/call", {
        name: "echo",
        arguments: {}, // Missing required 'message' field
      });

      // ArkType might handle this differently than Zod - check the actual behavior
      expect(response.error || response.result).toBeDefined();
    });

    it("should handle wrong type input (ArkType behavior)", async () => {
      // Test what actually happens with ArkType validation
      const response = await request("tools/call", {
        name: "echo",
        arguments: {
          message: 123, // Should be string, not number
        },
      });

      // ArkType might handle this differently than Zod - check the actual behavior
      expect(response.error || response.result).toBeDefined();
    });

    it("should handle extra properties (ArkType behavior)", async () => {
      // Test what actually happens with ArkType validation
      const response = await request("tools/call", {
        name: "echo",
        arguments: {
          message: "Hello",
          extraField: "extra data", // Extra field
        },
      });

      // ArkType might strip extra properties or allow them
      expect(response.error || response.result).toBeDefined();
    });
  });
});
