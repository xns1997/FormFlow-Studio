import React from 'react';
import {
  Application,
  Config,
  Connection,
  DataSheet,
  Calendar,
  CardTwo,
  ChartHistogram,
  Checkbox,
  Copy,
  Delete,
  DocDetail,
  Down,
  Edit,
  Form,
  FullScreen,
  Home,
  Lightning,
  List,
  Magic,
  Minus,
  Picture,
  PreviewOpen,
  Radio,
  Redo,
  Right,
  Star,
  Switch,
  Table,
  Text,
  Textarea,
  ToBottom,
  ToTop,
  Tree,
  Undo,
  Experiment,
  Upload,
  ZoomIn,
  ZoomOut,
  Search,
} from '@icon-park/react';

type IconComponent = React.ComponentType<{
  theme?: 'outline' | 'filled' | 'two-tone' | 'multi-color';
  size?: number | string;
  fill?: string | string[];
  strokeWidth?: number;
}>;

const ICONS: Record<string, IconComponent> = {
  toolbox: Application,
  tree: Tree,
  preview: PreviewOpen,
  design: Edit,
  undo: Undo,
  redo: Redo,
  copy: Copy,
  paste: Copy,
  duplicate: Copy,
  delete: Delete,
  bringToFront: ToTop,
  sendToBack: ToBottom,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  fitContent: FullScreen,
  resetView: Home,
  expand: Down,
  collapse: Right,
  input: Edit,
  textarea: Textarea,
  number: Application,
  timePicker: Calendar,
  dateRange: Calendar,
  datePicker: Calendar,
  select: Form,
  segmented: Form,
  radio: Radio,
  checkbox: Checkbox,
  tagInput: Text,
  switch: Switch,
  rating: Star,
  button: Application,
  text: Text,
  image: Picture,
  animatedNumber: ChartHistogram,
  table: Table,
  chart: ChartHistogram,
  card: CardTwo,
  tabs: DocDetail,
  steps: List,
  docs: DocDetail,
  divider: Minus,
  form: Form,
  projects: List,
  data: DataSheet,
  canvas: Connection,
  designer: Magic,
  behavior: Lightning,
  test: Experiment,
  settings: Config,
  upload: Upload,
  imageUpload: Upload,
  search: Search,
};

export function DesignerIcon({
  name,
  fallback,
  size = 16,
  className,
}: {
  name?: string;
  fallback?: string;
  size?: number;
  className?: string;
}) {
  const Icon = name ? ICONS[name] : undefined;
  if (Icon) {
    return (
      <span className={className || 'designer-icon'} aria-hidden="true">
        <Icon theme="outline" size={size} fill="currentColor" strokeWidth={3} />
      </span>
    );
  }
  return <span className={className || 'designer-icon'} aria-hidden="true">{fallback || name || '•'}</span>;
}
