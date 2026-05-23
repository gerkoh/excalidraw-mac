import { useCallback, useLayoutEffect, useRef } from "react";

const TEXTAREA_PAD_Y = 20;
const TEXTAREA_MIN_LINES = 1;
const TEXTAREA_MAX_VISIBLE_LINES = 4;

export function useAutoResizeTextarea(value) {
  const textareaRef = useRef(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const rawLh = parseFloat(cs.lineHeight);
    const fontSize = parseFloat(cs.fontSize);
    const linePx =
      Number.isFinite(rawLh) && rawLh > 0 ? rawLh : Number.isFinite(fontSize) ? fontSize * 1.5 : 21;
    const minH = Math.ceil(linePx * TEXTAREA_MIN_LINES + TEXTAREA_PAD_Y);
    const maxH = Math.ceil(linePx * TEXTAREA_MAX_VISIBLE_LINES + TEXTAREA_PAD_Y);

    el.style.height = "auto";
    const contentH = el.scrollHeight;
    const next = Math.min(maxH, Math.max(minH, contentH));
    el.style.height = `${next}px`;
    el.style.overflowY = contentH > maxH ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return textareaRef;
}
