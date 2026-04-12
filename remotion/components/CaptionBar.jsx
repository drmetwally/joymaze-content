import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

// ─── CaptionBar ───────────────────────────────────────────────────────────────
// Slides up from bottom, displays narration text for the current scene.
// Stays for the full scene duration, slides back down at the end.

export const CaptionBar = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const SLIDE_OUT_START = durationInFrames - 10;

  // Slide up on entry
  const entry = spring({ frame, fps, config: { stiffness: 160, damping: 22 } });
  const entryY = interpolate(entry, [0, 1], [80, 0]);

  // Fade out before scene ends
  const opacity = interpolate(
    frame,
    [0, 5, SLIDE_OUT_START, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  if (!text) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 36px 108px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `translateY(${entryY}px)`,
          opacity,
          backgroundColor: 'rgba(10, 10, 10, 0.78)',
          borderRadius: 18,
          padding: '22px 32px',
          maxWidth: '92%',
          backdropFilter: 'blur(4px)',
        }}
      >
        <p
          style={{
            color: '#ffffff',
            fontSize: 42,
            fontWeight: 600,
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.38,
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};
