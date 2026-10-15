import { useId } from 'react';
import type { Card, CardColor } from '@uno/shared';
import { COLOR_HEX } from '../lib/cards';

const QUADRANTS: readonly CardColor[] = ['red', 'blue', 'yellow', 'green'];
const INK = '#111111';
const DISPLAY_FONT = "'Fredoka', 'Arial Rounded MT Bold', sans-serif";

/** Reverse arrows, skip sign, numbers… drawn around (0, 0) at the given scale. */
function Glyph({ card, fill, scale }: { card: Card; fill: string; scale: number }) {
  switch (card.value) {
    case 'skip':
      return (
        <g transform={`scale(${scale})`} fill="none" strokeLinecap="round">
          <circle r={17} stroke={INK} strokeWidth={13} />
          <line x1={-12} y1={12} x2={12} y2={-12} stroke={INK} strokeWidth={13} />
          <circle r={17} stroke={fill} strokeWidth={7} />
          <line x1={-12} y1={12} x2={12} y2={-12} stroke={fill} strokeWidth={7} />
        </g>
      );
    case 'reverse': {
      const arrow = '0,-22 12,-8 5,-8 5,10 -5,10 -5,-8 -12,-8';
      return (
        <g
          transform={`scale(${scale})`}
          fill={fill}
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
        >
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
          fontFamily={DISPLAY_FONT}
          fontSize={38}
          fontWeight={700}
          fill={fill}
          stroke={INK}
          strokeWidth={5}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {card.value === 'draw2' ? '+2' : '+4'}
        </text>
      );
    case 'wild':
      return (
        <g transform={`scale(${scale * 0.55})`} stroke={INK} strokeWidth={4} strokeLinejoin="round">
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
          y={18}
          textAnchor="middle"
          fontFamily={DISPLAY_FONT}
          fontSize={52}
          fontWeight={700}
          fill={fill}
          stroke={INK}
          strokeWidth={5}
          strokeLinejoin="round"
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
  const common = { fill: '#fff', stroke: INK, strokeWidth: 1.6 };
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

/** Card artwork on a 100×150 canvas: flat colors, thick ink outlines. */
export function CardFace({ card, colorblind = false }: CardFaceProps) {
  const clipId = useId();
  const isWild = card.kind === 'wild';
  const base = isWild ? INK : COLOR_HEX[card.color];

  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <ellipse cx={50} cy={75} rx={34} ry={54} transform="rotate(28 50 75)" />
        </clipPath>
      </defs>
      <rect
        x={2.5}
        y={2.5}
        width={95}
        height={145}
        rx={11}
        fill={base}
        stroke={INK}
        strokeWidth={5}
      />
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
      ) : null}
      <ellipse
        cx={50}
        cy={75}
        rx={34}
        ry={54}
        transform="rotate(28 50 75)"
        fill={isWild ? 'none' : '#fff'}
        stroke={INK}
        strokeWidth={4}
      />
      <g transform="translate(50 75)">
        {isWild && card.value === 'wild' ? null : (
          <Glyph card={card} fill={isWild ? '#fff' : base} scale={isWild ? 1.05 : 1} />
        )}
      </g>
      <g transform="translate(18 24)">
        <Glyph card={card} fill="#fff" scale={0.38} />
      </g>
      <g transform="translate(82 126) rotate(180)">
        <Glyph card={card} fill="#fff" scale={0.38} />
      </g>
      {colorblind && card.kind === 'colored' ? (
        <>
          <g transform="translate(82 22)">
            <ColorMark color={card.color} />
          </g>
          <g transform="translate(18 128)">
            <ColorMark color={card.color} />
          </g>
        </>
      ) : null}
    </svg>
  );
}

export function CardBackFace() {
  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" aria-hidden="true">
      <rect
        x={2.5}
        y={2.5}
        width={95}
        height={145}
        rx={11}
        fill={INK}
        stroke={INK}
        strokeWidth={5}
      />
      <rect
        x={9}
        y={9}
        width={82}
        height={132}
        rx={7}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeDasharray="5 5"
      />
      <ellipse
        cx={50}
        cy={75}
        rx={32}
        ry={50}
        transform="rotate(28 50 75)"
        fill="#ff4f4f"
        stroke="#fff"
        strokeWidth={3}
      />
      <text
        x={50}
        y={86}
        textAnchor="middle"
        fontFamily={DISPLAY_FONT}
        fontSize={30}
        fontWeight={700}
        fill="#ffd84d"
        stroke={INK}
        strokeWidth={5}
        strokeLinejoin="round"
        paintOrder="stroke"
        transform="rotate(-18 50 75)"
      >
        UNO
      </text>
    </svg>
  );
}
