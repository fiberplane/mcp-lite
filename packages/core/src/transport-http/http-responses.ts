import { SUPPORTED_MCP_PROTOCOL_VERSION } from "../constants.js";
import { RpcError } from "../errors.js";
import {
  createJsonRpcError,
  JSON_RPC_ERROR_CODES,
  type JsonRpcId,
} from "../types.js";

export function respondToInvalidJsonRpc() {
  const errorResponse = createJsonRpcError(
    null,
    new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_REQUEST,
      "Invalid JSON-RPC 2.0 message format",
    ).toJson(),
  );

  return new Response(JSON.stringify(errorResponse), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function respondToProtocolMismatch(
  responseId: JsonRpcId,
  protocolHeader: string,
) {
  const errorResponse = createJsonRpcError(
    responseId,
    new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      "Protocol version mismatch",
      {
        expectedVersion: SUPPORTED_MCP_PROTOCOL_VERSION,
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
