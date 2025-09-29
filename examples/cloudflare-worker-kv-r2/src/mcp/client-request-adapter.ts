import type { ClientRequestAdapter } from "mcp-lite";

interface PendingRequest {
  timestamp: number;
  timeoutMs: number;
  status: "pending" | "resolved" | "rejected";
  response?: unknown;
  error?: string;
}

type ClientRequestEntry = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  pollInterval?: ReturnType<typeof setInterval>;
};

export interface CloudflareKVClientRequestAdapterOptions {
  defaultTimeoutMs?: number;
  pollIntervalMs?: number;
}

export class CloudflareKVClientRequestAdapter implements ClientRequestAdapter {
  private localPending = new Map<string, ClientRequestEntry>();
  private defaultTimeoutMs: number;
  private pollIntervalMs: number;

  constructor(
    private kv: KVNamespace,
    options: CloudflareKVClientRequestAdapterOptions = {},
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  createPending(
    sessionId: string | undefined,
    requestId: string | number,
    options?: { timeout_ms?: number },
  ): { promise: Promise<unknown> } {
    const key = `${sessionId ?? ""}:${String(requestId)}`;
    const timeoutMs = options?.timeout_ms ?? this.defaultTimeoutMs;

    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Store pending request metadata in KV
    const pendingRequest: PendingRequest = {
      timestamp: Date.now(),
      timeoutMs,
      status: "pending",
    };

    this.kv.put(`pending:${key}`, JSON.stringify(pendingRequest), {
      expirationTtl: Math.ceil(timeoutMs / 1000) + 60, // Extra buffer for cleanup
    });

    // Store local handlers for this instance
    const localEntry: ClientRequestEntry = { resolve, reject };
    this.localPending.set(key, localEntry);

    // Start polling for response from other instances
    const pollInterval = setInterval(async () => {
      try {
        const stored = (await this.kv.get(
          `pending:${key}`,
          "json",
        )) as PendingRequest | null;

        if (!stored) {
          // Request was cleaned up, likely timed out
          this.cleanupLocal(key, new Error("Request not found"));
          return;
        }

        if (stored.status === "resolved") {
          this.cleanupLocal(key, null, stored.response);
          await this.kv.delete(`pending:${key}`);
        } else if (stored.status === "rejected") {
          this.cleanupLocal(key, new Error(stored.error || "Request rejected"));
          await this.kv.delete(`pending:${key}`);
        } else if (Date.now() - stored.timestamp > stored.timeoutMs) {
          // Timeout
          stored.status = "rejected";
          stored.error = "Timeout";
          await this.kv.put(`pending:${key}`, JSON.stringify(stored));
          this.cleanupLocal(key, new Error("Timeout"));
        }
      } catch (error) {
        this.cleanupLocal(
          key,
          error instanceof Error ? error : new Error("Polling error"),
        );
      }
    }, this.pollIntervalMs);

    localEntry.pollInterval = pollInterval;

    return { promise };
  }

  resolvePending(
    sessionId: string | undefined,
    requestId: string | number,
    response: unknown,
  ): boolean {
    const key = `${sessionId ?? ""}:${String(requestId)}`;

    // Check if we have a local handler
    const localEntry = this.localPending.get(key);
    if (localEntry) {
      this.cleanupLocal(key, null, response);
      return true;
    }

    // Update KV for other instances to pick up
    this.updateKVResponse(key, "resolved", response);
    return false; // We didn't have a local handler, but updated KV
  }

  rejectPending(
    sessionId: string | undefined,
    requestId: string | number,
    reason: unknown,
  ): boolean {
    const key = `${sessionId ?? ""}:${String(requestId)}`;

    // Check if we have a local handler
    const localEntry = this.localPending.get(key);
    if (localEntry) {
      this.cleanupLocal(
        key,
        reason instanceof Error ? reason : new Error(String(reason)),
      );
      return true;
    }

    // Update KV for other instances to pick up
    this.updateKVResponse(key, "rejected", undefined, String(reason));
    return false; // We didn't have a local handler, but updated KV
  }

  private cleanupLocal(key: string, error: unknown, response?: unknown): void {
    const entry = this.localPending.get(key);
    if (!entry) return;

    if (entry.pollInterval) {
      clearInterval(entry.pollInterval);
    }

    this.localPending.delete(key);

    if (error) {
      entry.reject(error);
    } else {
      entry.resolve(response);
    }
  }

  private async updateKVResponse(
    key: string,
    status: "resolved" | "rejected",
    response?: unknown,
    error?: string,
  ): Promise<void> {
    try {
      const stored = (await this.kv.get(
        `pending:${key}`,
        "json",
      )) as PendingRequest | null;
      if (stored && stored.status === "pending") {
        stored.status = status;
        if (response !== undefined) {
          stored.response = response;
        }
        if (error) {
          stored.error = error;
        }
        await this.kv.put(`pending:${key}`, JSON.stringify(stored));
      }
    } catch (err) {
      console.error("Failed to update KV response:", err);
    }
  }
}
