import React from 'react';
import SectionPage from './SectionPage';
import { formDesignDocs, formDesignCategories } from '../../services/io/behaviorDocs';

export default function FormDesignSectionPage() {
  return (
    <SectionPage
      sectionId="form-design"
      sectionTitle="表单设计"
      docs={formDesignDocs}
      categories={formDesignCategories}
      basePath="/docs/form-design"
    />
  );
}
