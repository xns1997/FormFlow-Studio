/**
 * anime.ts — Centralized anime.js v4 wrapper with iOS 26/27 spring physics
 *
 * Provides pre-configured animations for common UI patterns:
 * - Page transitions
 * - Modal/dialog animations
 * - Card interactions
 * - Form control feedback
 * - Loading states
 * - Toast notifications
 */

import { animate, stagger, Timeline, set } from 'animejs';

// ══════════════════════════════════════════════════════════════════════
// iOS Spring Physics Presets
// ══════════════════════════════════════════════════════════════════════

/** 弹簧物理参数预设。 */
export const SPRING = {
  /** Bouncy spring for interactive elements */
  bounce: 'spring(1, 80, 10, 0)',
  /** Smooth spring for page transitions */
  smooth: 'spring(1, 100, 14, 0)',
  /** Snappy spring for micro-interactions */
  snappy: 'spring(1, 120, 14, 0)',
  /** Gentle spring for subtle movements */
  gentle: 'spring(1, 60, 14, 0)',
} as const;

/** 缓动函数预设。 */
export const EASE = {
  /** iOS standard ease-out */
  out: 'easeOutExpo',
  /** iOS standard ease-in */
  in: 'easeInExpo',
  /** iOS standard ease-in-out */
  inOut: 'easeInOutExpo',
} as const;

/** 动画时长预设（ms）。 */
export const DURATION = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 400,
  slower: 500,
} as const;

// ══════════════════════════════════════════════════════════════════════
// Core Animation Functions
// ══════════════════════════════════════════════════════════════════════

interface AnimationOptions {
  duration?: number;
  easing?: string;
  delay?: number;
  complete?: () => void;
  update?: (anim: any) => void;
}

/**
 * Fade in an element
 */
/** 淡入动画。 */
export function fadeIn(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [0, 1],
    duration: options.duration ?? DURATION.normal,
    easing: options.easing ?? EASE.out,
    delay: options.delay ?? 0,
  });
}

/**
 * Fade out an element
 */
/** 淡出动画。 */
export function fadeOut(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [1, 0],
    duration: options.duration ?? DURATION.fast,
    easing: options.easing ?? EASE.in,
    delay: options.delay ?? 0,
  });
}

/**
 * Slide in from direction
 */
/** 滑入动画（方向可选）。 */
export function slideIn(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  direction: 'up' | 'down' | 'left' | 'right' = 'up',
  distance = 20,
  options: AnimationOptions = {}
) {
  const props: Record<string, any> = {
    opacity: [0, 1],
    duration: options.duration ?? DURATION.normal,
    easing: options.easing ?? SPRING.snappy,
    delay: options.delay ?? 0,
  };

  if (direction === 'up' || direction === 'down') {
    props.translateY = [direction === 'up' ? distance : -distance, 0];
  } else {
    props.translateX = [direction === 'left' ? distance : -distance, 0];
  }

  return animate(target!, props);
}

/**
 * Scale bounce animation (for buttons, cards)
 */
/** 缩放弹跳动画。 */
export function scaleBounce(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  scaleFrom = 0.95,
  scaleTo = 1,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    scale: [scaleFrom, scaleTo],
    duration: options.duration ?? DURATION.normal,
    easing: options.easing ?? SPRING.bounce,
    delay: options.delay ?? 0,
  });
}

/**
 * Stagger children animation
 */
/** 交错入场动画（列表）。 */
export function staggerIn(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions & { stagger?: number } = {}
) {
  return animate(target!, {
    opacity: [0, 1],
    translateY: [20, 0],
    scale: [0.95, 1],
    duration: options.duration ?? DURATION.normal,
    easing: options.easing ?? SPRING.snappy,
    delay: stagger(options.stagger ?? 50),
  });
}

/**
 * Shake animation (for errors)
 */
/** 抖动动画（错误提示）。 */
export function shake(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    translateX: [
      { to: -4, duration: 50 },
      { to: 4, duration: 50 },
      { to: -4, duration: 50 },
      { to: 4, duration: 50 },
      { to: 0, duration: 50 },
    ],
    easing: 'easeInOutSine',
  });
}

/**
 * Pulse animation (for loading, attention)
 */
/** 脉冲强调动画。 */
export function pulse(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    duration: options.duration ?? DURATION.slow,
    easing: 'easeInOutSine',
    loop: true,
  });
}

/**
 * Rotate animation (for spinners)
 */
/** 旋转动画。 */
export function rotate(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    rotate: '1turn',
    duration: options.duration ?? 800,
    easing: 'linear',
    loop: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Composite Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Modal enter animation
 */
/** 模态框入场动画。 */
export function modalEnter(
  overlay: string | HTMLElement | null,
  content: string | HTMLElement | null
) {
  const tl = new Timeline({ defaults: { ease: EASE.out } });

  tl.add(overlay!, {
    opacity: [0, 1],
    duration: DURATION.fast,
  })
  .add(content!, {
    opacity: [0, 1],
    translateY: [24, 0],
    scale: [0.92, 1],
    duration: DURATION.normal,
    ease: SPRING.snappy,
  }, '-=100');

  return tl;
}

/**
 * Modal exit animation
 */
/** 模态框退场动画。 */
export function modalExit(
  overlay: string | HTMLElement | null,
  content: string | HTMLElement | null,
  complete?: () => void
) {
  const tl = new Timeline({ defaults: { ease: EASE.in }, onComplete: complete });

  tl.add(content!, {
    opacity: [1, 0],
    translateY: [0, 12],
    scale: [1, 0.96],
    duration: DURATION.fast,
  })
  .add(overlay!, {
    opacity: [1, 0],
    duration: DURATION.fast,
  }, '-=100');

  return tl;
}

/**
 * Toast enter animation
 */
/** Toast 入场动画。 */
export function toastEnter(
  target: string | HTMLElement | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [0, 1],
    translateX: [100, 0],
    scale: [0.9, 1],
    duration: options.duration ?? DURATION.normal,
    easing: SPRING.snappy,
    delay: options.delay ?? 0,
  });
}

/**
 * Toast exit animation
 */
/** Toast 退场动画。 */
export function toastExit(
  target: string | HTMLElement | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [1, 0],
    translateX: [0, 100],
    scale: [1, 0.9],
    duration: options.duration ?? DURATION.fast,
    easing: EASE.in,
  });
}

/**
 * Card hover animation
 */
/** 卡片悬停动画。 */
export function cardHover(
  target: string | HTMLElement | null,
  isHovering: boolean
) {
  return animate(target!, {
    translateY: isHovering ? -2 : 0,
    scale: isHovering ? 1.01 : 1,
    boxShadow: isHovering
      ? '0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,122,255,0.1)'
      : '0 2px 4px rgba(0,0,0,0.035)',
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

/**
 * Button press animation
 */
/** 按钮按压动画。 */
export function buttonPress(
  target: string | HTMLElement | null,
  isPressed: boolean
) {
  return animate(target!, {
    scale: isPressed ? 0.98 : 1,
    translateY: isPressed ? 0 : -1,
    duration: DURATION.instant,
    easing: SPRING.bounce,
  });
}

/**
 * Form field focus animation
 */
/** 字段聚焦动画。 */
export function fieldFocus(
  target: string | HTMLElement | null,
  isFocused: boolean
) {
  return animate(target!, {
    scale: isFocused ? 1.01 : 1,
    boxShadow: isFocused
      ? '0 0 0 3px rgba(0,122,255,0.1), 0 4px 12px rgba(0,122,255,0.1)'
      : '0 0 0 0px rgba(0,122,255,0), 0 0px 0px rgba(0,122,255,0)',
    duration: DURATION.fast,
    easing: SPRING.smooth,
  });
}

/**
 * Tab activation animation
 */
/** 页签激活动画。 */
export function tabActivate(
  target: string | HTMLElement | null
) {
  return animate(target!, {
    scale: [1, 1.05, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

/**
 * Dropdown enter animation
 */
/** 下拉菜单入场动画。 */
export function dropdownEnter(
  target: string | HTMLElement | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [0, 1],
    translateY: [-8, 0],
    scaleY: [0.95, 1],
    duration: options.duration ?? DURATION.fast,
    easing: SPRING.snappy,
    delay: options.delay ?? 0,
  });
}

/**
 * Dropdown exit animation
 */
/** 下拉菜单退场动画。 */
export function dropdownExit(
  target: string | HTMLElement | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    opacity: [1, 0],
    translateY: [0, -4],
    scaleY: [1, 0.98],
    duration: options.duration ?? DURATION.instant,
    easing: EASE.in,
  });
}

/**
 * Sidebar item hover animation
 */
/** 侧栏项悬停动画。 */
export function sidebarItemHover(
  target: string | HTMLElement | null,
  isHovering: boolean
) {
  return animate(target!, {
    translateX: isHovering ? 2 : 0,
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

/**
 * Progress bar fill animation
 */
export function progressFill(
  target: string | HTMLElement | null,
  progress: number,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    width: `${progress}%`,
    duration: options.duration ?? DURATION.slow,
    easing: options.easing ?? EASE.out,
  });
}

/**
 * Number count up animation
 */
export function countUp(
  target: string | HTMLElement | null,
  from: number,
  to: number,
  options: AnimationOptions = {}
) {
  const obj = { value: from };
  return animate(obj, {
    value: to,
    duration: options.duration ?? DURATION.slow,
    easing: options.easing ?? EASE.out,
    round: 1,
    update: () => {
      const el = target as HTMLElement;
      if (el && el.textContent !== undefined) {
        el.textContent = obj.value.toLocaleString();
      }
    },
  });
}

/**
 * Success checkmark animation
 */
export function checkmarkDraw(
  target: string | HTMLElement | null,
  options: AnimationOptions = {}
) {
  return animate(target!, {
    strokeDashoffset: [0, 100],
    duration: options.duration ?? DURATION.normal,
    easing: options.easing ?? SPRING.snappy,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Utility Functions
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation duration based on user preference
 */
export function getDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}

/**
 * Create a staggered animation with reduced motion support
 */
export function staggerWithPreference(
  target: string | HTMLElement | HTMLElement[] | NodeList | null,
  props: Record<string, any>,
  staggerMs = 50
) {
  if (prefersReducedMotion()) {
    return animate(target!, {
      ...props,
      duration: 0,
      delay: 0,
    });
  }

  return animate(target!, {
    ...props,
    delay: stagger(staggerMs),
  });
}

export { animate, stagger, Timeline, set };
