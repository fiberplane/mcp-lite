import { RpcError } from "./errors.js";
import type {
  Converter,
  JsonRpcId,
  JsonRpcMessage,
  MCPServerContext,
  PromptArgumentDef,
} from "./types.js";
import { isStandardSchema, JSON_RPC_ERROR_CODES } from "./types.js";

/**
 * Resolves tool input schema, normalizing Standard Schema validators
 * for MCP compliance while preserving validators for runtime use.
 */
export function resolveToolSchema(
  inputSchema?: unknown,
  converter?: Converter,
): {
  mcpInputSchema: unknown;
  validator?: unknown;
} {
  if (!inputSchema) return { mcpInputSchema: { type: "object" } };

  if (isStandardSchema(inputSchema)) {
    if (!converter) {
      const vendor = inputSchema["~standard"].vendor;
      throw new Error(
        `Cannot use Standard Schema (vendor: "${vendor}") without a converter. ` +
          `Configure a converter when creating McpServer.`,
      );
    }
    // Convert StandardSchemaV1 to proper JSON Schema for wire protocol
    const jsonSchema = converter(inputSchema);
    return { mcpInputSchema: jsonSchema, validator: inputSchema };
  }

  // It's already JSON Schema or other supported format
  return { mcpInputSchema: inputSchema };
}

/**
 * Creates a validation function for the MCPServerContext.
 * Supports Standard Schema V1 validators and legacy validator interface.
 */
export function createValidationFunction<T>(
  validator: unknown,
  input: unknown,
): T {
  if (isStandardSchema(validator)) {
    const result = validator["~standard"].validate(input);
    if (result instanceof Promise) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Async validation not supported in this context",
      );
    }
    if ("issues" in result && result.issues?.length) {
      const messages = result.issues.map((i) => i.message).join(", ");
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        `Validation failed: ${messages}`,
      );
    }
    return (result as { value: T }).value;
  }

  if (validator && typeof validator === "object" && "validate" in validator) {
    const validatorObj = validator as {
      validate(input: unknown): {
        ok: boolean;
        data?: unknown;
        issues?: unknown[];
      };
    };
    const result = validatorObj.validate(input);
    if (result?.ok && result.data !== undefined) {
      return result.data as T;
    }
    throw new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      "Validation failed",
    );
  }

  throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Invalid validator");
}

/**
 * Extracts argument definitions from a schema for prompt metadata.
 * Parses JSON Schema to extract parameter information.
 */
export function extractArgumentsFromSchema(
  schema: unknown,
): PromptArgumentDef[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const schemaObj = schema as Record<string, unknown>;

  // Handle JSON Schema
  if (schemaObj.type === "object" && schemaObj.properties) {
    const properties = schemaObj.properties as Record<string, unknown>;
    const required = (schemaObj.required as string[]) || [];

    return Object.entries(properties).map(([name, propSchema]) => {
      const prop = propSchema as Record<string, unknown>;
      return {
        name,
        description: prop.description as string | undefined,
        required: required.includes(name),
      };
    });
  }

  // Handle Standard Schema (Zod, etc.) - would need more complex parsing
  // For now, return empty array for Standard Schema
  return [];
}

/**
 * Creates an MCPServerContext with validation support.
 */
export function createContext(
  message: JsonRpcMessage,
  requestId: JsonRpcId | undefined,
): MCPServerContext {
  return {
    request: message,
    requestId,
    response: null,
    env: {},
    state: {},
    validate: <T>(validator: unknown, input: unknown): T =>
      createValidationFunction<T>(validator, input),
  };
}
