import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── MazeSolverReveal ─────────────────────────────────────────────────────────
// Maze-specific reveal: draws the solution path as an SVG polyline from start
// to finish, then cross-fades to the solved image at the end.
// A pencil cursor (no hand) rides the tip of the growing line.

// Deterministic jitter — same frame = same values every render
function jitter(frame, seed = 0) {
  const t = frame / 300;
  return {
    yOff:  Math.sin(t * Math.PI * 2 * 1.7 + seed) * 14
         + Math.sin(t * Math.PI * 2 * 4.3 + seed * 1.3) * 6,
    aOff:  Math.sin(t * Math.PI * 2 * 1.1 + seed * 0.7) * 3.5
         + Math.sin(t * Math.PI * 2 * 3.1 + seed * 1.6) * 1.5,
  };
}

function extendPoint(from, toward, distance) {
  if (!from || !toward) return from;
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}

// Simple pencil SVG — no hand, just the pencil stick at the line tip
function PencilTip({ tipX, tipY, frame, videoWidth, videoHeight }) {
  const { yOff, aOff } = jitter(frame, 1.47);
  const tx  = Math.min(tipX + 3, videoWidth - 10);
  const ty  = tipY + yOff;
  const deg = 42 + aOff;
  const rad = deg * Math.PI / 180;

  const ax = d => tx + d * Math.sin(rad);
  const ay = d => ty - d * Math.cos(rad);

  const GRAPHITE = 12, WOOD = 32, BODY = 168, BODY_W = 20;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={videoWidth} height={videoHeight}
           style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <filter id="msr-pencilShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="3" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.40" />
          </filter>
        </defs>
        <g filter="url(#msr-pencilShadow)">
          {/* Graphite tip */}
          <line x1={tx.toFixed(1)} y1={ty.toFixed(1)}
                x2={ax(GRAPHITE).toFixed(1)} y2={ay(GRAPHITE).toFixed(1)}
                stroke="#4A4A4A" strokeWidth="9" strokeLinecap="round" />
          {/* Wood shaving */}
          <line x1={ax(GRAPHITE).toFixed(1)} y1={ay(GRAPHITE).toFixed(1)}
                x2={ax(WOOD).toFixed(1)}      y2={ay(WOOD).toFixed(1)}
                stroke="#C8924E" strokeWidth="18" strokeLinecap="round" />
          {/* Body */}
          <line x1={ax(WOOD).toFixed(1)}   y1={ay(WOOD).toFixed(1)}
                x2={ax(BODY).toFixed(1)}   y2={ay(BODY).toFixed(1)}
                stroke="#E8B820" strokeWidth={BODY_W} strokeLinecap="round" />
          {/* Ferrule */}
          <line x1={ax(BODY).toFixed(1)}     y1={ay(BODY).toFixed(1)}
                x2={ax(BODY + 8).toFixed(1)} y2={ay(BODY + 8).toFixed(1)}
                stroke="#B8C0CC" strokeWidth={BODY_W + 2} strokeLinecap="butt" />
          {/* Eraser */}
          <line x1={ax(BODY + 8).toFixed(1)}  y1={ay(BODY + 8).toFixed(1)}
                x2={ax(BODY + 26).toFixed(1)} y2={ay(BODY + 26).toFixed(1)}
                stroke="#F08080" strokeWidth={BODY_W + 2} strokeLinecap="round" />
        </g>
      </svg>
    </AbsoluteFill>
  );
}

export const MazeSolverReveal = ({
  blankPath,
  solvedPath,
  waypoints      = [],
  pathColor      = '#22BB44',
  startFrame     = 0,
  durationFrames = 900,
}) => {
  const frame = useCurrentFrame();
  const { width: videoWidth, height: videoHeight } = useVideoConfig();

  const localFrame = Math.max(0, frame - startFrame);
  const progress   = Math.min(localFrame / durationFrames, 1);

  const drawnCount = Math.max(1, Math.floor(progress * waypoints.length));
  const rawPts = waypoints.slice(0, drawnCount);
  const first = rawPts[0];
  const second = rawPts[1] ?? rawPts[0];
  const penultimate = rawPts[rawPts.length - 2] ?? rawPts[rawPts.length - 1];
  const last = rawPts[rawPts.length - 1] ?? { x: videoWidth / 2, y: videoHeight / 2 };
  const extendedStart = rawPts.length > 1 ? extendPoint(first, second, -22) : first;
  const extendedEnd = rawPts.length > 1 ? extendPoint(last, penultimate, -26) : last;
  const drawnPts = rawPts.length > 1 ? [extendedStart, ...rawPts.slice(1, -1), extendedEnd] : rawPts;
  const pointsStr  = drawnPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const tip        = extendedEnd ?? last;

  const solvedOpacity = interpolate(
    progress, [0.92, 1.0], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const showPencil = progress > 0.01 && progress < 0.91;
  const toSrc = p => p?.startsWith('http') ? p : staticFile(p ?? '');

  return (
    <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

      {/* Blank maze */}
      <Img src={toSrc(blankPath)}
           style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

      {/* Progressive solution line */}
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: Math.max(0, 1 - solvedOpacity) }}>
        <svg width={videoWidth} height={videoHeight}
             style={{ position: 'absolute', top: 0, left: 0 }}>
          <defs>
            <filter id="msr-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.5"
                floodColor={pathColor} floodOpacity="0.34" />
            </filter>
          </defs>
          {drawnPts.length >= 2 && (
            <polyline points={pointsStr} fill="none"
              stroke={pathColor} strokeWidth="7"
              strokeLinecap="round" strokeLinejoin="round"
              filter="url(#msr-glow)" />
          )}
        </svg>
      </AbsoluteFill>

      {/* Solved image cross-fade at the end */}
      {solvedOpacity > 0 && (
        <AbsoluteFill style={{ opacity: solvedOpacity }}>
          <Img src={toSrc(solvedPath)}
               style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </AbsoluteFill>
      )}

      {/* Pencil cursor (no hand) */}
      {showPencil && (
        <PencilTip tipX={tip.x} tipY={tip.y} frame={localFrame}
                   videoWidth={videoWidth} videoHeight={videoHeight} />
      )}

    </AbsoluteFill>
  );
};
