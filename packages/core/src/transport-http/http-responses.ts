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

/**
 * Responds with a 400 bad request if the session id is missing
 * @todo - we will want to make this response configurable, so someone can use a response format more tailored to their api conventions (https://github.com/fiberplane/mcp/issues/83)
 * @note - since this validaiton happens at the transport layer, we do not respond with a JSON-RPC error
 */
export function respondToMissingSessionId() {
  return new Response("Bad Request: Missing required session ID", {
    status: 400,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
