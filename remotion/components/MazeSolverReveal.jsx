import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── MazeSolverReveal ─────────────────────────────────────────────────────────
// Maze-specific reveal: draws the solution path as an SVG polyline from start
// to finish, then cross-fades to the solved image at the end.
// A pencil cursor (no hand) rides the tip of the growing line.

// Deterministic jitter — same frame = same values every render
function jitter(frame, seed = 0) {
  const t = frame / 420;
  return {
    yOff:  Math.sin(t * Math.PI * 2 * 0.65 + seed) * 2.4
         + Math.sin(t * Math.PI * 2 * 1.4 + seed * 1.3) * 0.9,
    aOff:  Math.sin(t * Math.PI * 2 * 0.45 + seed * 0.7) * 0.9
         + Math.sin(t * Math.PI * 2 * 1.2 + seed * 1.6) * 0.45,
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

function interpolatePoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function buildContinuousPath(points, progress) {
  if (points.length <= 1) {
    const only = points[0] ?? { x: 0, y: 0 };
    return { drawnPts: points, tip: only };
  }

  const segments = [];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, length });
    totalLength += length;
  }

  const target = Math.max(0, Math.min(totalLength, progress * totalLength));
  const drawnPts = [points[0]];
  let traversed = 0;
  let tip = points[0];

  for (const segment of segments) {
    if (traversed + segment.length <= target) {
      drawnPts.push(segment.b);
      tip = segment.b;
      traversed += segment.length;
      continue;
    }

    const remaining = Math.max(0, target - traversed);
    const t = segment.length === 0 ? 0 : remaining / segment.length;
    tip = interpolatePoint(segment.a, segment.b, t);
    drawnPts.push(tip);
    return { drawnPts, tip };
  }

  return { drawnPts, tip };
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

  const first = waypoints[0];
  const second = waypoints[1] ?? waypoints[0];
  const penultimate = waypoints[waypoints.length - 2] ?? waypoints[waypoints.length - 1];
  const last = waypoints[waypoints.length - 1] ?? { x: videoWidth / 2, y: videoHeight / 2 };
  const extendedStart = waypoints.length > 1 ? extendPoint(first, second, -22) : first;
  const extendedEnd = waypoints.length > 1 ? extendPoint(last, penultimate, -26) : last;
  const pathPts = waypoints.length > 1 ? [extendedStart, ...waypoints.slice(1, -1), extendedEnd] : waypoints;
  const { drawnPts, tip } = buildContinuousPath(pathPts, progress);
  const pointsStr  = drawnPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

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
              <feDropShadow dx="0" dy="0" stdDeviation="2.4"
                floodColor={pathColor} floodOpacity="0.22" />
            </filter>
          </defs>
          {drawnPts.length >= 2 && (
            <polyline points={pointsStr} fill="none"
              stroke={pathColor} strokeWidth="6"
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
