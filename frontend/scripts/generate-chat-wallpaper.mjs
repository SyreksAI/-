import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const TILE = 340;
const ICON = 44;
const ICON_COUNT = 50;
const MIN_DIST = 34;
const MARGIN = 14;
const BG_COLOR = '#f0f2f5';
const ICON_OPACITY = 0.07;

// Уникальные контуры Syrek — только для этого проекта.
const syrekIcons = [
  'M12 4 L8.5 8.5 7.5 13 9.5 17 12 15.5 14.5 17 16.5 13 15.5 8.5 Z M9.5 10.5 h1.2 M13.3 10.5 h1.2 M10.5 13.2 q1.5 1.2 3 0',
  'M12 5 a7 7 0 1 1 0 14 a7 7 0 1 1 0-14 M12 8 v8 M8.5 12 h7 M9.5 9.5 l5 5 M14.5 9.5 l-5 5',
  'M11 3 l3 6 h4 l-3 10 h-4 l-3-10 h4z M9 19 v2 M13 19 v2 M12 9 l-2 3 M12 9 l2 3',
  'M12 4 l6 3.5 v7 L12 18 l-6-3.5 v-7 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 1 0 0-6 M12 7 v2 M12 15 v2',
  'M12 3 l4.5 6.5-1 8.5 h-7 l-1-8.5 Z M12 3 v15 M7.5 9.5 h9 M9 13 h6',
  'M5 12 h14 a5 2.5 0 0 0-14 0z M12 9.5 a1.8 1.8 0 0 1 0 3.6 M8 9 l1.5-3 M16 9 l-1.5-3 M12 14 v3 M10 17 h4',
  'M6 8 h8 v11 H6z M14 8 h4 v11 h-4z M10 6 v2 M14 6 v2 M10 8 c-2 0-4 2-4 4 M14 8 c2 0 4 2 4 4',
  'M8 14 c0-4 3-6 6-6 s6 2 6 6-3 6-6 6 c-2 0-3-1-4-2 M14 8 l2-2 M15 16 l2 1',
  'M5 14 l12-6-3 8-5 2 1-4z M8 13 h0.1 M10 12.2 h0.1 M9.2 14.5 q0.8 0.6 1.6 0',
  'M9 8 a4 4 0 1 0 0 8 a3 3 0 1 1 0-8 M15 8 a4 4 0 1 1 0 8 a3 3 0 1 0 0-8',
  'M8 13 h8 v4 H8z M7 13 c0-4 3.5-6 5-6 s5 2 5 6 M14 8 a1 1 0 1 0 0.1 0 M16 10 a0.8 0.8 0 1 0 0.1 0',
  'M7 16 v3 M10 14 c0-3 2-5 4-5 M14 14 c0-2 1.5-3 3-3 M16 15 l2-4 1 5 M6 17 h6',
];

// Простые контуры в 24x24 (stroke-only).
const icons = [
  'M12 2l2.4 7.2H22l-6 4.4 2.4 7.4L12 16.8 5.6 21l2.4-7.4-6-4.4h7.6z',
  'M12 20s-6.8-4.2-6.8-9.4A3.6 3.6 0 0 1 12 9a3.6 3.6 0 0 1 6.8 1.6C18.8 15.8 12 20 12 20z',
  'M6 14c0-4 2.6-7 6-7s6 3 6 7-2.6 7-6 7-6-3-6-7z M9 10h1M14 10h1 M10 14c1 1 3 1 4 0',
  'M4 10c0-3 2.4-5 5-5h6c2.6 0 5 2 5 5v8H4v-8z M8 18v2M16 18v2',
  'M8 6h8v12H8z M10 9h4M10 12h4',
  'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  'M6 8c2-3 10-3 12 0v8c-2 3-10 3-12 0V8z M9 12h6',
  'M7 18c0-4 2.2-7 5-7s5 3 5 7 M12 11V7 M10 7h4',
  'M8 10h8v8H8z M10 8V6h4v2',
  'M6 14h12M8 10h8M10 6h4',
  'M12 4c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7z M9 11h6M12 8v6',
  'M5 12h14M12 5v14',
  'M8 8l8 8M16 8l-8 8',
  'M6 6h12v12H6z M9 9h6v6H9z',
  'M12 3l8 4.5v9L12 21l-8-4.5v-9z',
  'M4 16l8-8 8 8',
  'M6 18h12M8 14h8M10 10h4',
  'M7 7h10v10H7z M9 9h6v6H9z M11 11h2v2h-2z',
  'M5 19l3-6 4 2 3-5 4 3',
  'M8 16c0-3 1.8-5 4-5s4 2 4 5-1.8 5-4 5-4-2-4-5z M12 7V5',
  'M6 10c0-2 1.6-4 4-4h4c2.4 0 4 2 4 4v6H6v-6z M9 16v2h6v-2',
  'M12 4v16M8 8h8M8 16h8',
  'M5 12a7 7 0 1 1 14 0M12 19v2',
  'M8 6h8l-1 12H9L8 6z M10 10h4',
  'M6 8h12v10H6z M9 8V6h6v2',
  'M12 5l7 4v6l-7 4-7-4V9z',
  'M7 10h10M7 14h7',
  'M10 6c3 0 5 2 5 5v7H5v-7c0-3 2-5 5-5z',
  'M8 12h8M12 8v8',
  'M6 6l12 12M18 6L6 18',
  'M5 8c3-2 11-2 14 0v8c-3 2-11 2-14 0V8z',
  'M9 10l3 3 5-5',
  'M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z M8 12h8',
  'M6 16l6-10 6 10z',
  'M8 18h8M10 14h4M12 6v4',
  'M7 9h10v8H7z M9 7h6',
  'M5 12h14M8 8v8M16 8v8',
  'M12 4l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z',
  'M6 7h12v10H6z M8 10h8M8 13h5',
  'M10 5h4v14h-4z M6 9h12',
  'M8 8c2-2 6-2 8 0M7 12c3 2 7 2 10 0M8 16c2 2 6 2 8 0',
  'M5 10h14v8H5z M8 10V7h8v3',
  'M12 6v12M8 10h8M8 14h8',
  'M7 8h10v8H7z M9 10h6M9 13h4',
  'M6 12c0-4 2.7-7 6-7s6 3 6 7',
  'M9 6h6l1 12h-8l1-12z',
  'M8 10l4-4 4 4M8 14l4 4 4-4',
  'M12 4c3 0 5 2 5 5v7H7V9c0-3 2-5 5-5z',
  'M6 8h12M6 12h12M6 16h8',
  'M10 6h4v12h-4z M6 10h12M6 14h12',
  'M8 7h8v10H8z M10 17h4',
  'M12 5l6 3v6l-6 3-6-3V8z',
  'M7 9c2-2 8-2 10 0M7 15c2 2 8 2 10 0',
  'M5 7h14v10H5z M8 10h8M8 13h5',
  'M12 3v6M9 9h6M12 15v6',
  'M6 10l6-4 6 4-6 4-6-4z M12 10v8',
  'M8 8h8v8H8z M10 10v4M14 10v4',
  'M7 12h10M12 7v10',
  'M6 6h12v12H6z',
  'M9 8l6 8M15 8l-6 8',
  'M5 12a7 7 0 0 1 14 0',
  'M8 6c4-2 8 0 8 4v8H8v-8c0-4 4-6 0-4z',
  'M10 5h4l1 14h-6l1-14z M8 9h8',
  'M6 14h12M9 10h6M12 6v4',
  'M12 4l3 7h7l-5.5 4 2 7L12 17l-6.5 5 2-7L2 11h7z',
];

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scatterPositions(tile, count, minDist, margin, rng) {
  const positions = [];
  let attempts = 0;
  const maxAttempts = count * 120;

  while (positions.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = margin + rng() * (tile - margin * 2);
    const y = margin + rng() * (tile - margin * 2);
    const minDistSq = minDist * minDist;
    const tooClose = positions.some((p) => {
      const dx = p.x - x;
      const dy = p.y - y;
      return dx * dx + dy * dy < minDistSq;
    });
    if (!tooClose) positions.push({ x: +x.toFixed(1), y: +y.toFixed(1) });
  }

  return positions;
}

function pickIcon(index, roll) {
  if (index < syrekIcons.length) return syrekIcons[index];
  if (roll < 0.32) return syrekIcons[(index * 5 + Math.floor(roll * 100)) % syrekIcons.length];
  return icons[(index * 7 + 3) % icons.length];
}

const rng = createRng(0x7e4a11);
const positions = scatterPositions(TILE, ICON_COUNT, MIN_DIST, MARGIN, rng);
const parts = [];
let customCount = 0;

positions.forEach((pos, index) => {
  const rot = (rng() * 360).toFixed(1);
  const scale = (ICON / 24).toFixed(3);
  const roll = rng();
  const d = pickIcon(index, roll);
  if (syrekIcons.includes(d)) customCount += 1;
  parts.push(
    `<g transform="translate(${pos.x} ${pos.y}) rotate(${rot}) scale(${scale}) translate(-12 -12)"><path d="${d}"/></g>`
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">
  <g fill="none" stroke="#a0a8b3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="${ICON_OPACITY}">
    ${parts.join('\n    ')}
  </g>
</svg>`;

const svgPath = path.join(root, 'src/static/chat-outline-pattern.svg');
fs.writeFileSync(svgPath, svg);

const uri = encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
const scss = `$chat-wallpaper-color: ${BG_COLOR};
$chat-wallpaper-pattern: url('data:image/svg+xml,${uri}');

@mixin chat-messenger-wallpaper-bg {
  background-color: $chat-wallpaper-color;
  background-image: $chat-wallpaper-pattern;
  background-size: ${TILE}px ${TILE}px;
  background-repeat: repeat;
}
`;
fs.writeFileSync(path.join(root, 'src/static/partials/_chat-wallpaper.scss'), scss);
console.log(`Generated ${parts.length} icons (${customCount} Syrek custom) on ${TILE}x${TILE} tile`);
