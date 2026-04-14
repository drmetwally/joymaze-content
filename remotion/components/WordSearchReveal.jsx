import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── WordSearchReveal ─────────────────────────────────────────────────────────
// Reveals word search solution word-by-word: a colored highlight rect expands
// over each hidden word in sequence, like a marker being drawn across it.
// After all words are highlighted, cross-fades to the solved image.
//
// Props:
//   blankPath      — path to blank word search image
//   solvedPath     — path to solved image (fully highlighted)
//   rects          — [{x1,y1,x2,y2}] in normalized 0-1 range (from wordsearch.json)
//   highlightColor — color of the marker stroke (hex, from wordsearch.json)
//   startFrame     — frame at which reveal begins
//   durationFrames — total frames for the full reveal sequence

export const WordSearchReveal = ({
  blankPath,
  solvedPath,
  rects          = [],
  highlightColor = '#FFD700',
  startFrame     = 0,
  durationFrames = 780,
}) => {
  const frame = useCurrentFrame();
  const { width: VW, height: VH } = useVideoConfig();

  const localFrame = Math.max(0, frame - startFrame);
  const progress   = Math.min(localFrame / durationFrames, 1);

  const toSrc = p => p?.startsWith('http') ? p : staticFile(p ?? '');

  // ── Timing: divide reveal window into equal slots per word ───────────────
  // Each word gets: (expand phase 0→1) then (hold until next word starts).
  // EXPAND_FRAMES: how many frames the rect width grows from 0 to full.
  const EXPAND_FRAMES = 14; // ~0.47s @ 30fps — fast satisfying swipe
  const wordCount     = rects.length;
  const framesPerWord = wordCount > 0 ? durationFrames / wordCount : durationFrames;

  // ── Cross-fade to solved image at the end ─────────────────────────────────
  const solvedOpacity = interpolate(
    progress, [0.92, 1.0], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Build highlight rects ─────────────────────────────────────────────────
  // For each word: at what local frame does its expansion start?
  // We stagger them evenly so the last word completes at ~92% of durationFrames.
  const highlightRects = rects.map((rect, i) => {
    const wordStartFrame = i * framesPerWord;
    const localWordFrame = localFrame - wordStartFrame;

    // Before this word's slot: not shown. After: fully shown.
    if (localWordFrame < 0) return null;

    const expandProgress = Math.min(localWordFrame / EXPAND_FRAMES, 1);

    // Rect in video pixel space
    const x = rect.x1 * VW;
    const y = rect.y1 * VH;
    const fullW = (rect.x2 - rect.x1) * VW;
    const h     = (rect.y2 - rect.y1) * VH;

    // Horizontal wipe: width grows from 0 to fullW
    const currentW = expandProgress * fullW;

    // Opacity: fade in with the expand, hold at target opacity
    const opacity = interpolate(
      expandProgress, [0, 0.3, 1], [0, 0.62, 0.62],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return { x, y, w: currentW, h, opacity };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

      {/* Blank word search */}
      <Img
        src={toSrc(blankPath)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {/* Highlight rects layer — fades out as solved image cross-fades in */}
      <AbsoluteFill
        style={{ pointerEvents: 'none', opacity: Math.max(0, 1 - solvedOpacity) }}
      >
        <svg
          width={VW}
          height={VH}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <defs>
            <filter id="wsr-glow" x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="6"
                floodColor={highlightColor} floodOpacity="0.45" />
            </filter>
          </defs>
          {highlightRects.map((r, i) => {
            if (!r) return null;
            return (
              <rect
                key={i}
                x={r.x.toFixed(1)}
                y={r.y.toFixed(1)}
                width={r.w.toFixed(1)}
                height={r.h.toFixed(1)}
                fill={highlightColor}
                fillOpacity={r.opacity}
                rx="6"
                ry="6"
                filter="url(#wsr-glow)"
              />
            );
          })}
        </svg>
      </AbsoluteFill>

      {/* Solved image cross-fade at end */}
      {solvedOpacity > 0 && (
        <AbsoluteFill style={{ opacity: solvedOpacity }}>
          <Img
            src={toSrc(solvedPath)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
