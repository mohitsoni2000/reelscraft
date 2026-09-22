import styles from "./Logo.module.css";

/** Brand mark. The outline draws itself once on load (CSS), then the gradient fill fades in. */
export default function Logo({ size = 52 }: { size?: number }) {
  const height = (size * 55) / 52;
  return (
    <a href="#top" aria-label="Reel Craft, back to top" className={styles.logo} style={{ width: size, height }}>
      <svg aria-hidden="true" focusable="false" width={size} height={height} viewBox="0 0 52 55" fill="none" className={styles.svg}>
        <defs>
          <linearGradient id="rcG1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="rgb(114,88,69)" /></linearGradient>
          <linearGradient id="rcG2" x1="1" y1="0" x2="0" y2="1"><stop offset="0.03" stopColor="rgb(118,78,67)" /><stop offset="0.57" stopColor="rgb(220,145,124)" /></linearGradient>
        </defs>
        <path className={styles.path} pathLength="1" transform="translate(17.34 2.78)" fill="url(#rcG1)" stroke="rgb(114,88,69)" strokeWidth="1.2" d="M 14.315 52.22 L 3.226 52.22 C 1.444 52.22 0 50.776 0 48.994 L 0 39.115 C 0 32.26 0 23.59 9.476 12.501 C 15.668 5.255 24.97 1.82 30.992 0.548 C 32.848 0.156 34.477 1.636 34.477 3.533 L 34.477 12.069 C 34.477 13.211 33.874 14.268 32.89 14.848 L 26.614 18.549 C 18.872 23.388 17.34 31.05 17.541 34.276 L 17.541 48.994 C 17.541 50.776 16.097 52.22 14.315 52.22 Z" />
        <path className={styles.path} pathLength="1" fill="url(#rcG2)" stroke="rgb(220,145,124)" strokeWidth="1.2" d="M 3.629 2.095 L 25.064 14.47 C 26.078 15.056 27.359 14.823 28.172 13.98 C 34.86 7.039 43.824 4.134 49.286 3.263 C 50.656 3.045 51.817 4.146 51.817 5.533 L 51.817 15.437 C 51.817 16.333 51.322 17.156 50.53 17.575 L 48.389 18.708 L 26.816 30.445 L 3.629 43.832 C 2.016 44.763 0 43.599 0 41.736 L 0 4.191 C 0 2.328 2.016 1.164 3.629 2.095 Z" />
      </svg>
    </a>
  );
}
