import {
  AbsoluteFill,
  Img,
  interpolate,
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

export const AnimalNameReveal = ({
  animalName = '',
  imagePath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const imageSrc = resolveAssetSrc(imagePath);
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const x = interpolate(frame, [0, durationInFrames], [0, -28], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const entry = spring({
    frame,
    fps,
    config: { stiffness: 180, damping: 14 },
  });
  const textScale = interpolate(entry, [0, 1], [0.4, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {imageSrc ? (
        <AbsoluteFill
          style={{
            overflow: 'hidden',
            transform: `translateX(${x}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }} />
      )}

      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 64px',
        }}
      >
        <div
          style={{
            backgroundColor: PILL_BG,
            borderRadius: PILL_RX,
            padding: '24px 34px',
            maxWidth: '90%',
            transform: `scale(${textScale})`,
            boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              fontSize: 72,
              fontWeight: 900,
              textAlign: 'center',
              lineHeight: 1.08,
            }}
          >
            {animalName}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
