import type { McpServer } from "./core.js";
import { RpcError } from "./errors.js";
import {
  createJsonRpcError,
  isValidJsonRpcRequest,
  JSON_RPC_ERROR_CODES,
} from "./types.js";

export interface StreamableHttpTransportOptions {
  protocol?: {
    version?: string;
    headerName?: string;
  };
  headers?: Record<string, string>;
}

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
  private options: {
    protocol: {
      version: string;
      headerName: string;
    };
    headers: Record<string, string>;
  };
  private server?: McpServer;

  constructor(options: StreamableHttpTransportOptions = {}) {
    this.options = {
      protocol: {
        version: options.protocol?.version ?? DEFAULT_PROTOCOL_VERSION,
        headerName: options.protocol?.headerName ?? DEFAULT_PROTOCOL_HEADER,
      },
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };
  }

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
          ...this.options.headers,
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
          headers: this.options.headers,
        });
      }

      // Protocol header enforcement: Be lenient on initialize, strict after
      const protocolHeader = request.headers.get(
        this.options.protocol.headerName,
      );
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
                expectedHeader: this.options.protocol.headerName,
                expectedVersion: this.options.protocol.version,
              },
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: this.options.headers,
          });
        }

        if (protocolHeader !== this.options.protocol.version) {
          const errorResponse = createJsonRpcError(
            jsonRpcRequest.id,
            new RpcError(
              JSON_RPC_ERROR_CODES.SERVER_ERROR,
              "Protocol version mismatch",
              {
                expectedVersion: this.options.protocol.version,
                receivedVersion: protocolHeader,
              },
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: this.options.headers,
          });
        }
      }

      // Dispatch to server
      const response = await this.server._dispatch(jsonRpcRequest);

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: this.options.headers,
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
        headers: this.options.headers,
      });
    }
  }
}
