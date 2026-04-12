import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── WipeReveal ───────────────────────────────────────────────────────────────
// Core wipe animation used by AsmrReveal.
// Renders a blank image underneath, then clips the solved image in progressively.
//
// revealType:
//   'ltr' (left-to-right) — for mazes: pencil draws path across
//   'ttb' (top-to-bottom) — for coloring: color fills downward
//
// Props:
//   blankPath    — path/URL to blank/unsolved image
//   solvedPath   — path/URL to solved/colored image
//   revealType   — 'ltr' | 'ttb'
//   startFrame   — global frame at which wipe begins
//   durationFrames — total frames for the full wipe (e.g. 30s × 30fps = 900)
//   easing       — 'linear' | 'ease-in-out' (default linear)

export const WipeReveal = ({
  blankPath,
  solvedPath,
  revealType    = 'ltr',
  startFrame    = 0,
  durationFrames = 900,
  easing        = 'linear',
}) => {
  const frame = useCurrentFrame();

  const localFrame = Math.max(0, frame - startFrame);

  // 0 → 1 progress over the wipe duration
  const rawProgress = Math.min(localFrame / durationFrames, 1);

  // Optional ease-in-out
  const progress = easing === 'ease-in-out'
    ? rawProgress < 0.5
      ? 2 * rawProgress * rawProgress
      : 1 - Math.pow(-2 * rawProgress + 2, 2) / 2
    : rawProgress;

  // Clip-path: reveal the solved image from the appropriate direction
  const clipPath = revealType === 'ltr'
    ? `inset(0 ${((1 - progress) * 100).toFixed(2)}% 0 0)`   // left-to-right
    : `inset(0 0 ${((1 - progress) * 100).toFixed(2)}% 0)`;  // top-to-bottom

  // Wipe edge glow — a thin luminous line at the leading edge of the reveal
  const glowStyle = revealType === 'ltr'
    ? {
        position:    'absolute',
        top:         0,
        left:        `${(progress * 100).toFixed(2)}%`,
        width:       6,
        height:      '100%',
        background:  'linear-gradient(to right, rgba(255,255,200,0) 0%, rgba(255,255,200,0.55) 50%, rgba(255,255,200,0) 100%)',
        transform:   'translateX(-50%)',
        pointerEvents: 'none',
      }
    : {
        position:    'absolute',
        left:        0,
        top:         `${(progress * 100).toFixed(2)}%`,
        width:       '100%',
        height:      6,
        background:  'linear-gradient(to bottom, rgba(255,255,200,0) 0%, rgba(255,255,200,0.55) 50%, rgba(255,255,200,0) 100%)',
        transform:   'translateY(-50%)',
        pointerEvents: 'none',
      };

  const toSrc = (p) => p?.startsWith('http') ? p : staticFile(p ?? '');

  return (
    <AbsoluteFill>
      {/* Blank image — always visible underneath */}
      <Img
        src={toSrc(blankPath)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Solved image — clipped in progressively */}
      <AbsoluteFill style={{ clipPath }}>
        <Img
          src={toSrc(solvedPath)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Wipe edge glow line */}
      {progress > 0 && progress < 1 && <div style={glowStyle} />}
    </AbsoluteFill>
  );
};
