import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const PILL_BG = 'rgba(255,210,0,0.93)';
const PILL_TEXT = '#1a1a1a';
const PILL_RX = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

export const AnimalHookScene = ({
  hookText = '',
  namerevealPath = '',
  hookNarrationPath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const words = hookText ? hookText.split(/\s+/).filter(Boolean) : [];
  // Reveal 1 word per 8 frames — syncs with ~150wpm TTS
  const visibleWords = words.slice(0, Math.floor(frame / 8) + 1);

  const bgSrc = resolveAssetSrc(namerevealPath);
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulsing "?" — signals mystery, breathes with the music
  const qScale = 1 + 0.06 * Math.sin(frame * 0.12);
  const qOpacity = interpolate(frame, [0, 12, durationInFrames - 8, durationInFrames], [0, 1, 1, 0.7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pillScale = interpolate(frame, [0, 10, 22], [0.94, 1.02, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000814' }}>
      {/* Deep mystery gradient background — silhouette needs contrast */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at 55% 42%, #1a2d5a 0%, #0a1228 55%, #000814 100%)',
        }}
      />

      {/* Silhouette — same image, brightness zeroed to a pure black animal shape */}
      {bgSrc ? (
        <AbsoluteFill
          style={{
            overflow: 'hidden',
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img
            src={bgSrc}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0) saturate(0)',
              opacity: 0.88,
            }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Warm amber glow behind the silhouette — depth without revealing the animal */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at 50% 46%, rgba(255,168,30,0.13) 0%, transparent 58%)',
        }}
      />

      {/* Hook narration — voice is ONLY audio here */}
      {hookNarrationPath ? <Audio src={resolveAssetSrc(hookNarrationPath)} volume={1.0} /> : null}

      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 28,
          padding: '8px 16px',
          borderRadius: 999,
          backgroundColor: 'rgba(255,210,0,0.92)',
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 0.9,
          boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
        }}
      >
        MYSTERY ANIMAL
      </div>

      {/* Pulsing "?" — top right, clearly signals "mystery animal" format */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          right: 68,
          fontSize: 108,
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          color: PILL_BG,
          transform: `scale(${qScale})`,
          transformOrigin: 'center center',
          opacity: qOpacity,
          lineHeight: 1,
          textShadow: '0 6px 32px rgba(255,180,0,0.55)',
        }}
      >
        ?
      </div>

      {/* Hook question pill — centre stage, word-by-word reveal */}
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px',
        }}
      >
        {visibleWords.length > 0 ? (
          <div
            style={{
              transform: `scale(${pillScale})`,
              backgroundColor: PILL_BG,
              borderRadius: PILL_RX,
              padding: '26px 36px',
              maxWidth: '82%',
              border: '2px solid rgba(255,255,255,0.22)',
              boxShadow: '0 20px 52px rgba(0,0,0,0.55)',
            }}
          >
            <p
              style={{
                margin: 0,
                color: PILL_TEXT,
                fontFamily: FONT_FAMILY,
                fontSize: 46,
                fontWeight: 800,
                textAlign: 'center',
                lineHeight: 1.24,
                letterSpacing: 0.2,
              }}
            >
              {visibleWords.join(' ')}
            </p>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
