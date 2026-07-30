/**
 * useMicroInteractions.ts — React hooks for micro-interactions
 *
 * Provides easy-to-use hooks for all interactive elements
 */

import { useRef, useEffect, useCallback, useState, type RefObject } from 'react';
import {
  animateFieldFocus,
  animateFieldError,
  animateFieldSuccess,
  animateToggle,
  animateSwitch,
  animateCardHover,
  animateCardClick,
  animateCardEntrance,
  animateModalEnter,
  animateModalExit,
  animateToastEnter,
  animateToastExit,
  animateNotificationCascade,
  animateSidebarHover,
  animateSidebarActive,
  animateTabSwitch,
  animateButtonPress,
  animateButtonHover,
  animateButtonPulse,
  animateRowHover,
  animateRowSelect,
  animateSkeletonShimmer,
  animateSpinner,
  animateLoadingPulse,
  animateDragStart,
  animateDragEnd,
  animateDropZoneHighlight,
  animateTreeExpand,
  animateTreeCollapse,
  animateTreeToggle,
  animateDropdownEnter,
  animateDropdownExit,
  animateProgressFill,
  animateProgressIndeterminate,
  animateErrorShake,
  animateErrorEnter,
  animateCheckmark,
  animateSuccessEnter,
  animateNumberCountUp,
  animateStaggeredChildren,
} from './microInteractions';
import { prefersReducedMotion } from './anime';

// ══════════════════════════════════════════════════════════════════════
// Form Control Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for form field focus animation
 */
export function useFieldFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleFocus = () => animateFieldFocus(el, true);
    const handleBlur = () => animateFieldFocus(el, false);

    el.addEventListener('focus', handleFocus);
    el.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('focus', handleFocus);
      el.removeEventListener('blur', handleBlur);
    };
  }, []);

  return ref;
}

/**
 * Hook for form field error animation
 */
export function useFieldError() {
  const ref = useRef<HTMLElement>(null);

  const triggerError = useCallback(() => {
    if (ref.current) animateFieldError(ref.current);
  }, []);

  return { ref, triggerError };
}

/**
 * Hook for form field success animation
 */
export function useFieldSuccess() {
  const ref = useRef<HTMLElement>(null);

  const triggerSuccess = useCallback(() => {
    if (ref.current) animateFieldSuccess(ref.current);
  }, []);

  return { ref, triggerSuccess };
}

/**
 * Hook for toggle animation
 */
export function useToggle<T extends HTMLElement>(isChecked: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateToggle(ref.current, isChecked);
  }, [isChecked]);

  return ref;
}

/**
 * Hook for switch animation
 */
export function useSwitch<T extends HTMLElement>(isOn: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateSwitch(ref.current, isOn);
  }, [isOn]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Card Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for card hover animation
 */
export function useCardHover<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseEnter = () => {
      setIsHovering(true);
      animateCardHover(el, true);
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      animateCardHover(el, false);
    };

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return { ref, isHovering };
}

/**
 * Hook for card click animation
 */
export function useCardClick<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const handleClick = useCallback(() => {
    if (ref.current) animateCardClick(ref.current);
  }, []);

  return { ref, handleClick };
}

/**
 * Hook for card entrance animation
 */
export function useCardEntrance<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) {
      const cards = ref.current.querySelectorAll('.project-card, .card, [class*="card"]');
      if (cards.length) animateCardEntrance(Array.from(cards) as HTMLElement[]);
    }
  }, []);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Modal/Drawer Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for modal/drawer animation
 */
export function useModalAnimation(isOpen: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && overlayRef.current && contentRef.current) {
      animateModalEnter(overlayRef.current, contentRef.current);
    }
  }, [isOpen]);

  const animateExit = useCallback((onComplete?: () => void) => {
    if (overlayRef.current && contentRef.current) {
      animateModalExit(overlayRef.current, contentRef.current, onComplete);
    } else {
      onComplete?.();
    }
  }, []);

  return { overlayRef, contentRef, animateExit };
}

// ══════════════════════════════════════════════════════════════════════
// Notification/Toast Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for toast animation
 */
export function useToastAnimation(isVisible: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (isVisible) {
      animateToastEnter(ref.current);
    } else {
      animateToastExit(ref.current);
    }
  }, [isVisible]);

  return ref;
}

/**
 * Hook for notification cascade animation
 */
export function useNotificationCascade<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) {
      const items = ref.current.querySelectorAll('.notification-item, [class*="notification"]');
      if (items.length) animateNotificationCascade(Array.from(items) as HTMLElement[]);
    }
  }, []);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Sidebar Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for sidebar item animation
 */
export function useSidebarItemAnimation<T extends HTMLElement>(isActive: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseEnter = () => animateSidebarHover(el, true);
    const handleMouseLeave = () => animateSidebarHover(el, false);

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    if (isActive && ref.current) animateSidebarActive(ref.current);
  }, [isActive]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Tab Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for tab animation
 */
export function useTabAnimation<T extends HTMLElement>(isActive: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isActive && ref.current) animateTabSwitch(ref.current);
  }, [isActive]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Button Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for button animation
 */
export function useButtonAnimation<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseDown = () => animateButtonPress(el, true);
    const handleMouseUp = () => animateButtonPress(el, false);
    const handleMouseEnter = () => animateButtonHover(el, true);
    const handleMouseLeave = () => {
      animateButtonHover(el, false);
      animateButtonPress(el, false);
    };

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return ref;
}

/**
 * Hook for primary button pulse animation
 */
export function useButtonPulse<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateButtonPulse(ref.current);
  }, []);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Table Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for table row animation
 */
export function useRowAnimation<T extends HTMLElement>(isSelected: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseEnter = () => animateRowHover(el, true);
    const handleMouseLeave = () => animateRowHover(el, false);

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    if (ref.current) animateRowSelect(ref.current, isSelected);
  }, [isSelected]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Loading State Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for skeleton animation
 */
export function useSkeleton<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateSkeletonShimmer(ref.current);
  }, []);

  return ref;
}

/**
 * Hook for spinner animation
 */
export function useSpinner<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateSpinner(ref.current);
  }, []);

  return ref;
}

/**
 * Hook for loading pulse animation
 */
export function useLoadingPulse<T extends HTMLElement>(isLoading: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateLoadingPulse(ref.current);
  }, [isLoading]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Drag and Drop Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for drag animation
 */
export function useDragAnimation<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const handleDragStart = useCallback(() => {
    if (ref.current) animateDragStart(ref.current);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (ref.current) animateDragEnd(ref.current);
  }, []);

  return { ref, handleDragStart, handleDragEnd };
}

/**
 * Hook for drop zone animation
 */
export function useDropZoneAnimation<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const handleDragEnter = useCallback(() => {
    if (ref.current) animateDropZoneHighlight(ref.current, true);
  }, []);

  const handleDragLeave = useCallback(() => {
    if (ref.current) animateDropZoneHighlight(ref.current, false);
  }, []);

  return { ref, handleDragEnter, handleDragLeave };
}

// ══════════════════════════════════════════════════════════════════════
// Tree Node Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for tree node animation
 */
export function useTreeAnimation<T extends HTMLElement>(isExpanded: boolean) {
  const ref = useRef<T>(null);
  const contentRef = useRef<T>(null);

  useEffect(() => {
    if (contentRef.current) {
      if (isExpanded) {
        animateTreeExpand(contentRef.current);
      } else {
        animateTreeCollapse(contentRef.current);
      }
    }
  }, [isExpanded]);

  return { ref, contentRef };
}

// ══════════════════════════════════════════════════════════════════════
// Dropdown Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for dropdown animation
 */
export function useDropdownAnimation<T extends HTMLElement>(isOpen: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (isOpen) {
      animateDropdownEnter(ref.current);
    } else {
      animateDropdownExit(ref.current);
    }
  }, [isOpen]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Progress Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for progress bar animation
 */
export function useProgressAnimation<T extends HTMLElement>(progress: number) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateProgressFill(ref.current, progress);
  }, [progress]);

  return ref;
}

/**
 * Hook for indeterminate progress animation
 */
export function useIndeterminateProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) animateProgressIndeterminate(ref.current);
  }, []);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Error State Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for error shake animation
 */
export function useErrorShake() {
  const ref = useRef<HTMLElement>(null);

  const triggerShake = useCallback(() => {
    if (ref.current) animateErrorShake(ref.current);
  }, []);

  return { ref, triggerShake };
}

/**
 * Hook for error message animation
 */
export function useErrorEnter<T extends HTMLElement>(hasError: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (hasError && ref.current) animateErrorEnter(ref.current);
  }, [hasError]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Success State Hooks
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for checkmark animation
 */
export function useCheckmark<T extends HTMLElement>(isChecked: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isChecked && ref.current) animateCheckmark(ref.current);
  }, [isChecked]);

  return ref;
}

/**
 * Hook for success message animation
 */
export function useSuccessEnter<T extends HTMLElement>(isSuccess: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isSuccess && ref.current) animateSuccessEnter(ref.current);
  }, [isSuccess]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Number Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for number count up animation
 */
export function useNumberAnimation<T extends HTMLElement>(
  value: number,
  format?: (value: number) => string
) {
  const ref = useRef<T>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (ref.current) {
      animateNumberCountUp(ref.current, prevValue.current, value, format);
      prevValue.current = value;
    }
  }, [value, format]);

  return ref;
}

// ══════════════════════════════════════════════════════════════════════
// Stagger Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for staggered children animation
 */
export function useStaggerAnimation<T extends HTMLElement>(
  animation: 'fadeIn' | 'slideUp' | 'scale' = 'slideUp',
  staggerMs = 50
) {
  const ref = useRef<T>(null);

  const trigger = useCallback(() => {
    if (ref.current) {
      const children = Array.from(ref.current.children) as HTMLElement[];
      if (children.length) animateStaggeredChildren(children, animation, staggerMs);
    }
  }, [animation, staggerMs]);

  return { ref, trigger };
}
