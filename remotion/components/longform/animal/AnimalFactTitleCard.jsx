import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const PILL_BG    = 'rgba(255,210,0,0.93)';
const PILL_TEXT  = '#1a1a1a';
const PILL_RX    = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

export const AnimalFactTitleCard = ({ label = 'FACT 1' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const popSpring = spring({
    frame,
    fps,
    config: { stiffness: 400, damping: 14, mass: 0.6 },
  });
  const popScale = interpolate(popSpring, [0, 1], [0.0, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: PILL_BG,
          borderRadius: PILL_RX,
          padding: '20px 56px',
          transform: `scale(${popScale})`,
          transformOrigin: 'center center',
          boxShadow: '0 24px 56px rgba(0,0,0,0.40)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: PILL_TEXT,
            fontFamily: FONT_FAMILY,
            fontSize: 72,
            fontWeight: 900,
            textAlign: 'center',
            letterSpacing: 3,
          }}
        >
          {label}
        </p>
      </div>
    </AbsoluteFill>
  );
};
