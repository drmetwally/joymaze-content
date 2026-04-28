import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const PILL_BG    = 'rgba(255,210,0,0.93)';
const PILL_TEXT  = '#1a1a1a';
const PILL_RX    = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

// Narrator text fades in at second 5 (frame 150 at 30fps)
const NARRATION_START_FRAME = 150;

export const StoryCtaScene = ({
  joyoImagePath = '',
  appIconPath   = '',
  narrationPath = '',
  jinglePath    = '',
  narrationText = 'Play with Joyo in the JoyMaze app!',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const joyoSrc   = resolveAssetSrc(joyoImagePath);
  const appIconSrc = resolveAssetSrc(appIconPath);

  // Joyo slides in from left
  const joyoX = interpolate(frame, [0, 18], [-200, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // App icon slides in from right
  const iconX = interpolate(frame, [0, 18], [200, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Text pill fades in at NARRATION_START_FRAME
  const textOpacity = interpolate(
    frame,
    [NARRATION_START_FRAME, NARRATION_START_FRAME + 15],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }}>
      {/* Warm gradient background */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, #2a1f0a 0%, #0d0a05 100%)',
        }}
      />

      {/* Audio — jingle plays under narration */}
      {jinglePath    ? <Audio src={resolveAssetSrc(jinglePath)}    volume={0.55} /> : null}
      {narrationPath ? <Audio src={resolveAssetSrc(narrationPath)} volume={1.0}  /> : null}

      {/* Left side — Joyo mascot */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexDirection: 'row',
          paddingBottom: 40,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            transform: `translateX(${joyoX}px)`,
            paddingBottom: 0,
          }}
        >
          {joyoSrc ? (
            <Img
              src={joyoSrc}
              style={{ width: 340, height: 340, objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: '50%',
                backgroundColor: PILL_BG,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <p style={{ margin: 0, fontSize: 48, fontWeight: 900, color: PILL_TEXT, fontFamily: FONT_FAMILY }}>
                Joyo
              </p>
            </div>
          )}
        </div>

        {/* Right side — app icon */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transform: `translateX(${iconX}px)`,
          }}
        >
          {appIconSrc ? (
            <Img
              src={appIconSrc}
              style={{
                width: 200,
                height: 200,
                objectFit: 'contain',
                borderRadius: 40,
                boxShadow: '0 24px 56px rgba(0,0,0,0.60)',
              }}
            />
          ) : null}
        </div>
      </AbsoluteFill>

      {/* Narrator text pill — appears at second 5 */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: 48,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            backgroundColor: PILL_BG,
            borderRadius: PILL_RX,
            padding: '18px 40px',
            maxWidth: '80%',
            opacity: textOpacity,
            boxShadow: '0 16px 40px rgba(0,0,0,0.30)',
          }}
        >
          <p
            style={{
              margin: 0,
              color: PILL_TEXT,
              fontFamily: FONT_FAMILY,
              fontSize: 38,
              fontWeight: 800,
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {narrationText}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
