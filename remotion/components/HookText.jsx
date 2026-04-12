import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

// ─── HookText ─────────────────────────────────────────────────────────────────
// Animated hook text overlay — springs in, holds, fades out.
// Used at the top of StoryEpisode for the first ~3 seconds.

export const HookText = ({ text, position = 'center' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const FADE_OUT_START = durationInFrames - 8;

  // Spring scale-in
  const entry = spring({ frame, fps, config: { stiffness: 220, damping: 18, mass: 0.9 } });
  const scale = interpolate(entry, [0, 1], [0.82, 1]);

  // Opacity: fade in over 6 frames, fade out over last 8 frames
  const opacity = interpolate(
    frame,
    [0, 6, FADE_OUT_START, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const verticalAlign = {
    top:    { justifyContent: 'flex-start', paddingTop: 140 },
    center: { justifyContent: 'center' },
    bottom: { justifyContent: 'flex-end', paddingBottom: 200 },
  }[position] ?? { justifyContent: 'center' };

  return (
    <AbsoluteFill
      style={{
        ...verticalAlign,
        alignItems: 'center',
        padding: '0 52px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          backgroundColor: 'rgba(255, 210, 0, 0.93)',
          borderRadius: 22,
          padding: '28px 44px',
          maxWidth: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        }}
      >
        <p
          style={{
            color: '#111111',
            fontSize: 52,
            fontWeight: 900,
            fontFamily: 'Arial Black, Arial, sans-serif',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.22,
            letterSpacing: '-0.5px',
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};
