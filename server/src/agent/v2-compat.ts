import type { AgentSessionV2 } from '../services/project-agent-v2-store';

/**
 * V3 session extends V2 by removing the legacy `rounds` field
 * and adding `reflections` for self-introspection.
 */
export interface AgentSessionV3 extends Omit<AgentSessionV2, 'schemaVersion' | 'rounds'> {
  schemaVersion: 3;
  reflections?: Array<{
    id: string;
    stepId?: string;
    reason: string;
    suggestion: string;
    pattern?: string;
    createdAt: string;
  }>;
}

/**
 * Migrate a V2 session to V3 format.
 * - Removes legacy `rounds` field
 * - Adds empty `reflections` array
 * - Updates schemaVersion to 3
 */
export function migrateV2toV3(v2: AgentSessionV2): AgentSessionV3 {
  const { schemaVersion, rounds, ...rest } = v2;
  return {
    ...rest,
    schemaVersion: 3,
    reflections: [],
  };
}

/**
 * Make a V3 session backward-compatible for V2 consumers.
 * - Adds back empty `rounds` array
 * - Sets schemaVersion to 2
 * - Strips `reflections`
 */
export function v3toV2Compat(v3: AgentSessionV3): AgentSessionV2 {
  const { reflections, schemaVersion, ...rest } = v3;
  return {
    ...rest,
    schemaVersion: 2,
    rounds: [],
  } as AgentSessionV2;
}

/**
 * Check if a session is V3 format.
 */
export function isV3Session(session: AgentSessionV2 | AgentSessionV3): session is AgentSessionV3 {
  return (session as any).schemaVersion === 3;
}

/**
 * Ensure a session is in V3 format, migrating if needed.
 */
export function ensureV3(session: AgentSessionV2 | AgentSessionV3): AgentSessionV3 {
  if (isV3Session(session)) return session;
  return migrateV2toV3(session);
}
