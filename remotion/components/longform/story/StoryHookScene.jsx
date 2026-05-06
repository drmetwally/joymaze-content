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

export const StoryHookScene = ({
  hookQuestion = '',
  factualContext = '',
  hookNarrationPath = '',
  hookSfxPath = '',
  hookSfxVolume = 0.08,
  jinglePath = '',
  backgroundMusicPath = '',
  flashForwardSrc = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Flash forward fills the ENTIRE hook — no dark gap, no Joyo
  // Fades in over first 12 frames, holds, subtle exit last 10 frames
  const flashOpacity = flashForwardSrc
    ? interpolate(
        frame,
        [0, 12, durationInFrames - 10, durationInFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 0;

  // Ken Burns: slow pull-in over full hook duration
  const kbProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flashScale = 1.0 + 0.06 * kbProgress;

  // Hook question: typewriter word by word reveal
  const words = hookQuestion ? hookQuestion.split(/\s+/).filter(Boolean) : [];
  const FRAMES_PER_WORD = 10;
  const visibleCount = Math.min(words.length, Math.floor(frame / FRAMES_PER_WORD) + 1);
  const visibleWords = words.slice(0, visibleCount);

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #103a61 0%, #081421 100%)' }}>
      {jinglePath ? <Audio src={resolveAssetSrc(jinglePath)} volume={0.85} /> : null}
      {hookSfxPath ? <Audio src={resolveAssetSrc(hookSfxPath)} volume={hookSfxVolume} /> : null}
      {hookNarrationPath ? <Audio src={resolveAssetSrc(hookNarrationPath)} volume={1} /> : null}

      {/* Flash forward: full-screen, full duration, Ken Burns */}
      {flashForwardSrc ? (
        <AbsoluteFill
          style={{
            opacity: flashOpacity,
            transform: `scale(${flashScale})`,
            transformOrigin: 'center center',
            overflow: 'hidden',
          }}
        >
          <Img
            src={resolveAssetSrc(flashForwardSrc)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Gradient overlay — readability over flash image */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(8,20,33,0.35) 0%, rgba(8,20,33,0.7) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Hook question — centered pill, typewriter reveal */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 64px 140px',
        }}
      >
        {visibleWords.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              alignItems: 'center',
              maxWidth: '90%',
            }}
          >
            {factualContext ? (
              <div
                style={{
                  backgroundColor: 'rgba(15,10,6,0.78)',
                  borderRadius: 999,
                  padding: '10px 22px',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: '#fff5d6',
                    fontFamily: FONT_FAMILY,
                    fontSize: 24,
                    fontWeight: 700,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    letterSpacing: 0.4,
                  }}
                >
                  {factualContext}
                </p>
              </div>
            ) : null}
            <div
              style={{
                backgroundColor: PILL_BG,
                borderRadius: PILL_RX,
                padding: '28px 40px',
                maxWidth: '100%',
                boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: PILL_TEXT,
                  fontFamily: FONT_FAMILY,
                  fontSize: 52,
                  fontWeight: 800,
                  textAlign: 'center',
                  lineHeight: 1.25,
                }}
              >
                {visibleWords.join(' ')}
              </p>
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
