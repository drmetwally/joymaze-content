import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── WordSearchReveal ─────────────────────────────────────────────────────────
// Reveals word search solution word-by-word with an outline-first rectangle draw.
// After all words are outlined, cross-fades to the solved image.
//
// Props:
//   blankPath         — path to blank word search image
//   solvedPath        — path to solved image (fully highlighted)
//   rects             — [{x1,y1,x2,y2}] coordinates in one of two spaces:
//                         • normalized 0-1 relative to sourceImageWidth/sourceImageHeight
//                         • absolute video pixel coords (when values > 1.5)
//   highlightColor    — color of the marker stroke (hex, from wordsearch.json)
//   startFrame        — frame at which reveal begins
//   durationFrames    — total frames for the full reveal sequence
//   sourceImageWidth  — original image width (default 1700 for word-search generator output)
//   sourceImageHeight — original image height (default 2200 for word-search generator output)
//
// Coordinate space assumption:
//   rects with all values ≤ 1.5 are treated as normalized 0-1 fractions relative to
//   sourceImageWidth × sourceImageHeight.  Because the image is displayed with
//   objectFit:contain inside the VW × VH video canvas, we must compute the
//   letterbox offset and rendered scale before converting to SVG pixel coords.
//   Values > 1.5 are already in video pixel space (produced by mapContainPoint in
//   generate-activity-video.mjs) and are used as-is.

// Compute the contain-fit rendered bounds of a source image within a video canvas.
// Returns { offsetX, offsetY, renderWidth, renderHeight }.
const getContainBounds = (imageWidth, imageHeight, videoWidth, videoHeight) => {
  const imageAspect = imageWidth / imageHeight;
  const videoAspect = videoWidth / videoHeight;
  if (imageAspect > videoAspect) {
    const renderWidth = videoWidth;
    const renderHeight = videoWidth / imageAspect;
    return { offsetX: 0, offsetY: (videoHeight - renderHeight) / 2, renderWidth, renderHeight };
  }
  const renderHeight = videoHeight;
  const renderWidth = videoHeight * imageAspect;
  return { offsetX: (videoWidth - renderWidth) / 2, offsetY: 0, renderWidth, renderHeight };
};

// Convert a rect to SVG pixel coords, accounting for objectFit:contain letterboxing.
const normalizeRectSpace = (rect, VW, VH, srcW, srcH) => {
  const looksNormalized = [rect.x1, rect.y1, rect.x2, rect.y2].every((value) => Math.abs(value) <= 1.5);
  if (looksNormalized) {
    // Normalized 0-1 relative to source image dims — must account for letterbox offset.
    const { offsetX, offsetY, renderWidth, renderHeight } = getContainBounds(srcW, srcH, VW, VH);
    return {
      x1: offsetX + rect.x1 * renderWidth,
      y1: offsetY + rect.y1 * renderHeight,
      x2: offsetX + rect.x2 * renderWidth,
      y2: offsetY + rect.y2 * renderHeight,
    };
  }
  // Already in video pixel coords (produced by mapContainPoint) — use as-is.
  return rect;
};

function rectPerimeterPoint(rect, progress) {
  const perimeter = (rect.w + rect.h) * 2 || 1;
  let d = Math.max(0, Math.min(perimeter, progress * perimeter));
  if (d <= rect.w) return { x: rect.x + d, y: rect.y };
  d -= rect.w;
  if (d <= rect.h) return { x: rect.x + rect.w, y: rect.y + d };
  d -= rect.h;
  if (d <= rect.w) return { x: rect.x + rect.w - d, y: rect.y + rect.h };
  d -= rect.w;
  return { x: rect.x, y: rect.y + rect.h - Math.min(d, rect.h) };
}

function MarkerTip({ tipX, tipY, videoWidth, videoHeight }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={videoWidth} height={videoHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
        <g transform={`translate(${tipX.toFixed(1)} ${tipY.toFixed(1)}) rotate(35)`}>
          <rect x="-8" y="-26" width="16" height="52" rx="7" fill="#FF9A3D" stroke="#C96B18" strokeWidth="2" />
          <polygon points="-6,26 6,26 0,40" fill="#6B4A2F" />
          <circle cx="0" cy="0" r="2.5" fill="#FFE3BF" opacity="0.9" />
        </g>
      </svg>
    </AbsoluteFill>
  );
}

export const WordSearchReveal = ({
  blankPath,
  solvedPath,
  rects             = [],
  highlightColor    = '#FFD700',
  startFrame        = 0,
  durationFrames    = 780,
  sourceImageWidth  = 1700,
  sourceImageHeight = 2200,
}) => {
  const frame = useCurrentFrame();
  const { width: VW, height: VH } = useVideoConfig();

  const localFrame = Math.max(0, frame - startFrame);
  const progress   = Math.min(localFrame / durationFrames, 1);

  const toSrc = p => p?.startsWith('http') ? p : staticFile(p ?? '');

  // ── Timing: divide reveal window into equal slots per word ───────────────
  // Each word gets a short outline-draw phase, then holds on screen.
  const EXPAND_FRAMES = 18;
  const wordCount     = rects.length;
  const framesPerWord = wordCount > 0 ? durationFrames / wordCount : durationFrames;

  // ── Cross-fade to solved image at the end ─────────────────────────────────
  const solvedOpacity = interpolate(
    progress, [0.9, 1.0], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const highlightRects = rects.map((rawRect, i) => {
    const wordStartFrame = i * framesPerWord;
    const localWordFrame = localFrame - wordStartFrame;
    if (localWordFrame < 0) return null;

    const expandProgress = Math.min(localWordFrame / EXPAND_FRAMES, 1);
    const rect = normalizeRectSpace(rawRect, VW, VH, sourceImageWidth, sourceImageHeight);
    const inset = 7;
    const x = rect.x1 + inset;
    const y = rect.y1 + inset;
    const w = Math.max(0, (rect.x2 - rect.x1) - inset * 2);
    const h = Math.max(0, (rect.y2 - rect.y1) - inset * 2);
    const opacity = interpolate(
      expandProgress, [0, 0.15, 1], [0, 0.72, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    const fillOpacity = interpolate(
      expandProgress, [0, 0.6, 1], [0, 0.06, 0.12],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return {
      x,
      y,
      w,
      h,
      opacity,
      fillOpacity,
      expandProgress,
      dashOffset: 100 - expandProgress * 100,
    };
  });

  const activeRect = [...highlightRects].reverse().find((rect) => rect && rect.expandProgress < 1) ?? null;
  const markerTip = activeRect ? rectPerimeterPoint(activeRect, activeRect.expandProgress) : null;

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
              <feDropShadow dx="0" dy="0" stdDeviation="4"
                floodColor={highlightColor} floodOpacity="0.28" />
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
                fillOpacity={r.fillOpacity}
                stroke={highlightColor}
                strokeOpacity={r.opacity}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                rx="10"
                ry="10"
                pathLength="100"
                strokeDasharray="100"
                strokeDashoffset={r.dashOffset.toFixed(1)}
                filter="url(#wsr-glow)"
              />
            );
          })}
        </svg>
      </AbsoluteFill>

      {markerTip ? <MarkerTip tipX={markerTip.x} tipY={markerTip.y} videoWidth={VW} videoHeight={VH} /> : null}

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
