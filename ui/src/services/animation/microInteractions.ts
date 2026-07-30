/**
 * microInteractions.ts — Comprehensive micro-interaction animations
 *
 * Provides anime.js-based animations for all interactive elements:
 * - Form controls (focus, blur, change, error)
 * - Cards (hover, click, entrance)
 * - Modals/Drawers (enter, exit)
 * - Notifications/Toasts (slide in/out)
 * - Sidebar items (hover, active)
 * - Tabs (switch)
 * - Buttons (press, hover)
 * - Tables (row hover, selection)
 * - Loading states (skeleton, spinner)
 * - Drag and drop (start, end)
 * - Tree nodes (expand/collapse)
 * - Dropdown menus (enter, exit)
 * - Progress indicators (fill)
 * - Error states (shake)
 * - Success states (checkmark)
 */

import { animate, stagger, Timeline } from 'animejs';
import { prefersReducedMotion, DURATION, SPRING, EASE } from './anime';

// ══════════════════════════════════════════════════════════════════════
// Form Control Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate form field focus
 */
export function animateFieldFocus(target: HTMLElement, isFocused: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: isFocused ? 1.02 : 1,
    boxShadow: isFocused
      ? '0 0 0 3px rgba(0,122,255,0.15), 0 4px 12px rgba(0,122,255,0.1)'
      : '0 0 0 0px rgba(0,122,255,0), 0 0px 0px rgba(0,122,255,0)',
    duration: DURATION.fast,
    easing: SPRING.smooth,
  });
}

/**
 * Animate form field error
 */
export function animateFieldError(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: [
      { to: -6, duration: 50 },
      { to: 6, duration: 50 },
      { to: -4, duration: 50 },
      { to: 4, duration: 50 },
      { to: 0, duration: 50 },
    ],
    easing: 'easeInOutSine',
  });
}

/**
 * Animate form field success
 */
export function animateFieldSuccess(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: [1, 1.05, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

/**
 * Animate checkbox/radio toggle
 */
export function animateToggle(target: HTMLElement, isChecked: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: isChecked ? [1, 1.3, 1] : [1, 0.8, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

/**
 * Animate switch toggle
 */
export function animateSwitch(target: HTMLElement, isOn: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: isOn ? [0, 4, 0] : [0, -4, 0],
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Card Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate card hover
 */
export function animateCardHover(target: HTMLElement, isHovering: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateY: isHovering ? -4 : 0,
    scale: isHovering ? 1.02 : 1,
    boxShadow: isHovering
      ? '0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,122,255,0.1)'
      : '0 2px 8px rgba(0,0,0,0.06)',
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

/**
 * Animate card click
 */
export function animateCardClick(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: [1, 0.98, 1],
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

/**
 * Animate card entrance (staggered)
 */
export function animateCardEntrance(targets: HTMLElement[] | NodeList) {
  if (prefersReducedMotion()) return;

  animate(targets, {
    opacity: [0, 1],
    translateY: [30, 0],
    scale: [0.95, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
    delay: stagger(60),
  });
}

// ══════════════════════════════════════════════════════════════════════
// Modal/Drawer Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate modal/drawer enter
 */
export function animateModalEnter(overlay: HTMLElement, content: HTMLElement) {
  if (prefersReducedMotion()) return;

  const tl = new Timeline();

  tl.add(overlay, {
    opacity: [0, 1],
    duration: DURATION.fast,
    easing: EASE.out,
  })
  .add(content, {
    opacity: [0, 1],
    translateY: [30, 0],
    scale: [0.95, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  }, '-=100');
}

/**
 * Animate modal/drawer exit
 */
export function animateModalExit(
  overlay: HTMLElement,
  content: HTMLElement,
  onComplete?: () => void
) {
  if (prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const tl = new Timeline(onComplete ? { onComplete } : undefined);

  tl.add(content, {
    opacity: [1, 0],
    translateY: [0, 20],
    scale: [1, 0.98],
    duration: DURATION.fast,
    easing: EASE.in,
  })
  .add(overlay, {
    opacity: [1, 0],
    duration: DURATION.fast,
    easing: EASE.in,
  }, '-=100');
}

// ══════════════════════════════════════════════════════════════════════
// Notification/Toast Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate toast enter
 */
export function animateToastEnter(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    opacity: [0, 1],
    translateX: [100, 0],
    scale: [0.9, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

/**
 * Animate toast exit
 */
export function animateToastExit(target: HTMLElement, onComplete?: () => void) {
  if (prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const params: Record<string, any> = {
    opacity: [1, 0],
    translateX: [0, 100],
    scale: [1, 0.9],
    duration: DURATION.fast,
    easing: EASE.in,
  };
  if (onComplete) params.onComplete = onComplete;
  animate(target, params);
}

/**
 * Animate notification cascade
 */
export function animateNotificationCascade(targets: HTMLElement[] | NodeList) {
  if (prefersReducedMotion()) return;

  animate(targets, {
    opacity: [0, 1],
    translateY: [-20, 0],
    scale: [0.9, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
    delay: stagger(80),
  });
}

// ══════════════════════════════════════════════════════════════════════
// Sidebar Item Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate sidebar item hover
 */
export function animateSidebarHover(target: HTMLElement, isHovering: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: isHovering ? 4 : 0,
    backgroundColor: isHovering
      ? 'rgba(0,122,255,0.08)'
      : 'rgba(0,122,255,0)',
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

/**
 * Animate sidebar item active
 */
export function animateSidebarActive(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: [1, 1.02, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Tab Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate tab switch
 */
export function animateTabSwitch(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: [1, 1.05, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

/**
 * Animate tab indicator
 */
export function animateTabIndicator(target: HTMLElement, fromX: number, toX: number) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: [fromX, toX],
    scaleX: [0.8, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Button Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate button press
 */
export function animateButtonPress(target: HTMLElement, isPressed: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: isPressed ? 0.95 : 1,
    translateY: isPressed ? 1 : 0,
    duration: DURATION.instant,
    easing: SPRING.bounce,
  });
}

/**
 * Animate button hover
 */
export function animateButtonHover(target: HTMLElement, isHovering: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateY: isHovering ? -2 : 0,
    scale: isHovering ? 1.02 : 1,
    duration: DURATION.fast,
    easing: SPRING.snappy,
  });
}

/**
 * Animate primary button pulse
 */
export function animateButtonPulse(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    boxShadow: [
      '0 4px 12px rgba(0,122,255,0.2)',
      '0 4px 20px rgba(0,122,255,0.4), 0 0 0 4px rgba(0,122,255,0.1)',
      '0 4px 12px rgba(0,122,255,0.2)',
    ],
    duration: 600,
    easing: 'easeInOutSine',
  });
}

// ══════════════════════════════════════════════════════════════════════
// Table Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate table row hover
 */
export function animateRowHover(target: HTMLElement, isHovering: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    backgroundColor: isHovering
      ? 'rgba(0,122,255,0.04)'
      : 'rgba(0,122,255,0)',
    duration: DURATION.fast,
    easing: EASE.out,
  });
}

/**
 * Animate table row selection
 */
export function animateRowSelect(target: HTMLElement, isSelected: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    backgroundColor: isSelected
      ? 'rgba(0,122,255,0.08)'
      : 'rgba(0,122,255,0)',
    scale: isSelected ? [1, 1.01, 1] : 1,
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Loading State Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate skeleton shimmer
 */
export function animateSkeletonShimmer(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    backgroundPosition: ['200% 0', '-200% 0'],
    duration: 1500,
    easing: 'linear',
    loop: true,
  });
}

/**
 * Animate spinner rotation
 */
export function animateSpinner(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    rotate: '1turn',
    duration: 800,
    easing: 'linear',
    loop: true,
  });
}

/**
 * Animate loading pulse
 */
export function animateLoadingPulse(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    opacity: [1, 0.5, 1],
    scale: [1, 0.98, 1],
    duration: 1500,
    easing: 'easeInOutSine',
    loop: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Drag and Drop Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate drag start
 */
export function animateDragStart(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: 1.05,
    opacity: 0.8,
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    duration: DURATION.fast,
    easing: SPRING.snappy,
  });
}

/**
 * Animate drag end
 */
export function animateDragEnd(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: 1,
    opacity: 1,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

/**
 * Animate drop zone highlight
 */
export function animateDropZoneHighlight(target: HTMLElement, isHighlighted: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    borderColor: isHighlighted
      ? 'rgba(0,122,255,0.5)'
      : 'rgba(0,122,255,0)',
    backgroundColor: isHighlighted
      ? 'rgba(0,122,255,0.05)'
      : 'rgba(0,122,255,0)',
    scale: isHighlighted ? 1.01 : 1,
    duration: DURATION.fast,
    easing: SPRING.snappy,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Tree Node Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate tree node expand
 */
export function animateTreeExpand(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    height: [0, 'auto'],
    opacity: [0, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

/**
 * Animate tree node collapse
 */
export function animateTreeCollapse(target: HTMLElement, onComplete?: () => void) {
  if (prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const params: Record<string, any> = {
    height: [target.scrollHeight, 0],
    opacity: [1, 0],
    duration: DURATION.fast,
    easing: EASE.in,
  };
  if (onComplete) params.onComplete = onComplete;
  animate(target, params);
}

/**
 * Animate tree toggle rotation
 */
export function animateTreeToggle(target: HTMLElement, isExpanded: boolean) {
  if (prefersReducedMotion()) return;

  animate(target, {
    rotate: isExpanded ? '90deg' : '0deg',
    duration: DURATION.fast,
    easing: SPRING.bounce,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Dropdown Menu Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate dropdown enter
 */
export function animateDropdownEnter(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    opacity: [0, 1],
    translateY: [-8, 0],
    scaleY: [0.95, 1],
    duration: DURATION.fast,
    easing: SPRING.snappy,
  });
}

/**
 * Animate dropdown exit
 */
export function animateDropdownExit(target: HTMLElement, onComplete?: () => void) {
  if (prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const params: Record<string, any> = {
    opacity: [1, 0],
    translateY: [0, -4],
    scaleY: [1, 0.98],
    duration: DURATION.instant,
    easing: EASE.in,
  };
  if (onComplete) params.onComplete = onComplete;
  animate(target, params);
}

// ══════════════════════════════════════════════════════════════════════
// Progress Indicator Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate progress bar fill
 */
export function animateProgressFill(target: HTMLElement, progress: number) {
  if (prefersReducedMotion()) return;

  animate(target, {
    width: `${progress}%`,
    duration: DURATION.slow,
    easing: EASE.out,
  });
}

/**
 * Animate indeterminate progress
 */
export function animateProgressIndeterminate(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: ['-100%', '100%'],
    duration: 1500,
    easing: 'linear',
    loop: true,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Error State Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate error shake
 */
export function animateErrorShake(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    translateX: [
      { to: -8, duration: 50 },
      { to: 8, duration: 50 },
      { to: -6, duration: 50 },
      { to: 6, duration: 50 },
      { to: -3, duration: 50 },
      { to: 3, duration: 50 },
      { to: 0, duration: 50 },
    ],
    easing: 'easeInOutSine',
  });
}

/**
 * Animate error message enter
 */
export function animateErrorEnter(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    opacity: [0, 1],
    translateY: [-8, 0],
    height: [0, 'auto'],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Success State Animations
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate success checkmark
 */
export function animateCheckmark(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    scale: [0, 1.2, 1],
    opacity: [0, 1],
    duration: DURATION.normal,
    easing: SPRING.bounce,
  });
}

/**
 * Animate success message
 */
export function animateSuccessEnter(target: HTMLElement) {
  if (prefersReducedMotion()) return;

  animate(target, {
    opacity: [0, 1],
    scale: [0.9, 1],
    duration: DURATION.normal,
    easing: SPRING.snappy,
  });
}

// ══════════════════════════════════════════════════════════════════════
// Number Animation
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate number count up
 */
export function animateNumberCountUp(
  target: HTMLElement,
  from: number,
  to: number,
  format?: (value: number) => string
) {
  if (prefersReducedMotion()) {
    target.textContent = format ? format(to) : to.toLocaleString();
    return;
  }

  const obj = { value: from };
  animate(obj, {
    value: to,
    duration: DURATION.slow,
    easing: EASE.out,
    round: 1,
    onUpdate: () => {
      target.textContent = format ? format(obj.value) : obj.value.toLocaleString();
    },
  });
}

// ══════════════════════════════════════════════════════════════════════
// Stagger Animation
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate staggered children
 */
export function animateStaggeredChildren(
  targets: HTMLElement[] | NodeList,
  animation: 'fadeIn' | 'slideUp' | 'scale' = 'slideUp',
  staggerMs = 50
) {
  if (prefersReducedMotion()) return;

  const animations = {
    fadeIn: {
      opacity: [0, 1],
      duration: DURATION.normal,
      easing: EASE.out,
    },
    slideUp: {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: DURATION.normal,
      easing: SPRING.snappy,
    },
    scale: {
      opacity: [0, 1],
      scale: [0.9, 1],
      duration: DURATION.normal,
      easing: SPRING.bounce,
    },
  };

  animate(targets, {
    ...animations[animation],
    delay: stagger(staggerMs),
  });
}
