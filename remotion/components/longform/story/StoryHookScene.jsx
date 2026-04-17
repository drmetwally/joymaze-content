import {
  AbsoluteFill,
  Audio,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const PILL_BG = 'rgba(255,210,0,0.93)';
const PILL_TEXT = '#1a1a1a';
const PILL_RX = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

const resolveAssetSrc = (src) => {
  if (!src) {
    return '';
  }

  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) {
    return src;
  }

  return staticFile(src);
};

export const StoryHookScene = ({
  hookQuestion = '',
  jinglePath = '',
  joyo_png_path = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = hookQuestion ? hookQuestion.split(/\s+/).filter(Boolean) : [];
  const visibleWords = words.slice(0, Math.min(words.length, Math.floor(frame / 4) + 1));
  const mascotSpring = spring({
    frame: Math.min(frame, 15),
    fps,
    config: { stiffness: 220, damping: 18, mass: 0.9 },
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #103a61 0%, #081421 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '80px 64px 120px',
        gap: 40,
      }}
    >
      {jinglePath ? <Audio src={resolveAssetSrc(jinglePath)} /> : null}

      {joyo_png_path ? (
        <Img
          src={resolveAssetSrc(joyo_png_path)}
          style={{
            width: 340,
            height: 340,
            objectFit: 'contain',
            transform: `scale(${mascotSpring})`,
          }}
        />
      ) : null}

      <div
        style={{
          backgroundColor: PILL_BG,
          borderRadius: PILL_RX,
          padding: '28px 38px',
          maxWidth: '92%',
          boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: PILL_TEXT,
            fontFamily: FONT_FAMILY,
            fontSize: 56,
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {visibleWords.join(' ')}
        </p>
      </div>
    </AbsoluteFill>
  );
};
