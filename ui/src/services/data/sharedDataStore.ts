import { create } from 'zustand';
import type { RangeRef } from '../../models';

interface SharedDataState {
  pendingRowData: Record<string, unknown> | null;
  pendingRowSource: string;
  pendingRangeRef: Record<string, RangeRef>;
  setPendingRowData: (data: Record<string, unknown>, source: string) => void;
  clearPendingRowData: () => void;
  setPendingRangeRef: (connections: Record<string, RangeRef>) => void;
  clearPendingRangeRef: () => void;
}

export const useSharedDataStore = create<SharedDataState>((set) => ({
  pendingRowData: null,
  pendingRowSource: '',
  pendingRangeRef: {},
  setPendingRowData: (data, source) => set({ pendingRowData: data, pendingRowSource: source }),
  clearPendingRowData: () => set({ pendingRowData: null, pendingRowSource: '' }),
  setPendingRangeRef: (connections) => set({ pendingRangeRef: connections }),
  clearPendingRangeRef: () => set({ pendingRangeRef: {} }),
}));
