import type { EventId } from "./store.js";

export interface StreamWriter {
  write(eventId: EventId, message: unknown): Promise<void> | void;
  end(): void;
}

export class SSEStreamWriter implements StreamWriter {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  write(eventId: EventId, message: unknown): void {
    if (this.closed) {
      return;
    }

    try {
      const data = JSON.stringify(message);
      const sseEvent = `id: ${eventId}\ndata: ${data}\n\n`;
      const encoded = this.encoder.encode(sseEvent);
      this.controller.enqueue(encoded);
    } catch (error) {
      console.error("Error writing SSE event:", error);
      this.end();
    }
  }

  end(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.controller.close();
      } catch (_error) {
        // Controller might already be closed
      }
    }
  }
}

export function createSSEStream(): {
  stream: ReadableStream<Uint8Array>;
  writer: StreamWriter;
} {
  let writer: SSEStreamWriter | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = new SSEStreamWriter(controller);
    },
    cancel() {
      writer?.end();
    },
  });

  if (!writer) {
    throw new Error("Failed to initialize SSE writer");
  }

  return { stream, writer };
}
