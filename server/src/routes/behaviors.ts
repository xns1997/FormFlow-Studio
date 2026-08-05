import { createProjectResourceRouter } from '../services/project-resource-router';

/** 行为资源 CRUD 路由（行为由 behavior MCP 专职写入规则代码）。 */
export const behaviorRouter = createProjectResourceRouter({
  kind: 'behavior',
  label: '行为',
  idParam: 'behaviorId',
  idPrefix: 'bh',
  read: (project) => project.globalBehaviors || project.behaviors || [],
  write: (project, behaviors) => { project.globalBehaviors = behaviors; },
});
