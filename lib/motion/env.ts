/**
 * Media queries that gate JavaScript motion. `wide` (900px) is the width from
 * which the gallery pins; the CSS never depends on it (its scroller simply
 * stops scrolling while `data-pinned` is set), so it lives only here.
 */
export const MQ = {
  /** Visitor has NOT asked for reduced motion. Everything animated is behind this. */
  motion: "(prefers-reduced-motion: no-preference)",
  /** Desktop layout: enables the pinned horizontal gallery. */
  wide: "(min-width: 900px)",
} as const;
