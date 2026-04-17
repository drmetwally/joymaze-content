import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
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
  if (!src) {
    return '';
  }

  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) {
    return src;
  }

  return staticFile(src);
};

const PillCaption = ({ text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const visibleWords = words.slice(0, Math.min(words.length, Math.floor(frame / 4) + 1));
  const opacity = interpolate(
    frame,
    [0, 8, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const y = interpolate(frame, [0, 12], [50, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 36px 92px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          backgroundColor: PILL_BG,
          borderRadius: PILL_RX,
          padding: '20px 28px',
          maxWidth: '92%',
          boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: PILL_TEXT,
            fontFamily: FONT_FAMILY,
            fontSize: 36,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.32,
          }}
        >
          {visibleWords.join(' ')}
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const StoryActScene = ({
  scene = {},
  narrationPath = '',
  backgroundMusicPath = '',
  actNumber = 1,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const clipSrc = resolveAssetSrc(scene.animatedClip || '');
  const imageSrc = resolveAssetSrc(scene.imagePath || '');
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const x = interpolate(frame, [0, durationInFrames], [0, -24], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {clipSrc ? (
        <Video src={clipSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : imageSrc ? (
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

      {narrationPath ? <Audio src={resolveAssetSrc(narrationPath)} /> : null}
      {backgroundMusicPath ? <Audio src={resolveAssetSrc(backgroundMusicPath)} volume={0.3} /> : null}

      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 32,
          backgroundColor: PILL_BG,
          borderRadius: PILL_RX,
          padding: '10px 18px',
          boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: PILL_TEXT,
            fontFamily: FONT_FAMILY,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          ACT {actNumber}
        </p>
      </div>

      <PillCaption text={scene.narration || ''} />
    </AbsoluteFill>
  );
};
