import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serverDataPath } from '../config/paths';

export interface ProjectMutationReplay<T = unknown> {
  fingerprint: string;
  result: T;
  expiresAt: number;
}

export interface ProjectMutationReplayStore {
  get<T>(key: string): ProjectMutationReplay<T> | undefined;
  set<T>(key: string, replay: ProjectMutationReplay<T>): void;
}

export function createMemoryProjectMutationReplayStore(): ProjectMutationReplayStore {
  const entries = new Map<string, ProjectMutationReplay>();
  return {
    get: <T>(key: string) => entries.get(key) as ProjectMutationReplay<T> | undefined,
    set: <T>(key: string, replay: ProjectMutationReplay<T>) => { entries.set(key, replay); },
  };
}

/**
 * A restart-safe adapter. It deliberately reads on every operation so separate
 * server processes observe the same replay ledger rather than keeping divergent
 * process-local maps.
 */
export function createFileProjectMutationReplayStore(
  filePath = serverDataPath('project-mutation-replays.json'),
  options: { ttlMs?: number; maxEntries?: number } = {},
): ProjectMutationReplayStore {
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1_000;
  const maxEntries = options.maxEntries ?? 1_000;
  const read = () => {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, ProjectMutationReplay>;
    } catch {
      return {};
    }
  };
  const persist = (entries: Record<string, ProjectMutationReplay>) => {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(entries));
    renameSync(temporary, filePath);
  };
  return {
    get<T>(key: string) {
      const entries = read();
      const replay = entries[key];
      if (!replay) return undefined;
      if (replay.expiresAt <= Date.now()) {
        delete entries[key];
        persist(entries);
        return undefined;
      }
      return replay as ProjectMutationReplay<T>;
    },
    set<T>(key: string, replay: ProjectMutationReplay<T>) {
      const now = Date.now();
      const entries = Object.fromEntries(
        Object.entries(read())
          .filter(([, value]) => value.expiresAt > now)
          .sort(([, left], [, right]) => right.expiresAt - left.expiresAt)
          .slice(0, Math.max(0, maxEntries - 1)),
      );
      entries[key] = { ...replay, expiresAt: replay.expiresAt || now + ttlMs };
      persist(entries);
    },
  };
}

export const projectMutationReplayStore = createFileProjectMutationReplayStore();
