import type { JsonRpcError } from "./types.js";

export class RpcError extends Error {
	public readonly code: number;
	public readonly data?: unknown;
	public readonly cause?: unknown;

	constructor(code: number, message: string, data?: unknown, cause?: unknown) {
		super(message);
		this.name = "RpcError";
		this.code = code;
		this.data = data;
		this.cause = cause;
		Object.setPrototypeOf(this, new.target.prototype);
	}

	toJson(): JsonRpcError {
		return {
			code: this.code,
			message: this.message,
			data: this.data,
		};
	}
}
