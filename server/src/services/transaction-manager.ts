import { randomUUID } from 'crypto';
export type Transaction<T> = { id: string; resource: string; snapshot: T; state: 'active' | 'committed' | 'rolledback'; startedAt: string; finishedAt?: string };
const transactions = new Map<string, Transaction<unknown>>();
/** 开始事务并记录资源快照。 */
export function beginTransaction<T>(resource: string, snapshot: T): Transaction<T> { const transaction: Transaction<T> = { id: `tx_${randomUUID()}`, resource, snapshot: structuredClone(snapshot), state: 'active', startedAt: new Date().toISOString() }; transactions.set(transaction.id, transaction); return transaction; }
/** 提交事务（非 active 状态抛错）。 */
export function commitTransaction(id: string) { const transaction = transactions.get(id); if (!transaction || transaction.state !== 'active') throw new Error('事务不存在或已结束'); transaction.state = 'committed'; transaction.finishedAt = new Date().toISOString(); return transaction; }
/** 回滚事务：用快照恢复资源。 */
export function rollbackTransaction<T>(id: string, restore: (snapshot: T) => void) { const transaction = transactions.get(id) as Transaction<T> | undefined; if (!transaction || transaction.state !== 'active') throw new Error('事务不存在或已结束'); restore(structuredClone(transaction.snapshot)); transaction.state = 'rolledback'; transaction.finishedAt = new Date().toISOString(); return transaction; }
/** 事务辅助：成功提交、失败自动回滚并重新抛出。 */
export async function runTransaction<T, R>(resource: string, read: () => T, restore: (snapshot: T) => void, action: () => Promise<R>) { const transaction = beginTransaction(resource, read()); try { const result = await action(); commitTransaction(transaction.id); return result; } catch (error) { rollbackTransaction(transaction.id, restore); throw error; } }
/** 读取事务状态。 */
export function getTransaction(id: string) { return transactions.get(id); }
