import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createExampleServer,
  createJsonRpcClient,
  type TestServer,
} from "@internal/test-utils";

describe("Effect Schema Validation Example", () => {
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

  describe("Effect Schema schema validation", () => {
    it("should accept valid input that matches Effect Schema schema", async () => {
      const response = await request("tools/call", {
        name: "echo",
        arguments: {
          message: "Hello, Effect Schema!",
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        content: [
          {
            type: "text",
            text: "Hello, Effect Schema!",
          },
        ],
      });
    });

    it("should reject input missing required field", async () => {
      await expect(
        request("tools/call", {
          name: "echo",
          arguments: {}, // Missing required 'message' field
        }),
      ).rejects.toThrow("JSON-RPC Error");
    });

    it("should reject input with wrong type", async () => {
      await expect(
        request("tools/call", {
          name: "echo",
          arguments: {
            message: 123, // Should be string, not number
          },
        }),
      ).rejects.toThrow("JSON-RPC Error");
    });
  });
});
