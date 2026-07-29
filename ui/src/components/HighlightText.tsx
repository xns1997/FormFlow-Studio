import React from 'react';

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * 高亮文本中匹配搜索关键词的部分
 */
export default function HighlightText({ text, query, className }: HighlightTextProps) {
  if (!query.trim()) {
    return <span className={className}>{text}</span>;
  }

  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // 构建匹配正则
  const escapedKeywords = keywords.map((kw) =>
    kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => part.toLowerCase() === kw);
        return isMatch ? (
          <mark key={i} className="docs-search-highlight">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}
