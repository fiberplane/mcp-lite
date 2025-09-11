export type EventId = string;
export type SessionId = string;

export interface SessionMeta {
  protocolVersion: string;
  clientInfo?: unknown;
}

export interface EventStore {
  // persist outbound message and return assigned event id (monotonic per stream)
  append(id: SessionId, message: unknown): Promise<EventId> | EventId;

  // redeliver messages after lastEventId (if provided), in order, using supplied writer
  replay(
    id: SessionId,
    lastEventId: EventId | undefined,
    write: (eventId: EventId, message: unknown) => Promise<void> | void,
  ): Promise<void>;
}

interface SessionData {
  nextEventId: number;
  buffer: Array<{ id: EventId; message: unknown }>;
}

export class InMemoryEventStore implements EventStore {
  private sessions = new Map<SessionId, SessionData>();
  private maxBufferSize: number;

  constructor(options: { maxBufferSize?: number } = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 1000;
  }

  append(id: SessionId, message: unknown): EventId {
    let session = this.sessions.get(id);
    if (!session) {
      // Lazy create session on first send
      session = { nextEventId: 1, buffer: [] };
      this.sessions.set(id, session);
    }

    const eventId = String(session.nextEventId++);

    // Add to buffer with ring buffer behavior
    session.buffer.push({ id: eventId, message });

    // Trim buffer if it exceeds max size
    if (session.buffer.length > this.maxBufferSize) {
      session.buffer = session.buffer.slice(-this.maxBufferSize);
    }

    return eventId;
  }

  async replay(
    id: SessionId,
    lastEventId: EventId | undefined,
    write: (eventId: EventId, message: unknown) => Promise<void> | void,
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return; // nothing to replay; don't throw
    }

    const lastEventIdNum = lastEventId ? parseInt(lastEventId, 10) : 0;

    // Find events after lastEventId and replay them in order
    for (const event of session.buffer) {
      const eventIdNum = parseInt(event.id, 10);
      if (eventIdNum > lastEventIdNum) {
        await write(event.id, event.message);
      }
    }
  }
}
