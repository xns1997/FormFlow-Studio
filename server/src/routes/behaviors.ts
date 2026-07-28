import { createProjectResourceRouter } from '../services/project-resource-router';

export const behaviorRouter = createProjectResourceRouter({
  kind: 'behavior',
  label: '行为',
  idParam: 'behaviorId',
  idPrefix: 'bh',
  read: (project) => project.globalBehaviors || project.behaviors || [],
  write: (project, behaviors) => { project.globalBehaviors = behaviors; },
});
