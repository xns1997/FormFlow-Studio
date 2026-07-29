import { useMemo } from 'react';
import { useProjectStore } from '../project/store';

interface RecommendedDoc {
  slug: string;
  title: string;
  section: string;
  sectionId: string;
  reason: string;
  score: number;
}

/**
 * 根据当前项目上下文推荐相关文档
 */
export function useDocRecommendations(): RecommendedDoc[] {
  const project = useProjectStore((s) => s.project);

  return useMemo(() => {
    const recommendations: RecommendedDoc[] = [];

    if (!project) {
      // 无项目时推荐入门文档
      recommendations.push(
        { slug: 'quick-start', title: '快速开始', section: '梗概', sectionId: 'overview', reason: '新用户入门', score: 10 },
        { slug: 'project-structure', title: '项目结构', section: '梗概', sectionId: 'overview', reason: '了解项目组织', score: 9 },
      );
      return recommendations.slice(0, 5);
    }

    // 有项目时推荐常用文档
    recommendations.push(
      { slug: 'input', title: '输入框', section: '表单设计', sectionId: 'form-design', reason: '常用控件', score: 8 },
      { slug: 'select', title: '下拉选择', section: '表单设计', sectionId: 'form-design', reason: '常用控件', score: 7 },
      { slug: 'group-data-processing', title: '数据处理', section: '流程节点', sectionId: 'flow-nodes', reason: '数据操作', score: 8 },
      { slug: 'group-behavior', title: '流程行为', section: '流程节点', sectionId: 'flow-nodes', reason: '流程控制', score: 8 },
      { slug: 'on-submit', title: '表单提交', section: '行为', sectionId: 'behavior', reason: '常用事件', score: 6 },
      { slug: 'on-value-change', title: '值变更', section: '行为', sectionId: 'behavior', reason: '常用事件', score: 5 },
      { slug: 'group-scenario', title: '场景模板', section: '流程节点', sectionId: 'flow-nodes', reason: '快速搭建流程', score: 5 },
      { slug: 'group-excel-edit', title: 'Excel 编辑', section: '流程节点', sectionId: 'flow-nodes', reason: 'Excel 操作', score: 4 },
    );

    // 去重并按分数排序
    const seen = new Set<string>();
    const unique = recommendations.filter((doc) => {
      const key = `${doc.sectionId}:${doc.slug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => b.score - a.score);
    return unique.slice(0, 8);
  }, [project]);
}
