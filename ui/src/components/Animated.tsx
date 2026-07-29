/**
 * Animated.tsx — Animation wrapper components
 *
 * Provides declarative animation components for easy integration:
 * - Animated: Generic animation wrapper
 * - AnimatedGroup: Staggered children animations
 * - FadeIn: Fade in animation
 * - SlideIn: Slide in animation
 * - ScaleIn: Scale bounce animation
 * - HoverCard: Card with hover animation
 * - PressButton: Button with press animation
 * - AnimatedNumber: Count up animation
 */

import React, { useRef, useEffect, useCallback, useState, type ReactNode, type CSSProperties } from 'react';
import { animate, stagger } from 'animejs';
import {
  fadeIn,
  fadeOut,
  slideIn,
  scaleBounce,
  staggerIn,
  cardHover,
  buttonPress,
  prefersReducedMotion,
  getDuration,
  SPRING,
  EASE,
  DURATION,
} from '../services/animation';

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

type AnimationType = 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale';

interface AnimatedProps {
  children: ReactNode;
  type?: AnimationType;
  duration?: number;
  delay?: number;
  easing?: string;
  className?: string;
  style?: CSSProperties;
  onComplete?: () => void;
}

interface AnimatedGroupProps {
  children: ReactNode;
  type?: AnimationType;
  stagger?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  format?: (value: number) => string;
}

// ══════════════════════════════════════════════════════════════════════
// Animated Component
// ══════════════════════════════════════════════════════════════════════

/**
 * Generic animation wrapper
 */
export function Animated({
  children,
  type = 'fadeIn',
  duration = DURATION.normal,
  delay = 0,
  easing,
  className,
  style,
  onComplete,
}: AnimatedProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    const el = ref.current;
    const animDuration = getDuration(duration);

    const animations: Record<AnimationType, () => any> = {
      fadeIn: () => fadeIn(el, { duration: animDuration, delay, easing, complete: onComplete }),
      slideUp: () => slideIn(el, 'up', 20, { duration: animDuration, delay, easing: easing ?? SPRING.snappy, complete: onComplete }),
      slideDown: () => slideIn(el, 'down', 20, { duration: animDuration, delay, easing: easing ?? SPRING.snappy, complete: onComplete }),
      slideLeft: () => slideIn(el, 'left', 20, { duration: animDuration, delay, easing: easing ?? SPRING.snappy, complete: onComplete }),
      slideRight: () => slideIn(el, 'right', 20, { duration: animDuration, delay, easing: easing ?? SPRING.snappy, complete: onComplete }),
      scale: () => scaleBounce(el, 0.9, 1, { duration: animDuration, delay, easing: easing ?? SPRING.bounce, complete: onComplete }),
    };

    animations[type]();
  }, [type, duration, delay, easing, onComplete]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// AnimatedGroup Component
// ══════════════════════════════════════════════════════════════════════

/**
 * Staggered children animation wrapper
 */
export function AnimatedGroup({
  children,
  type = 'slideUp',
  stagger = 50,
  duration = DURATION.normal,
  className,
  style,
}: AnimatedGroupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    const children = Array.from(ref.current.children) as HTMLElement[];
    if (!children.length) return;

    const animDuration = getDuration(duration);

    if (type === 'fadeIn') {
      fadeIn(children, { duration: animDuration });
    } else if (type === 'scale') {
      scaleBounce(children, 0.9, 1, { duration: animDuration });
    } else {
      staggerIn(children, { duration: animDuration, stagger });
    }
  }, [type, stagger, duration]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// FadeIn Component
// ══════════════════════════════════════════════════════════════════════

/**
 * Fade in animation wrapper
 */
export function FadeIn({
  children,
  duration = DURATION.normal,
  delay = 0,
  className,
  style,
  onComplete,
}: Omit<AnimatedProps, 'type'>) {
  return (
    <Animated
      type="fadeIn"
      duration={duration}
      delay={delay}
      className={className}
      style={style}
      onComplete={onComplete}
    >
      {children}
    </Animated>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SlideIn Component
// ══════════════════════════════════════════════════════════════════════

interface SlideInProps extends Omit<AnimatedProps, 'type'> {
  direction?: 'up' | 'down' | 'left' | 'right';
}

/**
 * Slide in animation wrapper
 */
export function SlideIn({
  children,
  direction = 'up',
  duration = DURATION.normal,
  delay = 0,
  className,
  style,
  onComplete,
}: SlideInProps) {
  return (
    <Animated
      type={`slide${direction.charAt(0).toUpperCase() + direction.slice(1)}` as AnimationType}
      duration={duration}
      delay={delay}
      className={className}
      style={style}
      onComplete={onComplete}
    >
      {children}
    </Animated>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ScaleIn Component
// ══════════════════════════════════════════════════════════════════════

/**
 * Scale bounce animation wrapper
 */
export function ScaleIn({
  children,
  duration = DURATION.normal,
  delay = 0,
  className,
  style,
  onComplete,
}: Omit<AnimatedProps, 'type'>) {
  return (
    <Animated
      type="scale"
      duration={duration}
      delay={delay}
      className={className}
      style={style}
      onComplete={onComplete}
    >
      {children}
    </Animated>
  );
}

// ══════════════════════════════════════════════════════════════════════
// HoverCard Component
// ══════════════════════════════════════════════════════════════════════

interface HoverCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  scale?: number;
  translateY?: number;
  onClick?: () => void;
}

/**
 * Card with hover animation
 */
export function HoverCard({
  children,
  className,
  style,
  scale = 1.01,
  translateY = -2,
  onClick,
}: HoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    const el = ref.current;

    const handleMouseEnter = () => {
      setIsHovering(true);
      animate(el, {
        
        scale,
        translateY,
        boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,122,255,0.1)',
        duration: DURATION.normal,
        easing: SPRING.snappy,
      });
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      animate(el, {
        
        scale: 1,
        translateY: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.035)',
        duration: DURATION.normal,
        easing: SPRING.snappy,
      });
    };

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [scale, translateY]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ cursor: onClick ? 'pointer' : undefined, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PressButton Component
// ══════════════════════════════════════════════════════════════════════

interface PressButtonProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Button with press animation
 */
export function PressButton({
  children,
  className,
  style,
  onClick,
  disabled,
  type = 'button',
}: PressButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return;

    const el = ref.current;

    const handleMouseDown = () => {
      if (disabled) return;
      animate(el, {
        
        scale: 0.98,
        duration: DURATION.instant,
        easing: SPRING.bounce,
      });
    };

    const handleMouseUp = () => {
      animate(el, {
        
        scale: 1,
        duration: DURATION.instant,
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
  }, [disabled]);

  return (
    <button
      ref={ref}
      type={type}
      className={className}
      style={style}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════
// AnimatedNumber Component
// ══════════════════════════════════════════════════════════════════════

/**
 * Animated number counter
 */
export function AnimatedNumber({
  value,
  duration = DURATION.slow,
  className,
  style,
  format,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) {
      if (ref.current) {
        ref.current.textContent = format ? format(value) : value.toLocaleString();
      }
      return;
    }

    const el = ref.current;
    const obj = { value: prevValue.current };

    animate(obj, {
      value,
      duration: getDuration(duration),
      easing: EASE.out,
      round: 1,
      onUpdate: () => {
        el.textContent = format ? format(obj.value) : obj.value.toLocaleString();
      },
    });

    prevValue.current = value;
  }, [value, duration, format]);

  return (
    <span
      ref={ref}
      className={className}
      style={style}
    >
      {format ? format(value) : value.toLocaleString()}
    </span>
  );
}

export default Animated;
