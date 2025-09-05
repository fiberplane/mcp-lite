import { RpcError } from "./errors.js";
import type {
  SchemaConverter,
  JsonRpcId,
  JsonRpcMessage,
  MCPServerContext,
  PromptArgumentDef,
} from "./types.js";
import { isStandardSchema, JSON_RPC_ERROR_CODES } from "./types.js";

export function resolveToolSchema(
  inputSchema?: unknown,
  schemaConverter?: SchemaConverter,
): {
  mcpInputSchema: unknown;
  validator?: unknown;
} {
  if (!inputSchema) return { mcpInputSchema: { type: "object" } };

  if (isStandardSchema(inputSchema)) {
    if (!schemaConverter) {
      const vendor = inputSchema["~standard"].vendor;
      throw new Error(
        `Cannot use Standard Schema (vendor: "${vendor}") without a converter. ` +
          `Configure a converter when creating McpServer.`,
      );
    }

    const jsonSchema = schemaConverter(inputSchema);
    return { mcpInputSchema: jsonSchema, validator: inputSchema };
  }

  return { mcpInputSchema: inputSchema };
}

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

export function extractArgumentsFromSchema(
  schema: unknown,
): PromptArgumentDef[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const schemaObj = schema as Record<string, unknown>;

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

  return [];
}

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
