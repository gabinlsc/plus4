import { useId } from 'react';
import type { Card, CardColor } from '@uno/shared';
import { COLOR_HEX } from '../lib/cards';

const QUADRANTS: readonly CardColor[] = ['red', 'blue', 'yellow', 'green'];

/** Reverse arrows, skip sign, numbers… drawn around (0, 0) at the given scale. */
function Glyph({ card, fill, scale }: { card: Card; fill: string; scale: number }) {
  const stroke = 'rgba(0,0,0,0.22)';
  switch (card.value) {
    case 'skip':
      return (
        <g transform={`scale(${scale})`} fill="none" stroke={fill} strokeWidth={7}>
          <circle r={17} />
          <line x1={-12} y1={12} x2={12} y2={-12} />
        </g>
      );
    case 'reverse': {
      const arrow = '0,-22 12,-8 5,-8 5,10 -5,10 -5,-8 -12,-8';
      return (
        <g transform={`scale(${scale})`} fill={fill} stroke={stroke} strokeWidth={1.2}>
          <polygon points={arrow} transform="rotate(45) translate(-7,0)" />
          <polygon points={arrow} transform="rotate(225) translate(-7,0)" />
        </g>
      );
    }
    case 'draw2':
    case 'wild_draw4':
      return (
        <text
          transform={`scale(${scale})`}
          y={13}
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fontStyle="italic"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          paintOrder="stroke"
        >
          {card.value === 'draw2' ? '+2' : '+4'}
        </text>
      );
    case 'wild':
      return (
        <g transform={`scale(${scale * 0.55})`}>
          {QUADRANTS.map((c, i) => (
            <path
              key={c}
              d="M0,0 L0,-24 A24,24 0 0,1 24,0 Z"
              fill={COLOR_HEX[c]}
              transform={`rotate(${i * 90})`}
            />
          ))}
        </g>
      );
    default:
      return (
        <text
          transform={`scale(${scale})`}
          y={17}
          textAnchor="middle"
          fontSize={52}
          fontWeight={800}
          fontStyle="italic"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          paintOrder="stroke"
          textDecoration={card.value === 6 || card.value === 9 ? 'underline' : undefined}
        >
          {card.value}
        </text>
      );
  }
}

/** Shape marker per color for color-blind players. */
function ColorMark({ color }: { color: CardColor }) {
  const common = { fill: '#fff', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 0.8 };
  switch (color) {
    case 'red':
      return <circle r={4.5} {...common} />;
    case 'yellow':
      return <polygon points="0,-5 5,4 -5,4" {...common} />;
    case 'green':
      return <rect x={-4} y={-4} width={8} height={8} {...common} />;
    case 'blue':
      return <polygon points="0,-5.5 5,0 0,5.5 -5,0" {...common} />;
  }
}

export interface CardFaceProps {
  readonly card: Card;
  readonly colorblind?: boolean;
}

/** Card artwork on a 100×150 canvas. */
export function CardFace({ card, colorblind = false }: CardFaceProps) {
  const clipId = useId();
  const isWild = card.kind === 'wild';
  const base = isWild ? '#15171f' : COLOR_HEX[card.color];

  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <ellipse cx={50} cy={75} rx={36} ry={56} transform="rotate(28 50 75)" />
        </clipPath>
        <linearGradient id={`${clipId}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.22} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect width={100} height={150} rx={11} fill="#fdfdfd" />
      <rect x={5} y={5} width={90} height={140} rx={8} fill={base} />
      {isWild ? (
        <g clipPath={`url(#${clipId})`}>
          {QUADRANTS.map((c, i) => (
            <rect
              key={c}
              x={i % 2 === 0 ? 0 : 50}
              y={i < 2 ? 0 : 75}
              width={50}
              height={75}
              fill={COLOR_HEX[c]}
            />
          ))}
        </g>
      ) : (
        <ellipse cx={50} cy={75} rx={36} ry={56} transform="rotate(28 50 75)" fill="#fff" />
      )}
      <g transform="translate(50 75)">
        {isWild && card.value === 'wild' ? null : (
          <Glyph card={card} fill={isWild ? '#fff' : base} scale={isWild ? 1.05 : 1} />
        )}
      </g>
      <g transform="translate(17 22)">
        <Glyph card={card} fill="#fff" scale={0.36} />
      </g>
      <g transform="translate(83 128) rotate(180)">
        <Glyph card={card} fill="#fff" scale={0.36} />
      </g>
      {colorblind && card.kind === 'colored' ? (
        <>
          <g transform="translate(83 20)">
            <ColorMark color={card.color} />
          </g>
          <g transform="translate(17 130)">
            <ColorMark color={card.color} />
          </g>
        </>
      ) : null}
      <rect x={5} y={5} width={90} height={140} rx={8} fill={`url(#${clipId}-shine)`} />
    </svg>
  );
}

export function CardBackFace() {
  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" aria-hidden="true">
      <rect width={100} height={150} rx={11} fill="#fdfdfd" />
      <rect x={5} y={5} width={90} height={140} rx={8} fill="#15171f" />
      <ellipse cx={50} cy={75} rx={36} ry={56} transform="rotate(28 50 75)" fill="#e5484d" />
      <text
        x={50}
        y={86}
        textAnchor="middle"
        fontSize={30}
        fontWeight={800}
        fontStyle="italic"
        fill="#f5b400"
        stroke="#15171f"
        strokeWidth={3}
        paintOrder="stroke"
        transform="rotate(-18 50 75)"
      >
        UNO
      </text>
    </svg>
  );
}
