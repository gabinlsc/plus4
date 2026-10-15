import styles from './Decor.module.css';

/** Formes et doodles de fond, dans le style de glsc.fr. Purement décoratifs. */
export function Decor() {
  return (
    <div className={styles.decor} aria-hidden="true">
      <svg className={`${styles.blob} ${styles.blobTop}`} viewBox="0 0 200 200">
        <path
          d="M150 40c30 25 35 75 10 110s-80 45-115 20S0 90 25 55 120 15 150 40Z"
          fill="#ff9478"
          stroke="#111"
          strokeWidth="4"
        />
      </svg>
      <svg className={`${styles.blob} ${styles.blobBottom}`} viewBox="0 0 200 200">
        <path
          d="M160 50c25 30 25 80-5 110s-85 30-115 0-25-90 10-120 85-20 110 10Z"
          fill="#8fd3ff"
          stroke="#111"
          strokeWidth="4"
        />
      </svg>
      <svg className={`${styles.doodle} ${styles.star}`} viewBox="0 0 100 100">
        <path
          d="M50 5 61 38h34L67 58l11 34-28-21-28 21 11-34L5 38h34Z"
          fill="#ffd84d"
          stroke="#111"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
      <svg className={`${styles.doodle} ${styles.sparkle}`} viewBox="0 0 60 60">
        <path
          d="M30 2c3 18 10 25 28 28-18 3-25 10-28 28-3-18-10-25-28-28 18-3 25-10 28-28Z"
          fill="#7be0ad"
          stroke="#111"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>
      <svg className={`${styles.doodle} ${styles.cards}`} viewBox="0 0 100 100">
        <rect
          x="18"
          y="14"
          width="44"
          height="64"
          rx="8"
          fill="#3d7bff"
          stroke="#111"
          strokeWidth="5"
          transform="rotate(-14 40 46)"
        />
        <rect
          x="38"
          y="20"
          width="44"
          height="64"
          rx="8"
          fill="#ff4f4f"
          stroke="#111"
          strokeWidth="5"
          transform="rotate(10 60 52)"
        />
      </svg>
    </div>
  );
}
