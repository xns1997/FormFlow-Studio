/**
 * OnboardingGuide — interactive step-by-step guide for new users.
 * Highlights UI elements and guides through core workflow.
 */
import React, { useState, useCallback, useEffect } from 'react';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector to highlight
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: string; // label for the action button
}

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '欢迎使用 FormFlow',
    description: '让我们花 2 分钟了解如何创建你的第一个表单。',
  },
  {
    id: 'data',
    title: '第一步：导入数据',
    description: '点击"数据源"面板，上传 Excel 文件或粘贴 JSON 数据。系统会自动识别字段类型。',
    target: '[data-panel="data-source"]',
    position: 'right',
  },
  {
    id: 'generate',
    title: '第二步：生成表单',
    description: '选择数据表后，点击"生成表单"按钮，系统会根据字段类型自动创建表单布局。',
    target: '[data-action="generate-form"]',
    position: 'bottom',
  },
  {
    id: 'customize',
    title: '第三步：调整设计',
    description: '在设计器中拖拽调整字段顺序，点击字段修改属性。右侧面板会显示所有可配置项。',
    target: '.design-canvas',
    position: 'left',
  },
  {
    id: 'preview',
    title: '第四步：预览测试',
    description: '点击"预览"按钮查看表单运行效果，填写数据并测试提交。',
    target: '[data-action="preview"]',
    position: 'bottom',
  },
  {
    id: 'done',
    title: '准备就绪！',
    description: '你已经了解了基本流程。遇到问题时，点击右上角的帮助按钮查看文档。',
  },
];

interface OnboardingGuideProps {
  steps?: OnboardingStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingGuide({ steps = DEFAULT_STEPS, onComplete, onSkip }: OnboardingGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  useEffect(() => {
    if (!step?.target) {
      setHighlightRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      setHighlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [step]);

  const next = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const prev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  // Position the tooltip relative to the highlight
  const tooltipStyle: React.CSSProperties = (() => {
    if (!highlightRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    const pos = step.position || 'bottom';
    const gap = 12;
    switch (pos) {
      case 'top': return { bottom: window.innerHeight - highlightRect.top + gap, left: highlightRect.left + highlightRect.width / 2, transform: 'translateX(-50%)' };
      case 'bottom': return { top: highlightRect.bottom + gap, left: highlightRect.left + highlightRect.width / 2, transform: 'translateX(-50%)' };
      case 'left': return { top: highlightRect.top + highlightRect.height / 2, right: window.innerWidth - highlightRect.left + gap, transform: 'translateY(-50%)' };
      case 'right': return { top: highlightRect.top + highlightRect.height / 2, left: highlightRect.right + gap, transform: 'translateY(-50%)' };
    }
  })();

  return (
    <div className="onboarding-overlay" role="dialog" aria-label="新手引导">
      {/* Backdrop with cutout for highlighted element */}
      <div className="onboarding-backdrop" onClick={onSkip} />

      {/* Highlight ring */}
      {highlightRect && (
        <div
          className="onboarding-highlight"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Tooltip card */}
      <div className="onboarding-tooltip" style={tooltipStyle}>
        <div className="onboarding-tooltip__step">
          {currentStep + 1} / {steps.length}
        </div>
        <h3 className="onboarding-tooltip__title">{step.title}</h3>
        <p className="onboarding-tooltip__desc">{step.description}</p>
        <div className="onboarding-tooltip__actions">
          <button type="button" className="onboarding-btn onboarding-btn--skip" onClick={onSkip}>
            跳过引导
          </button>
          <div className="onboarding-tooltip__nav">
            {currentStep > 0 && (
              <button type="button" className="onboarding-btn" onClick={prev}>
                上一步
              </button>
            )}
            <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={next}>
              {isLast ? '开始使用' : step.action || '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if user has completed onboarding (stored in localStorage).
 */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem('formflow-onboarding-completed') === 'true';
  } catch {
    return true; // If localStorage fails, skip onboarding
  }
}

export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem('formflow-onboarding-completed', 'true');
  } catch { /* ignore */ }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem('formflow-onboarding-completed');
  } catch { /* ignore */ }
}
