export type ImeKeyboardEventLike = {
  isComposing?: boolean;
  keyCode?: number;
};

/**
 * Browsers don't report IME composition uniformly. `isComposing` is the
 * standard signal; keyCode 229 covers Safari and older Chromium composition
 * events where the standard flag can become false just before keyup.
 */
export function isImeKeyboardEvent(event: ImeKeyboardEventLike) {
  return event.isComposing === true || event.keyCode === 229;
}
