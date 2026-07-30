/**
 * animation/index.ts — Animation service barrel export
 *
 * Centralized animation system using anime.js with iOS 26/27 spring physics
 */

// Core animation functions
export {
  // Spring physics presets
  SPRING,
  EASE,
  DURATION,

  // Basic animations
  fadeIn,
  fadeOut,
  slideIn,
  scaleBounce,
  staggerIn,
  shake,
  pulse,
  rotate,

  // Composite animations
  modalEnter,
  modalExit,
  toastEnter,
  toastExit,
  cardHover,
  buttonPress,
  fieldFocus,
  tabActivate,
  dropdownEnter,
  dropdownExit,
  sidebarItemHover,
  progressFill,
  countUp,
  checkmarkDraw,

  // Utilities
  prefersReducedMotion,
  getDuration,
  staggerWithPreference,

  // anime.js v4 exports
  animate,
  stagger,
  Timeline,
  set,
} from './anime';

// React hooks
export {
  useAnimate,
  useHover,
  useFocus,
  usePress,
  useInView,
  useStagger,
  useModal,
  useToast,
  useDropdown,
  useShake,
  usePulse,
  useTab,
  useSidebarItem,
} from './useAnime';

// Micro-interactions
export {
  // Form controls
  animateFieldFocus,
  animateFieldError,
  animateFieldSuccess,
  animateToggle,
  animateSwitch,

  // Cards
  animateCardHover,
  animateCardClick,
  animateCardEntrance,

  // Modals/Drawers
  animateModalEnter,
  animateModalExit,

  // Notifications/Toasts
  animateToastEnter,
  animateToastExit,
  animateNotificationCascade,

  // Sidebar items
  animateSidebarHover,
  animateSidebarActive,

  // Tabs
  animateTabSwitch,
  animateTabIndicator,

  // Buttons
  animateButtonPress,
  animateButtonHover,
  animateButtonPulse,

  // Tables
  animateRowHover,
  animateRowSelect,

  // Loading states
  animateSkeletonShimmer,
  animateSpinner,
  animateLoadingPulse,

  // Drag and drop
  animateDragStart,
  animateDragEnd,
  animateDropZoneHighlight,

  // Tree nodes
  animateTreeExpand,
  animateTreeCollapse,
  animateTreeToggle,

  // Dropdown menus
  animateDropdownEnter,
  animateDropdownExit,

  // Progress indicators
  animateProgressFill,
  animateProgressIndeterminate,

  // Error states
  animateErrorShake,
  animateErrorEnter,

  // Success states
  animateCheckmark,
  animateSuccessEnter,

  // Number animation
  animateNumberCountUp,

  // Stagger animation
  animateStaggeredChildren,
} from './microInteractions';

// Micro-interaction hooks
export {
  // Form control hooks
  useFieldFocus,
  useFieldError,
  useFieldSuccess,
  useToggle,
  useSwitch,

  // Card hooks
  useCardHover,
  useCardClick,
  useCardEntrance,

  // Modal/Drawer hooks
  useModalAnimation,

  // Notification/Toast hooks
  useToastAnimation,
  useNotificationCascade,

  // Sidebar hooks
  useSidebarItemAnimation,

  // Tab hooks
  useTabAnimation,

  // Button hooks
  useButtonAnimation,
  useButtonPulse,

  // Table hooks
  useRowAnimation,

  // Loading state hooks
  useSkeleton,
  useSpinner,
  useLoadingPulse,

  // Drag and drop hooks
  useDragAnimation,
  useDropZoneAnimation,

  // Tree node hooks
  useTreeAnimation,

  // Dropdown hooks
  useDropdownAnimation,

  // Progress hooks
  useProgressAnimation,
  useIndeterminateProgress,

  // Error state hooks
  useErrorShake,
  useErrorEnter,

  // Success state hooks
  useCheckmark,
  useSuccessEnter,

  // Number animation hook
  useNumberAnimation,

  // Stagger animation hook
  useStaggerAnimation,
} from './useMicroInteractions';
