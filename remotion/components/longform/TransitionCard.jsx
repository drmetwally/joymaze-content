import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { FloatingParticles } from '../FloatingParticles.jsx';

// ─── TransitionCard ───────────────────────────────────────────────────────────
// 5-second bridge between story arc and activity pack.
// "Now it's your turn!" — transitions the viewer from watching to doing.

export const TransitionCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background swipe left → right (reveal transition)
  const bgProgress = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Text elements fade + slide up
  const fade = (start, dur) =>
    interpolate(frame, [fps * start, fps * (start + dur)], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  const slideY = (start, dur) =>
    interpolate(frame, [fps * start, fps * (start + dur)], [40, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  // Bounce scale on main text at 1.2s
  const bounceProgress = interpolate(frame, [fps * 1.2, fps * 1.7], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const bounce = 1 + 0.12 * Math.sin(bounceProgress * Math.PI);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>

      {/* Animated background — solid brand orange sliding in */}
      <AbsoluteFill style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #FF6B35 100%)',
        transform: `translateX(${interpolate(bgProgress, [0, 1], [-100, 0])}%)`,
      }} />

      {/* Content */}
      <AbsoluteFill style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: '0 60px',
      }}>

        {/* "Now it's your turn!" */}
        <div style={{
          opacity: fade(0.7, 0.5),
          transform: `translateY(${slideY(0.7, 0.5)}px) scale(${bounce})`,
          fontSize: 80,
          fontFamily: 'sans-serif',
          fontWeight: 900,
          color: '#1a1a1a',
          textAlign: 'center',
          lineHeight: 1.1,
        }}>
          Now it's your turn!
        </div>

        {/* Sub-line */}
        <div style={{
          opacity: fade(1.4, 0.5),
          transform: `translateY(${slideY(1.4, 0.5)}px)`,
          fontSize: 38,
          fontFamily: 'sans-serif',
          fontWeight: 600,
          color: 'rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}>
          Ready for the challenges?
        </div>

        {/* Arrow emoji bouncing */}
        <div style={{
          opacity: fade(2.0, 0.4),
          fontSize: 64,
          transform: `translateY(${Math.sin(frame * 0.15) * 8}px)`,
        }}>
          👇
        </div>
      </AbsoluteFill>

      {/* Particles at 1.5s */}
      {frame >= fps * 1.5 && (
        <FloatingParticles count={18} emoji="⭐" startFrame={frame - fps * 1.5} />
      )}
    </AbsoluteFill>
  );
};
