import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from 'remotion';

// ─── JoyoWatermark ────────────────────────────────────────────────────────────
// Joyo mascot in the bottom-left corner.
// Springs in on first appearance, then floats gently throughout.

export const JoyoWatermark = ({ size = 110, visible = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!visible) return null;

  // Bounce-in on entry (first ~0.6s)
  const entry = spring({ frame, fps, config: { stiffness: 280, damping: 14, mass: 0.85 } });
  const entryScale = interpolate(entry, [0, 1], [0, 1]);

  // Continuous gentle float (sine wave, ~1.8s period, ±7px)
  const floatY = Math.sin((frame / fps) * (Math.PI * 2 / 1.8)) * 7;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        padding: '0 0 200px 28px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `scale(${entryScale}) translateY(${floatY}px)`,
          transformOrigin: 'bottom left',
        }}
      >
        <Img
          src={staticFile('assets/mascot/joyo_waving.png')}
          style={{ width: size, height: size, objectFit: 'contain' }}
        />
      </div>
    </AbsoluteFill>
  );
};
