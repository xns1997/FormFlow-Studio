import React from 'react';
import SectionPage from './SectionPage';
import { backendDocs } from '../../services/io/behaviorDocs';

export default function BackendSectionPage() {
  return (
    <SectionPage
      sectionId="backend"
      sectionTitle="后端"
      docs={backendDocs}
      basePath="/docs/backend"
    />
  );
}
