import React from 'react';
import SectionPage from './SectionPage';
import { flowNodeDocs, flowNodeCategories } from '../../services/io/behaviorDocs';

export default function FlowNodeSectionPage() {
  return (
    <SectionPage
      sectionId="flow-nodes"
      sectionTitle="流程节点"
      docs={flowNodeDocs}
      categories={flowNodeCategories}
      basePath="/docs/flow-nodes"
    />
  );
}
