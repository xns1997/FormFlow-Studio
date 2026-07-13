import type { DesignComponent } from '../project/types';
import type { ComponentNode, ComponentEvent } from '../models';
import { getDesignValuePortType, getRuntimeComponentType, isInteractiveComponentType } from '../services/config/controlTypes';

export function exportToComponentNodes(components: DesignComponent[]): ComponentNode[] {
  return components.map((dc, index) => {
    const events = buildEvents(dc);
    const eventsMap: Record<string, string> = {};
    for (const evt of events) eventsMap[evt.name] = evt.handler;
    return {
      id: dc.id,
      type: mapControlType(dc.type),
      name: dc.fieldBinding || dc.props.name || dc.type + '_' + index,
      label: dc.props.label || dc.props.text || dc.props.title || dc.props.content || dc.type,
      props: {
        ...dc.props,
        // Runtime scripts come only from explicit designer code, not from generated event handler names.
        events: { ...(dc.props.events || {}) },
        designType: dc.type,
        x: dc.x,
        y: dc.y,
        width: dc.width,
        height: dc.height,
        zIndex: dc.zIndex,
        parentId: dc.parentId,
        children: dc.children,
      },
      layout: {
        row: Math.round(dc.y / 50),
        col: Math.round(dc.x / 100),
        colSpan: Math.round(dc.width / 100) || 1,
        rowSpan: Math.round(dc.height / 50) || 1,
      },
      ports: buildPorts(dc),
      events,
    };
  });
}

function mapControlType(type: string): ComponentNode['type'] {
  return getRuntimeComponentType(type) as ComponentNode['type'];
}

function buildPorts(dc: DesignComponent): ComponentNode['ports'] {
  const ports: ComponentNode['ports'] = [];
  const hasValue = !['button', 'text', 'animatedNumber', 'divider', 'card', 'tabs', 'steps', 'form', 'image', 'table', 'chart'].includes(dc.type);
  if (hasValue) {
    ports.push({ name: 'value', direction: 'input', type: getDesignValuePortType(dc.type) });
  }
  if (dc.props.rangeRef) {
    ports.push({ name: 'rangeRef', direction: 'input', type: 'range' });
  }
  return ports;
}

function buildEvents(dc: DesignComponent): ComponentEvent[] {
  const events: ComponentEvent[] = [];
  const name = dc.props.name || dc.type;

  if (isInteractiveComponentType(dc.type) && dc.type !== 'button' && dc.type !== 'tabs' && dc.type !== 'steps' && dc.type !== 'image') {
    events.push({ name: 'onChange', handler: `onFieldChange("${name}")` });
    events.push({ name: 'onBlur', handler: `onFieldBlur("${name}")` });
    events.push({ name: 'onFocus', handler: `onFieldFocus("${name}")` });
  }

  if (dc.type === 'button') {
    events.push({ name: 'onClick', handler: `onButtonClick("${name}")` });
  }

  if (dc.type === 'tabs') events.push({ name: 'onTabChange', handler: `onValueChange("${name}")` });
  if (dc.type === 'steps') events.push({ name: 'onChange', handler: `onValueChange("${name}")` });
  if (dc.type === 'image') events.push({ name: 'onClick', handler: `onButtonClick("${name}")` });

  return events;
}
