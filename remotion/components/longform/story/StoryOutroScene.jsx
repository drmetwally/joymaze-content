import {
  AbsoluteFill,
  Audio,
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

export const StoryOutroScene = ({
  joyo_png_path = '',
  outroJinglePath = '',
  nextEpisodeTeaser = '',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const localFrame = frame % Math.max(1, Math.round(fps * 1.6));
  const waveSpring = spring({
    frame: localFrame,
    fps,
    config: { stiffness: 120, damping: 14, mass: 0.9 },
  });
  const rotate = interpolate(waveSpring, [0, 0.5, 1], [-10, 10, -10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeToBlack = interpolate(
    frame,
    [0, Math.max(0, durationInFrames - 30), durationInFrames],
    [1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0e1026' }}>
      {outroJinglePath ? <Audio src={resolveAssetSrc(outroJinglePath)} /> : null}

      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, #20144a 0%, #0e1026 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 28,
          padding: '70px 64px',
          opacity: fadeToBlack,
        }}
      >
        {joyo_png_path ? (
          <Img
            src={resolveAssetSrc(joyo_png_path)}
            style={{
              width: 320,
              height: 320,
              objectFit: 'contain',
              transform: `rotate(${rotate}deg)`,
            }}
          />
        ) : null}

        <div
          style={{
            backgroundColor: PILL_BG,
            borderRadius: PILL_RX,
            padding: '18px 28px',
            maxWidth: '90%',
          }}
        >
          <p
            style={{
              margin: 0,
              color: PILL_TEXT,
              fontFamily: FONT_FAMILY,
              fontSize: 48,
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            New episode every week!
          </p>
        </div>

        {nextEpisodeTeaser ? (
          <p
            style={{
              margin: 0,
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              fontSize: 30,
              fontWeight: 600,
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: '86%',
            }}
          >
            {nextEpisodeTeaser}
          </p>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
