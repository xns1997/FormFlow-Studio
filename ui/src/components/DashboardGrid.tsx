import { useEffect, useMemo, useState } from 'react';
import { ResponsiveGridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { AdvancedChart, type AdvancedChartType } from './charts/AdvancedChart';
import { dashboardInteractions } from '../services/display/dashboardInteractions';
export type DashboardWidget = { id: string; title: string; type: AdvancedChartType; dimension: string; metric: string };
export function DashboardGrid({ widgets, rows, layout, onLayoutChange }: { widgets: DashboardWidget[]; rows: Record<string, unknown>[]; layout: Layout; onLayoutChange: (layout: Layout) => void }) {
  const { width, containerRef, mounted } = useContainerWidth(); const [, rerender] = useState(0);
  useEffect(() => dashboardInteractions.subscribe(() => rerender((value) => value + 1)), []);
  return <div ref={containerRef}>{mounted && <ResponsiveGridLayout width={width} layouts={{ lg: layout }} breakpoints={{ lg: 1100, md: 700, sm: 0 }} cols={{ lg: 12, md: 8, sm: 4 }} rowHeight={70} dragConfig={{ handle: '.dashboard-widget-title' }} onLayoutChange={(next) => onLayoutChange(next)}>
    {widgets.map((widget) => {
      const filtered = dashboardInteractions.apply(rows, widget.id); const grouped = new Map<string, number>();
      filtered.forEach((row) => { const label = String(row[widget.dimension] ?? '空'); grouped.set(label, (grouped.get(label) || 0) + (Number(row[widget.metric]) || 1)); });
      const data = [...grouped].slice(0, 20).map(([label, value]) => ({ label, value }));
      return <section key={widget.id} className="dashboard-widget"><div className="dashboard-widget-title">{widget.title}</div><AdvancedChart type={widget.type} data={data} onSelect={(item) => dashboardInteractions.set({ sourceId: widget.id, field: widget.dimension, value: item.label })}/></section>;
    })}
  </ResponsiveGridLayout>}</div>;
}
