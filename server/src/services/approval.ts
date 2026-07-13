import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { serverDataPath } from '../config/paths';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';
export type ApprovalNode = {
  id: string;
  type: 'approve' | 'reject' | 'condition' | 'notify';
  label: string;
  assigneeType: 'user' | 'role' | 'expression';
  assigneeValue: string;
  conditionExpression?: string;
  timeoutHours?: number;
  timeoutAction?: 'approve' | 'reject' | 'notify';
  nextNodes: string[];
};
export type ApprovalInstance = {
  id: string;
  projectId: string;
  workflowId: string;
  title: string;
  initiatorId: string;
  initiatorName: string;
  currentNodeId: string;
  status: ApprovalStatus;
  nodes: ApprovalNode[];
  history: Array<{ nodeId: string; action: string; userId: string; username: string; comment?: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
};

const dir = serverDataPath('approvals');
const file = `${dir}/approvals.json`;

function readInstances(): ApprovalInstance[] {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}

function writeInstances(instances: ApprovalInstance[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(instances, null, 2));
}

export function createApprovalInstance(input: {
  projectId: string;
  workflowId: string;
  title: string;
  initiatorId: string;
  initiatorName: string;
  nodes: ApprovalNode[];
}): ApprovalInstance {
  const startNode = input.nodes.find((n) => n.type === 'approve' || n.type === 'reject');
  const instance: ApprovalInstance = {
    id: `approval_${randomUUID()}`,
    projectId: input.projectId,
    workflowId: input.workflowId,
    title: input.title,
    initiatorId: input.initiatorId,
    initiatorName: input.initiatorName,
    currentNodeId: startNode?.id || input.nodes[0]?.id || '',
    status: 'pending',
    nodes: input.nodes,
    history: [{ nodeId: startNode?.id || '', action: 'start', userId: input.initiatorId, username: input.initiatorName, timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeInstances([...readInstances(), instance]);
  return instance;
}

export function processApprovalAction(instanceId: string, userId: string, username: string, action: 'approve' | 'reject', comment?: string): ApprovalInstance | null {
  const instances = readInstances();
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance || instance.status !== 'pending') return null;

  const currentNode = instance.nodes.find((n) => n.id === instance.currentNodeId);
  if (!currentNode) return null;

  instance.history.push({ nodeId: currentNode.id, action, userId, username, comment, timestamp: new Date().toISOString() });

  if (action === 'reject') {
    instance.status = 'rejected';
  } else {
    // 找到下一个节点
    const nextNodeId = currentNode.nextNodes[0];
    if (!nextNodeId) {
      instance.status = 'approved';
    } else {
      instance.currentNodeId = nextNodeId;
      const nextNode = instance.nodes.find((n) => n.id === nextNodeId);
      if (nextNode?.type === 'condition') {
        // 条件节点自动流转（简化处理）
        instance.currentNodeId = nextNode.nextNodes[0] || '';
      }
    }
  }

  instance.updatedAt = new Date().toISOString();
  writeInstances(instances);
  return instance;
}

export function getApprovalInstance(id: string): ApprovalInstance | null {
  return readInstances().find((i) => i.id === id) || null;
}

export function listApprovalInstances(projectId?: string): ApprovalInstance[] {
  let instances = readInstances();
  if (projectId) instances = instances.filter((i) => i.projectId === projectId);
  return instances.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
