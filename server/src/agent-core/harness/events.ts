/**
 * EventEmitter implementation over the thread store: events, observations,
 * messages, metrics and persistence are harness responsibilities.
 */
import {
  addThreadMessage, appendAgentThreadEvent, bumpThreadMetric, flushThreadMetrics,
  resetThreadMetrics, saveAgentThread,
} from '../store';
import type { AgentThread, LoopObservation, LoopQuestion, ThreadMessage } from '../types';
import type { EventEmitter } from './types';

export function storeEventEmitter(): EventEmitter {
  return {
    emit: appendAgentThreadEvent,
    observe(thread: AgentThread, observation: LoopObservation) {
      appendAgentThreadEvent(thread, 'tool_observation', {
        toolName: observation.toolName,
        scope: observation.scope,
        status: observation.status,
        summary: observation.summary,
        changes: observation.changes,
        evidence: observation.evidence,
        unresolved: observation.unresolved,
        error: observation.error,
      });
    },
    message: addThreadMessage as EventEmitter['message'],
    save: saveAgentThread,
    bumpMetric: bumpThreadMetric,
    resetMetrics: resetThreadMetrics,
    flushMetrics: flushThreadMetrics,
  };
}

export type { AgentThread, LoopQuestion, ThreadMessage };
