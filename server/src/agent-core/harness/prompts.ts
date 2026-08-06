/**
 * PromptAssembler（PDF 6.2）：按稳定顺序组合提示词分区。
 * 领域内容由 adapter 构建分区后调用本组装器，保证分区顺序与缓存稳定。
 */
export function assemblePromptSections(sections: Array<string | null | undefined | false>): string {
  return sections.filter((section): section is string => Boolean(section && section.trim())).join('\n');
}
