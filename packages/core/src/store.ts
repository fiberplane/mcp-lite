export type EventId = string;
export type SessionId = string;

export interface SessionMeta {
  protocolVersion: string;
  clientInfo?: unknown;
}

export interface SessionStore {
  // session CRUD
  create(id: SessionId, meta: SessionMeta): void;
  has(id: SessionId): boolean;
  delete(id: SessionId): void;

  // persist outbound message and return assigned event id (monotonic per session)
  send(id: SessionId, message: unknown): Promise<EventId> | EventId;

  // redeliver messages after lastEventId (if provided), in order, using supplied writer
  replay(
    id: SessionId,
    lastEventId: EventId | undefined,
    write: (eventId: EventId, message: unknown) => Promise<void> | void,
  ): Promise<void>;
}

interface SessionData {
  meta: SessionMeta;
  nextEventId: number;
  buffer: Array<{ id: EventId; message: unknown }>;
}

export class InMemoryStore implements SessionStore {
  private sessions = new Map<SessionId, SessionData>();
  private maxBufferSize: number;

  constructor(options: { maxBufferSize?: number } = {}) {
    this.maxBufferSize = options.maxBufferSize ?? 1000;
  }

  create(id: SessionId, meta: SessionMeta): void {
    this.sessions.set(id, {
      meta,
      nextEventId: 1,
      buffer: [],
    });
  }

  has(id: SessionId): boolean {
    return this.sessions.has(id);
  }

  delete(id: SessionId): void {
    this.sessions.delete(id);
  }

  send(id: SessionId, message: unknown): EventId {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
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
      throw new Error(`Session not found: ${id}`);
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
