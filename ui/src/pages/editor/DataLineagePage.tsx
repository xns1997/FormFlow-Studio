import { Typography } from 'antd';
import { DataLineage } from '../../components/DataLineage';
import { useProjectStore } from '../../project/store';
export function DataLineagePage() { const project = useProjectStore((state) => state.project); return <div className="governance-page"><Typography.Title level={4}>数据血缘</Typography.Title><DataLineage project={project}/></div>; }
