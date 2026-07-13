export type DashboardFilter = { sourceId: string; field: string; value: unknown };
type Listener = (filters: DashboardFilter[]) => void;
class DashboardInteractions {
  private filters = new Map<string, DashboardFilter>(); private listeners = new Set<Listener>();
  set(filter: DashboardFilter) { this.filters.set(filter.sourceId, filter); this.emit(); }
  clear(sourceId?: string) { sourceId ? this.filters.delete(sourceId) : this.filters.clear(); this.emit(); }
  all() { return [...this.filters.values()]; }
  apply<T extends Record<string, unknown>>(rows: T[], excludeSource?: string) { return rows.filter((row) => this.all().filter((filter) => filter.sourceId !== excludeSource).every((filter) => row[filter.field] === filter.value)); }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { const filters = this.all(); this.listeners.forEach((listener) => listener(filters)); }
}
export const dashboardInteractions = new DashboardInteractions();
