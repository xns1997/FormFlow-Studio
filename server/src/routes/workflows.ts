import { ProjectMutationError } from '../services/project-mutation';
import { createProjectResourceRouter } from '../services/project-resource-router';

export const workflowRouter = createProjectResourceRouter({
  kind: 'workflow',
  label: '流程',
  idParam: 'workflowId',
  idPrefix: 'wf',
  read: (project) => project.workflows || [],
  write: (project, workflows) => { project.workflows = workflows; },
  validateDelete: (project, id) => {
    if ((project.forms || []).some((form: unknown) => JSON.stringify(form).includes(id))) {
      throw new ProjectMutationError('RESOURCE_IN_USE', '流程仍被表单引用', 409);
    }
  },
});
