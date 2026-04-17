import {
  AbsoluteFill,
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

export const StoryBridgeCard = ({
  joyo_png_path = '',
  ctaText = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({
    frame,
    fps,
    config: { stiffness: 180, damping: 18, mass: 1 },
  });
  const bounce = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #ffe87a 0%, #ffc933 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 28,
        padding: '70px 64px',
      }}
    >
      {joyo_png_path ? (
        <Img
          src={resolveAssetSrc(joyo_png_path)}
          style={{
            width: 320,
            height: 320,
            objectFit: 'contain',
            transform: `scale(${entry * bounce})`,
          }}
        />
      ) : null}

      <p
        style={{
          margin: 0,
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 72,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1.08,
        }}
      >
        Now it&apos;s your turn!
      </p>

      {ctaText ? (
        <div
          style={{
            backgroundColor: PILL_BG,
            borderRadius: PILL_RX,
            padding: '16px 28px',
            maxWidth: '88%',
          }}
        >
          <p
            style={{
              margin: 0,
              color: PILL_TEXT,
              fontFamily: FONT_FAMILY,
              fontSize: 34,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {ctaText}
          </p>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
