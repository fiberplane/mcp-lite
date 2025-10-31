import type { InitializeResult } from "../types.js";

/**
 * Client-side session data stored for each session
 */
export interface ClientSessionData {
  sessionId: string;
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  serverCapabilities: InitializeResult["capabilities"];
  createdAt: number;
}

/**
 * Adapter interface for client-side session persistence
 *
 * Implementations can store sessions in memory, localStorage, IndexedDB, etc.
 */
export interface ClientSessionAdapter {
  /**
   * Create and store a new session
   *
   * @param sessionId - Unique session identifier
   * @param data - Session data to store
   */
  create(sessionId: string, data: ClientSessionData): Promise<void> | void;

  /**
   * Retrieve session data by ID
   *
   * @param sessionId - Session identifier
   * @returns Session data if found, undefined otherwise
   */
  get(
    sessionId: string,
  ): Promise<ClientSessionData | undefined> | ClientSessionData | undefined;

  /**
   * Delete a session
   *
   * @param sessionId - Session identifier
   */
  delete(sessionId: string): Promise<void> | void;
}

/**
 * In-memory client session adapter
 *
 * Stores sessions in memory. Sessions are lost when the process exits.
 * Suitable for testing and short-lived clients.
 */
export class InMemoryClientSessionAdapter implements ClientSessionAdapter {
  private sessions = new Map<string, ClientSessionData>();

  create(sessionId: string, data: ClientSessionData): void {
    this.sessions.set(sessionId, data);
  }

  get(sessionId: string): ClientSessionData | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
