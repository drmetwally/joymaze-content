import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
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

export const AnimalOutroScene = ({
  imagePath = '',
  outroCta = '',
  outroCtaNarrationPath = '',
  outroJinglePath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const imageSrc = resolveAssetSrc(imagePath);

  const bgScale = interpolate(frame, [0, durationInFrames], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardScale = interpolate(frame, [0, 10, 22], [0.96, 1.02, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {imageSrc ? (
        <AbsoluteFill style={{ overflow: 'hidden', transform: `scale(${bgScale})`, transformOrigin: 'center center' }}>
          <Img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 50% 42%, rgba(255,240,181,0.12) 0%, transparent 44%)',
        }}
      />

      {outroJinglePath ? <Audio src={resolveAssetSrc(outroJinglePath)} volume={0.18} /> : null}
      {outroCtaNarrationPath ? (
        <Sequence from={10}>
          <Audio src={resolveAssetSrc(outroCtaNarrationPath)} volume={1.0} />
        </Sequence>
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 30,
          padding: '8px 16px',
          borderRadius: 999,
          backgroundColor: 'rgba(255,210,0,0.92)',
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 0.9,
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
        }}
      >
        YOUR TURN
      </div>

      <AbsoluteFill
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 72px',
          gap: 20,
        }}
      >
        {outroCta ? (
          <div
            style={{
              transform: `scale(${cardScale})`,
              backgroundColor: PILL_BG,
              borderRadius: PILL_RX,
              padding: '24px 36px',
              maxWidth: '88%',
              border: '2px solid rgba(255,255,255,0.22)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.30)',
            }}
          >
            <p
              style={{
                margin: 0,
                color: PILL_TEXT,
                fontFamily: FONT_FAMILY,
                fontSize: 42,
                fontWeight: 800,
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {outroCta}
            </p>
          </div>
        ) : null}

        <p
          style={{
            margin: 0,
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            fontSize: 30,
            fontWeight: 700,
            textAlign: 'center',
            opacity: 0.85,
          }}
        >
          👇 Drop your answer in the comments
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
