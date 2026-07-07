import React from 'react';
import SectionPage from './SectionPage';
import { overviewDocs } from '../../services/io/behaviorDocs';

export default function OverviewPage() {
  return (
    <SectionPage
      sectionId="overview"
      sectionTitle="梗概"
      docs={overviewDocs}
      basePath="/docs/overview"
    />
  );
}
