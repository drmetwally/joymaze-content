import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { FloatingParticles } from '../FloatingParticles.jsx';
import { JoyoWatermark }     from '../JoyoWatermark.jsx';

// ─── OutroSegment ─────────────────────────────────────────────────────────────
// 25-second outro for LongFormEpisode.
// Celebrates completion, shows save hook, teases next episode.

export const OutroSegment = ({
  episodeNumber  = 1,
  nextHint       = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = (s, e) =>
    interpolate(frame, [fps * s, fps * e], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  const slideUp = (s, e) =>
    interpolate(frame, [fps * s, fps * e], [50, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  // Star scale pulse
  const starScale = 1 + 0.15 * Math.sin(frame * 0.12);

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #FFD700 0%, #FF9500 50%, #FF6B35 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      padding: '0 60px',
    }}>

      {/* Star trophy */}
      <div style={{
        opacity: fade(0, 0.5),
        fontSize: 120,
        transform: `scale(${starScale})`,
      }}>
        🏆
      </div>

      {/* "Episode N Complete!" */}
      <div style={{
        opacity: fade(0.4, 0.9),
        transform: `translateY(${slideUp(0.4, 0.9)}px)`,
        fontSize: 66,
        fontFamily: 'sans-serif',
        fontWeight: 900,
        color: '#1a1a1a',
        textAlign: 'center',
        lineHeight: 1.1,
      }}>
        Episode {episodeNumber} Complete!
      </div>

      {/* Save hook */}
      <div style={{
        opacity: fade(1.2, 1.7),
        transform: `translateY(${slideUp(1.2, 1.7)}px)`,
        backgroundColor: 'rgba(0,0,0,0.18)',
        borderRadius: 22,
        padding: '14px 32px',
        fontSize: 34,
        fontFamily: 'sans-serif',
        fontWeight: 700,
        color: '#1a1a1a',
        textAlign: 'center',
      }}>
        Save this for your next activity session 💾
      </div>

      {/* Next episode teaser */}
      {nextHint && (
        <div style={{
          opacity: fade(3.0, 3.6),
          transform: `translateY(${slideUp(3.0, 3.6)}px)`,
          backgroundColor: 'rgba(255,255,255,0.35)',
          borderRadius: 16,
          padding: '12px 28px',
          fontSize: 28,
          fontFamily: 'sans-serif',
          fontWeight: 600,
          color: '#1a1a1a',
          textAlign: 'center',
        }}>
          Coming up: {nextHint} →
        </div>
      )}

      {/* JoyMaze brand text */}
      <div style={{
        opacity: fade(4.5, 5.0),
        fontSize: 26,
        fontFamily: 'sans-serif',
        fontWeight: 600,
        color: 'rgba(0,0,0,0.45)',
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        JoyMaze · Free Activities for Kids
      </div>

      <FloatingParticles count={24} emoji="⭐" startFrame={0} />
      <JoyoWatermark visible />
    </AbsoluteFill>
  );
};
