import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

// 5s per image at 30fps — cycles through all fact images during the 30s song
const IMAGE_CUT_FRAMES = 120;

const KB_PATHS = [
  { scaleFrom: 1.00, scaleTo: 1.07, xFrom:   0, xTo: -14 },
  { scaleFrom: 1.04, scaleTo: 1.09, xFrom: -10, xTo:  10 },
  { scaleFrom: 1.00, scaleTo: 1.08, xFrom:   8, xTo:  -8 },
  { scaleFrom: 1.02, scaleTo: 1.07, xFrom:   0, xTo:   0 },
];

const NOTE_PARTICLES = [
  { symbol: '♪', left: '7%',  startY: 76 },
  { symbol: '♫', left: '21%', startY: 63 },
  { symbol: '♪', left: '76%', startY: 78 },
  { symbol: '♫', left: '90%', startY: 61 },
];
const SONG_BADGES = ['SING ALONG', 'LA-LA-LA', 'FUN FACTS SONG'];

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

export const AnimalSungRecap = ({
  imagePaths = [],       // [namereveal, fact1, fact2, fact3, fact4, fact5]
  sungAudioPath = '',
  lyrics = '',           // sungRecapLyrics from episode.json
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Image cycling — one image every 5s, wraps if more frames than images
  const imageCount      = imagePaths.length || 1;
  const imageIndex      = Math.min(Math.floor(frame / IMAGE_CUT_FRAMES), imageCount - 1);
  const cutProgress     = Math.min((frame % IMAGE_CUT_FRAMES) / IMAGE_CUT_FRAMES, 1);
  const kb              = KB_PATHS[imageIndex % KB_PATHS.length];
  const bgScale         = kb.scaleFrom + (kb.scaleTo - kb.scaleFrom) * cutProgress;
  const bgX             = kb.xFrom    + (kb.xTo    - kb.xFrom)    * cutProgress;
  const bgSrc           = resolveAssetSrc(imagePaths[imageIndex] || '');

  // Lyric captions — distribute lines evenly across full duration
  const lyricLines   = lyrics ? lyrics.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const lineFrames   = lyricLines.length > 0 ? durationInFrames / lyricLines.length : durationInFrames;
  const lyricIndex   = Math.min(Math.floor(frame / lineFrames), lyricLines.length - 1);
  const currentLyric = lyricLines[lyricIndex] || '';
  const lyricPulse = 1 + (0.02 * Math.sin((frame - (lyricIndex * lineFrames)) * 0.18));
  const lyricBeat = Math.max(0, 1 - Math.abs(((frame - (lyricIndex * lineFrames)) / 8) - 1));
  const songBadge = SONG_BADGES[lyricIndex % SONG_BADGES.length];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>

      {/* Cycling illustrated images — each with its own Ken Burns path */}
      {bgSrc ? (
        <AbsoluteFill
          style={{
            overflow: 'hidden',
            transform: `translateX(${bgX}px) scale(${bgScale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img src={bgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : null}

      {/* Light overlay — keep images bright and visible for kids */}
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.28)' }} />

      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(255,240,181,${0.06 + (lyricBeat * 0.08)}) 0%, transparent 46%)`,
        }}
      />

      {sungAudioPath ? <Audio src={resolveAssetSrc(sungAudioPath)} /> : null}

      {/* Floating music note particles */}
      {NOTE_PARTICLES.map((note, index) => {
        const speed   = 82 + index * 13;
        const offsetY = (frame * (1 + index * 0.14)) % speed;
        const opacity = interpolate(offsetY, [0, speed * 0.1, speed * 0.75, speed], [0, 0.55, 0.55, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={`note-${index}`}
            style={{
              position: 'absolute',
              left: note.left,
              top: `${note.startY}%`,
              transform: `translateY(${-offsetY}px)`,
              opacity,
              color: '#fff0b5',
              fontFamily: FONT_FAMILY,
              fontSize: 50 + (index % 2) * 10,
              fontWeight: 800,
            }}
          >
            {note.symbol}
          </div>
        );
      })}

      {/* Small "♪ Fun Facts Song ♪" watermark — top left, subtle */}
      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 30,
          color: 'rgba(255,240,181,0.82)',
          fontFamily: FONT_FAMILY,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 1.5,
        }}
      >
        ♪ Fun Facts Song ♪
      </div>

      <div
        style={{
          position: 'absolute',
          top: 26,
          right: 30,
          padding: '8px 16px',
          borderRadius: 999,
          backgroundColor: 'rgba(255,210,0,0.9)',
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          minWidth: 134,
          fontWeight: 900,
          letterSpacing: 0.8,
          boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
        }}
      >
        {songBadge}
      </div>

      {/* Lyric captions — bottom centre, one line at a time */}
      {currentLyric ? (
        <AbsoluteFill
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 38,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              transform: `scale(${lyricPulse})`,
              backgroundColor: 'rgba(0,0,0,0.76)',
              borderRadius: 18,
              padding: '16px 32px',
              maxWidth: '80%',
              border: '2px solid rgba(255,210,0,0.55)',
              boxShadow: '0 14px 36px rgba(0,0,0,0.36)',
            }}
          >
            <p
              style={{
                margin: 0,
                color: '#fff6db',
                fontFamily: FONT_FAMILY,
                fontSize: 36,
                fontWeight: 700,
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {currentLyric}
            </p>
          </div>
        </AbsoluteFill>
      ) : null}

    </AbsoluteFill>
  );
};
