import type { BehaviorEventDocEntry, BehaviorTopicDocEntry } from './types';

/**
 * 文档过滤与分类的纯函数。
 *
 * 与渲染无关，放在 services 层以便不经 DOM/Vite 即可单测；
 * 三个文档页面共用，避免逐字复制后漂移。
 */

/** 文档与关键词的匹配得分。 */
export function computeMatchScore(doc: BehaviorEventDocEntry, keyword: string): number {
  const kw = keyword.toLowerCase();
  let score = 0;
  if (doc.eventName.toLowerCase().includes(kw)) score += 3;
  if (doc.title.toLowerCase().includes(kw)) score += 2;
  if (doc.tags?.some((t) => t.toLowerCase().includes(kw))) score += 2;
  if (doc.category.toLowerCase().includes(kw)) score += 1;
  if (doc.summary.toLowerCase().includes(kw)) score += 1;
  return score;
}

/** 文档模糊过滤（按标题/描述/关键词）。 */
export function fuzzyFilter(docs: BehaviorEventDocEntry[], query: string): BehaviorEventDocEntry[] {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return docs;

  const scored: Array<{ doc: BehaviorEventDocEntry; score: number }> = [];
  for (const doc of docs) {
    let totalScore = 0;
    let allMatch = true;
    for (const kw of keywords) {
      const score = computeMatchScore(doc, kw);
      if (score === 0) {
        allMatch = false;
        break;
      }
      totalScore += score;
    }
    if (allMatch) scored.push({ doc, score: totalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.doc);
}

/** 推断文档所属分类。 */
export function inferCategory(doc: BehaviorTopicDocEntry, categories: string[]) {
  if (doc.category) return doc.category;
  for (const category of categories) {
    if (doc.id.includes(category.toLowerCase()) || doc.title.includes(category)) return category;
  }
  return categories[0] || '全部';
}
