import type {
  EventId,
  SessionAdapter,
  SessionData,
  SessionId,
  SessionMeta,
} from "mcp-lite";

interface StreamData {
  nextEventId: number;
  eventBuffer: EventData[];
}

interface EventData {
  id: EventId;
  message: unknown;
}

interface SerializedSessionData {
  meta: SessionMeta;
  streams: Record<string, StreamData>;
}

function formatEventId(sequenceNumber: number, streamId: string): string {
  return `${sequenceNumber}#${streamId}`;
}

function parseEventId(eventId: string): {
  sequenceNumber: number;
  streamId: string;
} {
  const hashIndex = eventId.lastIndexOf("#");
  if (hashIndex === -1) {
    throw new Error(`Invalid event ID format: ${eventId}`);
  }
  const seqStr = eventId.slice(0, hashIndex);
  const streamId = eventId.slice(hashIndex + 1);
  const n = parseInt(seqStr, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid sequence number in event ID: ${eventId}`);
  }
  return {
    sequenceNumber: n,
    streamId,
  };
}

function serializeSessionData(sessionData: SessionData): SerializedSessionData {
  const streams: Record<string, StreamData> = {};
  for (const [streamId, streamData] of sessionData.streams) {
    streams[streamId] = streamData;
  }
  return {
    meta: sessionData.meta,
    streams,
  };
}

function deserializeSessionData(data: SerializedSessionData): SessionData {
  const streams = new Map<string, StreamData>();
  for (const [streamId, streamData] of Object.entries(data.streams)) {
    streams.set(streamId, streamData);
  }
  return {
    meta: data.meta,
    streams,
  };
}

export class CloudflareKVSessionAdapter implements SessionAdapter {
  private kv: KVNamespace;
  private maxEventBufferSize: number;
  private keyPrefix: string;

  constructor(options: {
    kv: KVNamespace;
    maxEventBufferSize?: number;
    keyPrefix?: string;
  }) {
    this.kv = options.kv;
    this.maxEventBufferSize = options.maxEventBufferSize ?? 1000;
    this.keyPrefix = options.keyPrefix ?? "mcp-session:";
  }

  generateSessionId(): string {
    return crypto.randomUUID();
  }

  private getSessionKey(id: SessionId): string {
    return `${this.keyPrefix}${id}`;
  }

  async create(id: SessionId, meta: SessionMeta): Promise<SessionData> {
    const sessionData: SessionData = {
      meta,
      streams: new Map(),
    };

    const serialized = serializeSessionData(sessionData);
    await this.kv.put(this.getSessionKey(id), JSON.stringify(serialized));

    return sessionData;
  }

  async has(id: SessionId): Promise<boolean> {
    const value = await this.kv.get(this.getSessionKey(id));
    return value !== null;
  }

  async get(id: SessionId): Promise<SessionData | undefined> {
    const value = await this.kv.get(this.getSessionKey(id));
    if (!value) {
      return undefined;
    }

    try {
      const serialized = JSON.parse(value) as SerializedSessionData;
      return deserializeSessionData(serialized);
    } catch (error) {
      console.error(`Failed to deserialize session data for ${id}:`, error);
      return undefined;
    }
  }

  async appendEvent(
    id: SessionId,
    streamId: string,
    message: unknown,
  ): Promise<EventId | undefined> {
    const sessionData = await this.get(id);
    if (!sessionData) {
      return undefined;
    }

    // Get or create stream data
    let streamData = sessionData.streams.get(streamId);
    if (!streamData) {
      streamData = {
        nextEventId: 1,
        eventBuffer: [],
      };
      sessionData.streams.set(streamId, streamData);
    }

    const eventId = formatEventId(streamData.nextEventId++, streamId);

    // Add to buffer with ring buffer behavior
    streamData.eventBuffer.push({ id: eventId, message });

    // Trim buffer if it exceeds max size
    if (streamData.eventBuffer.length > this.maxEventBufferSize) {
      streamData.eventBuffer = streamData.eventBuffer.slice(
        -this.maxEventBufferSize,
      );
    }

    // Save updated session data back to KV
    const serialized = serializeSessionData(sessionData);
    await this.kv.put(this.getSessionKey(id), JSON.stringify(serialized));

    return eventId;
  }

  async replay(
    id: SessionId,
    lastEventId: EventId,
    write: (eventId: EventId, message: unknown) => Promise<void> | void,
  ): Promise<void> {
    const sessionData = await this.get(id);
    if (!sessionData) {
      return;
    }

    const { sequenceNumber: lastSeq, streamId: targetStreamId } =
      parseEventId(lastEventId);

    // Get the target stream data
    const streamData = sessionData.streams.get(targetStreamId);
    if (!streamData) {
      return;
    }

    // Replay events after lastEventId from the target stream only
    for (const event of streamData.eventBuffer) {
      const { sequenceNumber: eventSeq } = parseEventId(event.id);
      if (eventSeq > lastSeq) {
        await write(event.id, event.message);
      }
    }
  }

  async delete(id: SessionId): Promise<void> {
    await this.kv.delete(this.getSessionKey(id));
  }
}
