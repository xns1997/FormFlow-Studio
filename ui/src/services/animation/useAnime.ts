/**
 * useAnime.ts — React hooks for anime.js v4 animations
 *
 * Provides hooks for common animation patterns:
 * - useAnimate: Generic animation hook
 * - useHover: Hover state animations
 * - useFocus: Focus state animations
 * - usePress: Press/click animations
 * - useInView: Scroll-triggered animations
 * - useStagger: Staggered children animations
 * - useModal: Modal enter/exit animations
 * - useToast: Toast notification animations
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { animate } from 'animejs';
import {
  fadeIn,
  fadeOut,
  slideIn,
  scaleBounce,
  staggerIn,
  shake,
  pulse,
  cardHover,
  buttonPress,
  fieldFocus,
  tabActivate,
  modalEnter,
  modalExit,
  toastEnter,
  toastExit,
  dropdownEnter,
  dropdownExit,
  sidebarItemHover,
  prefersReducedMotion,
  getDuration,
  SPRING,
  DURATION,
} from './anime';

// ══════════════════════════════════════════════════════════════════════
// Generic Animation Hook
// ══════════════════════════════════════════════════════════════════════

interface UseAnimateOptions {
  autoPlay?: boolean;
  deps?: unknown[];
}

/**
 * Generic animation hook that returns a ref and trigger function
 */
export function useAnimate<T extends HTMLElement>(
  animationFn: (target: HTMLElement) => any,
  options: UseAnimateOptions = {}
) {
  const ref = useRef<T>(null);
  const animRef = useRef<any>(null);

  const trigger = useCallback(() => {
    if (ref.current) {
      if (animRef.current) {
        animRef.current.pause();
      }
      animRef.current = animationFn(ref.current);
    }
  }, [animationFn]);

  useEffect(() => {
    if (options.autoPlay && ref.current) {
      animRef.current = animationFn(ref.current);
    }
    return () => {
      if (animRef.current) {
        animRef.current.pause();
      }
    };
  }, options.deps ?? []);

  return { ref, trigger, anim: animRef };
}

// ══════════════════════════════════════════════════════════════════════
// Hover Animation Hook
// ══════════════════════════════════════════════════════════════════════

interface UseHoverOptions {
  scale?: number;
  translateY?: number;
  boxShadow?: string;
  duration?: number;
}

/**
 * Hook for hover state animations
 */
export function useHover<T extends HTMLElement>(options: UseHoverOptions = {}) {
  const ref = useRef<T>(null);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const handleMouseEnter = () => {
      setIsHovering(true);
      animate(el, {
        scale: options.scale ?? 1.02,
        translateY: options.translateY ?? -2,
        boxShadow: options.boxShadow ?? '0 8px 24px rgba(0,0,0,0.12)',
        duration: options.duration ?? DURATION.normal,
        easing: SPRING.snappy,
      });
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      animate(el, {
        scale: 1,
        translateY: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.035)',
        duration: options.duration ?? DURATION.normal,
        easing: SPRING.snappy,
      });
    };

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [options.scale, options.translateY, options.duration]);

  return { ref, isHovering };
}

// ══════════════════════════════════════════════════════════════════════
// Focus Animation Hook
// ══════════════════════════════════════════════════════════════════════

interface UseFocusOptions {
  scale?: number;
  boxShadow?: string;
  duration?: number;
}

/**
 * Hook for focus state animations
 */
export function useFocus<T extends HTMLElement>(options: UseFocusOptions = {}) {
  const ref = useRef<T>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const handleFocus = () => {
      setIsFocused(true);
      animate(el, {
        scale: options.scale ?? 1.01,
        boxShadow: options.boxShadow ?? '0 0 0 3px rgba(0,122,255,0.1), 0 4px 12px rgba(0,122,255,0.1)',
        duration: options.duration ?? DURATION.fast,
        easing: SPRING.smooth,
      });
    };

    const handleBlur = () => {
      setIsFocused(false);
      animate(el, {
        scale: 1,
        boxShadow: '0 0 0 0px rgba(0,122,255,0), 0 0px 0px rgba(0,122,255,0)',
        duration: options.duration ?? DURATION.fast,
        easing: SPRING.smooth,
      });
    };

    el.addEventListener('focus', handleFocus);
    el.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('focus', handleFocus);
      el.removeEventListener('blur', handleBlur);
    };
  }, [options.scale, options.duration]);

  return { ref, isFocused };
}

// ══════════════════════════════════════════════════════════════════════
// Press Animation Hook
// ══════════════════════════════════════════════════════════════════════

interface UsePressOptions {
  scale?: number;
  duration?: number;
}

/**
 * Hook for press/click animations
 */
export function usePress<T extends HTMLElement>(options: UsePressOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const handleMouseDown = () => {
      animate(el, {
        scale: options.scale ?? 0.98,
        duration: options.duration ?? DURATION.instant,
        easing: SPRING.bounce,
      });
    };

    const handleMouseUp = () => {
      animate(el, {
        scale: 1,
        duration: options.duration ?? DURATION.instant,
        easing: SPRING.bounce,
      });
    };

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mouseleave', handleMouseUp);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [options.scale, options.duration]);

  return { ref };
}

// ══════════════════════════════════════════════════════════════════════
// In-View Animation Hook (Scroll Trigger)
// ══════════════════════════════════════════════════════════════════════

interface UseInViewOptions {
  threshold?: number;
  once?: boolean;
  animation?: 'fadeIn' | 'slideUp' | 'slideLeft' | 'scale';
}

/**
 * Hook for scroll-triggered animations
 */
export function useInView<T extends HTMLElement>(options: UseInViewOptions = {}) {
  const ref = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (options.once && hasAnimated.current) return;
          hasAnimated.current = true;

          const animationMap = {
            fadeIn: () => fadeIn(el, { duration: DURATION.normal }),
            slideUp: () => slideIn(el, 'up', 20, { duration: DURATION.normal }),
            slideLeft: () => slideIn(el, 'left', 20, { duration: DURATION.normal }),
            scale: () => scaleBounce(el, 0.9, 1, { duration: DURATION.normal }),
          };

          const animType = options.animation ?? 'fadeIn';
          animationMap[animType]();
        } else if (!options.once) {
          setIsInView(false);
          hasAnimated.current = false;
        }
      },
      { threshold: options.threshold ?? 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.once, options.animation]);

  return { ref, isInView };
}

// ══════════════════════════════════════════════════════════════════════
// Stagger Animation Hook
// ══════════════════════════════════════════════════════════════════════

interface UseStaggerOptions {
  stagger?: number;
  duration?: number;
  animation?: 'fadeIn' | 'slideUp' | 'scale';
}

/**
 * Hook for staggered children animations
 */
export function useStagger<T extends HTMLElement>(options: UseStaggerOptions = {}) {
  const ref = useRef<T>(null);

  const trigger = useCallback(() => {
    if (!ref.current || prefersReducedMotion()) return;

    const children = Array.from(ref.current.children) as HTMLElement[];
    if (!children.length) return;

    const animationMap = {
      fadeIn: () => fadeIn(children, { duration: options.duration ?? DURATION.normal }),
      slideUp: () => staggerIn(children, {
        duration: options.duration ?? DURATION.normal,
        stagger: options.stagger ?? 50,
      }),
      scale: () => scaleBounce(children, 0.9, 1, { duration: options.duration ?? DURATION.normal }),
    };

    const animType = options.animation ?? 'slideUp';
    animationMap[animType]();
  }, [options.stagger, options.duration, options.animation]);

  return { ref, trigger };
}

// ══════════════════════════════════════════════════════════════════════
// Modal Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for modal enter/exit animations
 */
export function useModal(isOpen: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    if (isOpen && overlayRef.current && contentRef.current) {
      modalEnter(overlayRef.current, contentRef.current);
    }
  }, [isOpen]);

  const animateExit = useCallback((onComplete?: () => void) => {
    if (prefersReducedMotion()) {
      onComplete?.();
      return;
    }

    if (overlayRef.current && contentRef.current) {
      modalExit(overlayRef.current, contentRef.current, onComplete);
    } else {
      onComplete?.();
    }
  }, []);

  return { overlayRef, contentRef, animateExit };
}

// ══════════════════════════════════════════════════════════════════════
// Toast Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for toast notification animations
 */
export function useToast(isVisible: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    if (isVisible) {
      toastEnter(ref.current);
    } else {
      toastExit(ref.current);
    }
  }, [isVisible]);

  return { ref };
}

// ══════════════════════════════════════════════════════════════════════
// Dropdown Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for dropdown enter/exit animations
 */
export function useDropdown(isOpen: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    if (isOpen) {
      dropdownEnter(ref.current);
    } else {
      dropdownExit(ref.current);
    }
  }, [isOpen]);

  return { ref };
}

// ══════════════════════════════════════════════════════════════════════
// Shake Animation Hook (for errors)
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for error shake animation
 */
export function useShake() {
  const ref = useRef<HTMLElement>(null);

  const triggerShake = useCallback(() => {
    if (ref.current && !prefersReducedMotion()) {
      shake(ref.current);
    }
  }, []);

  return { ref, triggerShake };
}

// ══════════════════════════════════════════════════════════════════════
// Pulse Animation Hook (for loading)
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for loading pulse animation
 */
export function usePulse(isLoading: boolean) {
  const ref = useRef<HTMLElement>(null);
  const animRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    if (isLoading) {
      animRef.current = pulse(ref.current);
    } else {
      animRef.current?.pause();
      if (ref.current) {
        animate(ref.current, { scale: 1, opacity: 1, duration: 0 });
      }
    }

    return () => {
      animRef.current?.pause();
    };
  }, [isLoading]);

  return { ref };
}

// ══════════════════════════════════════════════════════════════════════
// Tab Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for tab activation animation
 */
export function useTab(isActive: boolean) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    if (isActive) {
      tabActivate(ref.current);
    }
  }, [isActive]);

  return { ref };
}

// ══════════════════════════════════════════════════════════════════════
// Sidebar Item Animation Hook
// ══════════════════════════════════════════════════════════════════════

/**
 * Hook for sidebar item hover animation
 */
export function useSidebarItem() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const handleMouseEnter = () => {
      sidebarItemHover(el, true);
    };

    const handleMouseLeave = () => {
      sidebarItemHover(el, false);
    };

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return { ref };
}

export default useAnimate;
