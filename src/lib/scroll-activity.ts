/** Flags the element being scrolled with `data-scrolling` so its auto-hidden scrollbar shows (index.css). */
export function trackScrollActivity(idleMs = 900): void {
  const timers = new WeakMap<Element, number>();
  document.addEventListener(
    'scroll',
    (event) => {
      // Page scrolls fire on the document; the page scrollbar belongs to <html>.
      const el = event.target instanceof Element ? event.target : document.documentElement;
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '');
      const pending = timers.get(el);
      if (pending) window.clearTimeout(pending);
      timers.set(
        el,
        window.setTimeout(() => {
          el.removeAttribute('data-scrolling');
          timers.delete(el);
        }, idleMs),
      );
    },
    { capture: true, passive: true },
  );
}
