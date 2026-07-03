import type { DesignComponent } from '../project/types';
import type { ComponentNode, ComponentEvent } from '../models';

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
        events: { ...dc.props.events, ...eventsMap },
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
  const map: Record<string, ComponentNode['type']> = {
    input: 'input',
    textarea: 'textarea',
    number: 'numberInput',
    numberInput: 'numberInput',
    select: 'select',
    radio: 'radio',
    checkbox: 'checkbox',
    datePicker: 'datePicker',
    switch: 'switch',
    rating: 'rating',
    button: 'button',
    text: 'text',
    table: 'table',
    card: 'container',
    image: 'upload',
    form: 'container',
    tabs: 'tabs',
    divider: 'custom',
    chart: 'custom',
  };
  return map[type] || 'input';
}

function buildPorts(dc: DesignComponent): ComponentNode['ports'] {
  const ports: ComponentNode['ports'] = [];
  const hasValue = !['button', 'text', 'divider', 'card', 'tabs', 'form', 'image', 'table', 'chart'].includes(dc.type);
  if (hasValue) {
    ports.push({ name: 'value', direction: 'input', type: mapDataType(dc.type) });
  }
  if (dc.props.rangeRef) {
    ports.push({ name: 'rangeRef', direction: 'input', type: 'range' });
  }
  return ports;
}

function mapDataType(type: string): string {
  const map: Record<string, string> = {
    input: 'string', textarea: 'string', number: 'number', select: 'string',
    radio: 'string', checkbox: 'array', datePicker: 'date', switch: 'boolean',
    rating: 'number',
  };
  return map[type] || 'any';
}

function buildEvents(dc: DesignComponent): ComponentEvent[] {
  const events: ComponentEvent[] = [];
  const name = dc.props.name || dc.type;

  if (['input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'datePicker', 'switch', 'rating'].includes(dc.type)) {
    events.push({ name: 'onChange', handler: `onFieldChange("${name}")` });
    events.push({ name: 'onBlur', handler: `onFieldBlur("${name}")` });
    events.push({ name: 'onFocus', handler: `onFieldFocus("${name}")` });
  }

  if (dc.type === 'button') {
    events.push({ name: 'onClick', handler: `onButtonClick("${name}")` });
  }

  return events;
}
