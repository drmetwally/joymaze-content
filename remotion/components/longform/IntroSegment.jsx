import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { FloatingParticles } from '../FloatingParticles.jsx';
import { JoyoWatermark }     from '../JoyoWatermark.jsx';

// ─── IntroSegment ──────────────────────────────────────────────────────────────
// 20-second branded intro for LongFormEpisode.
// Shows episode number, title, and theme tagline with staggered fade-in.
// Used at the start of every long-form video.

export const IntroSegment = ({
  title        = 'JoyMaze Adventure',
  episodeNumber = 1,
  theme        = '',
  hookText     = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Staggered fade-ins
  const fade = (start, end) =>
    interpolate(frame, [start, end], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  const labelOpacity  = fade(0,   fps * 0.6);  // "JoyMaze Presents" — 0-0.6s
  const titleOpacity  = fade(fps * 0.8, fps * 1.8);  // title — 0.8-1.8s
  const themeOpacity  = fade(fps * 2.0, fps * 2.8);  // theme tagline — 2-2.8s
  const hookOpacity   = fade(fps * 3.5, fps * 4.5);  // hook text — 3.5-4.5s

  // Title slides up as it fades in
  const titleY = interpolate(frame, [fps * 0.8, fps * 1.8], [30, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Particle burst at 3s
  const showParticles = frame >= fps * 3;

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #FFD700 0%, #FF6B35 55%, #FF8C00 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 60px',
    }}>

      {/* Episode label */}
      <div style={{
        opacity: labelOpacity,
        fontSize: 32,
        fontFamily: 'sans-serif',
        fontWeight: 700,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: 'rgba(0,0,0,0.55)',
        marginBottom: 16,
      }}>
        Episode {episodeNumber}
      </div>

      {/* Title */}
      <div style={{
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
        fontSize: 72,
        fontFamily: 'sans-serif',
        fontWeight: 900,
        color: '#1a1a1a',
        textAlign: 'center',
        lineHeight: 1.15,
        marginBottom: 24,
      }}>
        {title}
      </div>

      {/* Theme badge */}
      {theme && (
        <div style={{
          opacity: themeOpacity,
          backgroundColor: 'rgba(0,0,0,0.18)',
          borderRadius: 40,
          padding: '10px 28px',
          fontSize: 28,
          fontFamily: 'sans-serif',
          fontWeight: 600,
          color: '#fff',
          marginBottom: 40,
        }}>
          {theme}
        </div>
      )}

      {/* Hook text pill (same style as video hook overlays) */}
      {hookText && (
        <div style={{
          opacity: hookOpacity,
          backgroundColor: 'rgba(255,210,0,0.93)',
          borderRadius: 22,
          padding: '14px 36px',
          fontSize: 34,
          fontFamily: 'sans-serif',
          fontWeight: 800,
          color: '#1a1a1a',
          textAlign: 'center',
          marginTop: 12,
        }}>
          {hookText}
        </div>
      )}

      {/* Particle burst after 3s */}
      {showParticles && <FloatingParticles count={14} emoji="⭐" startFrame={frame - fps * 3} />}

      <JoyoWatermark visible />
    </AbsoluteFill>
  );
};
