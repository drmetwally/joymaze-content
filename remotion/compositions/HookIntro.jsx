import {
  AbsoluteFill,
  Sequence,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from 'remotion';
import { JoyoWatermark }  from '../components/JoyoWatermark.jsx';
import { BrandWatermark } from '../components/BrandWatermark.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
export const hookIntroSchema = {
  headline:        '',          // Large bold hook line (e.g. "Can your kid solve this?")
  subline:         '',          // Smaller supporting text (optional)
  backgroundPath:  '',          // Background image path (optional — falls back to gradient)
  backgroundGradient: 'linear-gradient(160deg, #FFD93D 0%, #FF6B6B 100%)',
  durationSec:     4,           // Total duration (3–5s recommended for Reels hook)
  showJoyo:        true,
};

// ─── HookIntro ────────────────────────────────────────────────────────────────
// Short punchy intro clip — designed to be prepended to story/ASMR videos
// OR used standalone as a Reels/Shorts hook.
//
// Timeline: text springs in → holds → video ends (clean cut)
// Total duration = durationSec × 30fps

export const HookIntro = ({
  headline            = '',
  subline             = '',
  backgroundPath      = '',
  backgroundGradient  = 'linear-gradient(160deg, #FFD93D 0%, #FF6B6B 100%)',
  durationSec         = 4,
  showJoyo            = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Headline: spring scale-in
  const headlineSpring = spring({ frame, fps, config: { stiffness: 200, damping: 18, mass: 1 } });
  const headlineScale  = interpolate(headlineSpring, [0, 1], [0.78, 1]);

  // Subline: delayed spring (starts at frame 8)
  const sublineSpring = spring({ frame: Math.max(0, frame - 8), fps, config: { stiffness: 180, damping: 20 } });
  const sublineY      = interpolate(sublineSpring, [0, 1], [30, 0]);
  const sublineOp     = interpolate(sublineSpring, [0, 1], [0, 1]);

  // Global fade-out in last 0.4s
  const fadeOut = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.4), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {/* Background */}
      <AbsoluteFill
        style={{ background: backgroundGradient, overflow: 'hidden' }}
      >
        {backgroundPath && (
          <Img
            src={backgroundPath.startsWith('http') ? backgroundPath : staticFile(backgroundPath)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: 0.35,
            }}
          />
        )}
      </AbsoluteFill>

      {/* Headline + subline — vertically centered */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems:     'center',
          flexDirection:  'column',
          gap:            28,
          padding:        '0 56px',
        }}
      >
        {/* Headline */}
        <div
          style={{
            transform:       `scale(${headlineScale})`,
            textAlign:       'center',
            backgroundColor: 'rgba(0,0,0,0.12)',
            borderRadius:    20,
            padding:         '24px 36px',
            maxWidth:        '92%',
          }}
        >
          <p
            style={{
              color:       '#ffffff',
              fontSize:    68,
              fontWeight:  900,
              fontFamily:  'Arial Black, Arial, sans-serif',
              margin:      0,
              lineHeight:  1.15,
              textShadow:  '0 3px 12px rgba(0,0,0,0.35)',
              letterSpacing: '-1px',
            }}
          >
            {headline}
          </p>
        </div>

        {/* Subline */}
        {subline && (
          <div
            style={{
              transform: `translateY(${sublineY}px)`,
              opacity:   sublineOp,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                color:      'rgba(255,255,255,0.92)',
                fontSize:   38,
                fontWeight: 600,
                fontFamily: 'Arial, sans-serif',
                margin:     0,
                lineHeight: 1.4,
                textShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              {subline}
            </p>
          </div>
        )}
      </AbsoluteFill>

      {/* Joyo — bottom-left, smaller for hook clips */}
      {showJoyo && <JoyoWatermark size={80} />}

      {/* Brand */}
      <BrandWatermark text="joymaze.com" position="bottom-center" />
    </AbsoluteFill>
  );
};
