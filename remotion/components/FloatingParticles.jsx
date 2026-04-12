import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// ─── FloatingParticles ────────────────────────────────────────────────────────
// Deterministic sparkle/star overlay. No random() — positions are computed from
// index using golden angle distribution so they're identical on every render.
//
// Props:
//   count        — number of particles (default 18)
//   emoji        — character to render per particle (default ✨)
//   minSize / maxSize — font-size range in px
//   startFrame   — delay before particles appear (default 0)

const GOLDEN = 137.508; // golden angle in degrees

function seededParticles(count, fps, totalFrames) {
  return Array.from({ length: count }, (_, i) => {
    // Spread across screen using golden angle for even distribution
    const xPct   = ((i * GOLDEN) % 97) + 1.5;           // 1.5–98.5%
    const yStart = ((i * 53.7) % 80) + 10;               // 10–90%
    const yEnd   = yStart - 18 - ((i * 7.3) % 14);       // float upward 18–32%

    const delayFrames   = Math.floor((i / count) * totalFrames * 0.6);  // stagger entry
    const lifespanFrames = Math.floor(fps * (2.4 + (i % 5) * 0.4));    // 2.4–4.4s each

    const size     = 16 + (i % 4) * 8;   // 16, 24, 32, 40 px
    const rotation = (i * 47) % 360;
    const opacity  = 0.55 + (i % 3) * 0.15; // 0.55, 0.70, 0.85

    return { xPct, yStart, yEnd, delayFrames, lifespanFrames, size, rotation, opacity };
  });
}

export const FloatingParticles = ({
  count     = 18,
  emoji     = '✨',
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const particles = seededParticles(count, fps, durationInFrames);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => {
        const localFrame = frame - startFrame - p.delayFrames;
        if (localFrame < 0 || localFrame > p.lifespanFrames) return null;

        const progress = localFrame / p.lifespanFrames;

        // Fade in quickly, hold, fade out
        const opacity = interpolate(
          progress,
          [0, 0.12, 0.75, 1],
          [0, p.opacity, p.opacity, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        // Float upward
        const yPct = interpolate(progress, [0, 1], [p.yStart, p.yEnd]);

        // Gentle rotation
        const rotate = p.rotation + localFrame * 0.6;

        return (
          <div
            key={i}
            style={{
              position:  'absolute',
              left:      `${p.xPct}%`,
              top:       `${yPct}%`,
              fontSize:  p.size,
              opacity,
              transform: `rotate(${rotate}deg)`,
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            {emoji}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
