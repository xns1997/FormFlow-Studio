import type { PropertyStatus, PropertyTaskId } from '../types';
import { PROPERTY_TASKS, propertyStatusLabel } from './propertyMenuModel';

export function PropertyTaskNav({ tasks, statuses, active, onSelect }: { tasks: PropertyTaskId[]; statuses: Partial<Record<PropertyTaskId, PropertyStatus[]>>; active?: PropertyTaskId; onSelect: (task: PropertyTaskId) => void }) {
  return <nav className="property-task-nav" aria-label="配置任务">{tasks.map((task) => {
    const label = propertyStatusLabel(statuses[task] || []);
    const hasError = (statuses[task] || []).some((status) => status.diagnostics.some((item) => item.severity === 'error'));
    return <button key={task} type="button" className={`${active === task ? 'active' : ''} ${hasError ? 'invalid' : ''}`} onClick={() => onSelect(task)}><span>{PROPERTY_TASKS[task].label}</span>{label && <small>{label}</small>}</button>;
  })}</nav>;
}
