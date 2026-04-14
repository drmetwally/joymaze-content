import { AbsoluteFill, Img, useCurrentFrame, interpolate, staticFile } from 'remotion';

// ─── DotToDoReveal ────────────────────────────────────────────────────────────
// Animates a dot-to-dot activity by progressively drawing connecting lines
// between ordered dot positions, then cross-fading to the solved image.
//
// Animation:
//   0 → FADE_AT  : SVG polyline stroke-dashoffset draws from first dot to last
//   FADE_AT → 1.0: solved image fades in over the completed line drawing
//
// Props:
//   blankPath      — path/URL to blank dot-to-dot image
//   solvedPath     — path/URL to connected/solved image
//   dots           — [{x, y}] in video pixel space, ordered for drawing
//   dotColor       — line + marker color (default brand orange)
//   startFrame     — global frame at which animation begins
//   durationFrames — total frames for the full animation

const FADE_AT        = 0.90; // progress threshold to start solved cross-fade
const STROKE_WIDTH   = 5;    // connecting line width (px)
const MARKER_RADIUS  = 6;    // dot marker circle radius (px)

const toSrc = (p) => p?.startsWith('http') ? p : staticFile(p ?? '');

export const DotToDoReveal = ({
  blankPath,
  solvedPath,
  dots           = [],
  dotColor       = '#FF6B35',
  startFrame     = 0,
  durationFrames = 900,
}) => {
  const frame = useCurrentFrame();

  if (dots.length < 2) return (
    <AbsoluteFill>
      <Img src={toSrc(blankPath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </AbsoluteFill>
  );

  const progress = Math.min(Math.max(0, frame - startFrame) / durationFrames, 1);

  // ── Compute total polyline path length ────────────────────────────────────
  // Used for the stroke-dashoffset trick: totalLength → 0 draws the full path.
  let totalLength = 0;
  for (let i = 1; i < dots.length; i++) {
    const dx = dots[i].x - dots[i - 1].x, dy = dots[i].y - dots[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  // Draw progress: 0→1 over the first FADE_AT portion of the animation
  const drawProgress = Math.min(progress / FADE_AT, 1);
  const drawnLength  = drawProgress * totalLength;

  // SVG polyline points string
  const pointsStr = dots.map(d => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ');

  // Which dots have been "reached" by the drawing line — for marker highlights
  let cumulativeLen = 0;
  const reachedCount = dots.reduce((count, d, i) => {
    if (i === 0) return 1; // first dot always visible
    const dx = d.x - dots[i - 1].x, dy = d.y - dots[i - 1].y;
    cumulativeLen += Math.sqrt(dx * dx + dy * dy);
    return cumulativeLen <= drawnLength ? count + 1 : count;
  }, 0);

  // Solved image fade-in
  const solvedOpacity = interpolate(
    progress,
    [FADE_AT, Math.min(FADE_AT + 0.08, 1.0)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

      {/* ── Blank dot-to-dot image — base layer ──────────────────────────── */}
      <Img
        src={toSrc(blankPath)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {/* ── Progressive connecting lines ──────────────────────────────────── */}
      <AbsoluteFill>
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', top: 0, left: 0 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Connecting polyline — stroke-dashoffset draws it progressively */}
          <polyline
            points={pointsStr}
            fill="none"
            stroke={dotColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={totalLength - drawnLength}
            opacity={0.9}
          />

          {/* Dot markers — appear as line reaches each dot */}
          {dots.slice(0, reachedCount).map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={MARKER_RADIUS}
              fill={dotColor}
              opacity={0.85}
            />
          ))}
        </svg>
      </AbsoluteFill>

      {/* ── Solved image cross-fade at completion ─────────────────────────── */}
      <AbsoluteFill style={{ opacity: solvedOpacity }}>
        <Img
          src={toSrc(solvedPath)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
