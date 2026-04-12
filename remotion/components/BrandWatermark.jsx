import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

// ─── BrandWatermark ───────────────────────────────────────────────────────────
// Subtle brand text in the bottom-center of every video.
// Fades in after entry animation settles (~1s).
//
// Props:
//   text      — watermark text (default "joymaze.com")
//   position  — 'bottom-center' | 'bottom-right' | 'top-right'
//   color     — text color (default semi-transparent white)

export const BrandWatermark = ({
  text     = 'joymaze.com',
  position = 'bottom-center',
  color    = 'rgba(255,255,255,0.55)',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in after 0.8s, stay for the entire video
  const opacity = interpolate(
    frame,
    [0, Math.round(fps * 0.8), Math.round(fps * 1.4)],
    [0, 0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const posStyle = {
    'bottom-center': { justifyContent: 'flex-end', alignItems: 'center',    padding: '0 0 52px' },
    'bottom-right':  { justifyContent: 'flex-end', alignItems: 'flex-end',  padding: '0 28px 52px' },
    'top-right':     { justifyContent: 'flex-start', alignItems: 'flex-end', padding: '52px 28px 0' },
  }[position] ?? { justifyContent: 'flex-end', alignItems: 'center', padding: '0 0 52px' };

  return (
    <AbsoluteFill style={{ ...posStyle, pointerEvents: 'none' }}>
      <p
        style={{
          color,
          opacity,
          fontSize:      30,
          fontWeight:    700,
          fontFamily:    'Arial, sans-serif',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          margin:        0,
          textShadow:    '0 1px 4px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </p>
    </AbsoluteFill>
  );
};
