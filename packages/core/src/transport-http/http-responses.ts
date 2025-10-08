import { SUPPORTED_MCP_PROTOCOL_VERSIONS_LIST } from "../constants.js";
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
  expected?: string | readonly string[],
) {
  const expectedVersion = expected || SUPPORTED_MCP_PROTOCOL_VERSIONS_LIST;
  const errorResponse = createJsonRpcError(
    responseId,
    new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      "Protocol version mismatch",
      {
        expectedVersion,
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

export function respondToMissingProtocolHeader(responseId: JsonRpcId) {
  const errorResponse = createJsonRpcError(
    responseId,
    new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      "Missing required MCP-Protocol-Version header",
      {
        requiredHeader: "MCP-Protocol-Version",
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
