import {
  AbsoluteFill,
  Audio,
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

const NOTE_PARTICLES = [
  { symbol: '♪', left: '12%', startY: 82 },
  { symbol: '♫', left: '24%', startY: 70 },
  { symbol: '♪', left: '38%', startY: 88 },
  { symbol: '♫', left: '56%', startY: 74 },
  { symbol: '♪', left: '72%', startY: 84 },
  { symbol: '♫', left: '86%', startY: 66 },
];

const LyricsPill = ({ text, opacity, fontSize, padding, maxWidth }) => {
  if (!text) {
    return null;
  }

  return (
    <div
      style={{
        opacity,
        backgroundColor: PILL_BG,
        borderRadius: PILL_RX,
        padding,
        maxWidth,
        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
      }}
    >
      <p
        style={{
          margin: 0,
          color: PILL_TEXT,
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {text}
      </p>
    </div>
  );
};

export const AnimalSungRecap = ({
  lyrics = '',
  sungAudioPath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const lines = lyrics
    ? lyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const currentIndex = Math.min(Math.max(0, Math.floor(frame / 60)), Math.max(0, lines.length - 1));
  const currentLine = lines[currentIndex] || '';
  const previousLine = currentIndex > 0 ? lines[currentIndex - 1] : '';

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #7b3f00 0%, #3d1a00 100%)',
        overflow: 'hidden',
      }}
    >
      {sungAudioPath ? <Audio src={resolveAssetSrc(sungAudioPath)} /> : null}

      {NOTE_PARTICLES.map((note, index) => {
        const translateY = interpolate(frame, [0, durationInFrames], [0, -120], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div
            key={`${note.symbol}-${index}`}
            style={{
              position: 'absolute',
              left: note.left,
              top: `${note.startY}%`,
              transform: `translateY(${translateY}px)`,
              opacity: 0.4,
              color: '#fff0b5',
              fontFamily: FONT_FAMILY,
              fontSize: 56 + (index % 2) * 10,
              fontWeight: 800,
            }}
          >
            {note.symbol}
          </div>
        );
      })}

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '0 64px',
        }}
      >
        <LyricsPill
          text={previousLine}
          opacity={0.4}
          fontSize={34}
          padding="14px 22px"
          maxWidth="84%"
        />
        <LyricsPill
          text={currentLine}
          opacity={1}
          fontSize={56}
          padding="22px 30px"
          maxWidth="90%"
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
