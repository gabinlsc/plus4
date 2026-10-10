import styles from './Avatar.module.css';

const PALETTE = ['#7c8cff', '#ff7a90', '#34c38f', '#f5b400', '#4cc9f0', '#c77dff'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  isBot = false,
  size = 44,
}: {
  name: string;
  isBot?: boolean;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: PALETTE[hash(name) % PALETTE.length],
        fontSize: size * 0.38,
      }}
      aria-hidden="true"
    >
      {isBot ? '🤖' : initials}
    </span>
  );
}
