import type { McpServer } from "./core.js";
import { RpcError } from "./errors.js";
import {
  createJsonRpcError,
  isValidJsonRpcRequest,
  JSON_RPC_ERROR_CODES,
} from "./types.js";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_PROTOCOL_HEADER = "MCP-Protocol-Version";

function parseJsonRpc(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON");
  }
}

export class StreamableHttpTransport {
  private server?: McpServer;

  bind(server: McpServer): (request: Request) => Promise<Response> {
    this.server = server;
    return this.handleRequest.bind(this);
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (!this.server) {
      throw new Error("Transport not bound to a server");
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      const errorResponse = createJsonRpcError(
        null,
        new RpcError(
          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          "Only POST method is supported",
        ).toJson(),
      );
      return new Response(JSON.stringify(errorResponse), {
        status: 405,
        headers: {
          Allow: "POST",
        },
      });
    }

    try {
      // Parse request body first
      const body = await request.text();
      const jsonRpcRequest = parseJsonRpc(body);

      // Check if this is a valid JSON-RPC request to extract method
      if (!isValidJsonRpcRequest(jsonRpcRequest)) {
        const errorResponse = createJsonRpcError(
          null,
          new RpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            "Invalid JSON-RPC 2.0 request format",
          ).toJson(),
        );
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      // Protocol header enforcement: Be lenient on initialize, strict after
      const protocolHeader = request.headers.get(DEFAULT_PROTOCOL_HEADER);
      const isInitializeRequest = jsonRpcRequest.method === "initialize";

      if (!isInitializeRequest) {
        // Post-initialization: require exact protocol version match
        if (!protocolHeader) {
          const errorResponse = createJsonRpcError(
            jsonRpcRequest.id,
            new RpcError(
              JSON_RPC_ERROR_CODES.INVALID_REQUEST,
              "Missing required MCP protocol version header",
              {
                expectedHeader: DEFAULT_PROTOCOL_HEADER,
                expectedVersion: DEFAULT_PROTOCOL_VERSION,
              },
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        if (protocolHeader !== DEFAULT_PROTOCOL_VERSION) {
          const errorResponse = createJsonRpcError(
            jsonRpcRequest.id,
            new RpcError(
              JSON_RPC_ERROR_CODES.SERVER_ERROR,
              "Protocol version mismatch",
              {
                expectedVersion: DEFAULT_PROTOCOL_VERSION,
                receivedVersion: protocolHeader,
              },
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      }

      // Dispatch to server
      const response = await this.server._dispatch(jsonRpcRequest);

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      // Handle parsing errors
      const errorResponse = createJsonRpcError(
        null,
        new RpcError(
          JSON_RPC_ERROR_CODES.PARSE_ERROR,
          "Parse error",
          error instanceof Error ? error.message : "Unknown parsing error",
        ).toJson(),
      );

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  }
}
