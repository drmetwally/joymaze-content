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
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

// Typewriter caption: words reveal one at a time, accumulate cumulatively
const PillCaption = ({ text }) => {
  const frame = useCurrentFrame();
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const FRAMES_PER_WORD = 5;
  const visibleCount = Math.min(words.length, Math.floor(frame / FRAMES_PER_WORD) + 1);
  const visibleWords = words.slice(0, visibleCount);

  if (!visibleWords.length) return null;

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

// Ken Burns direction pool — cycles by sceneIndex so consecutive scenes feel different
const KB_MOVES = [
  { startX: 0,   endX: -50, startY: 0,   endY: -20, startS: 1.0,  endS: 1.16 },
  { startX: 0,   endX: 50,  startY: 0,   endY: 20,  startS: 1.0,  endS: 1.16 },
  { startX: -30, endX: 30,  startY: 0,   endY: 0,   startS: 1.08, endS: 1.0  },
  { startX: 30,  endX: -30, startY: 0,   endY: 0,   startS: 1.08, endS: 1.0  },
  { startX: 0,   endX: 0,   startY: 20,  endY: -20, startS: 1.0,  endS: 1.18 },
  { startX: 0,   endX: 0,   startY: -20, endY: 20,  startS: 1.18, endS: 1.0  },
];

export const StoryActScene = ({
  scene = {},
  narrationPath = '',
  backgroundMusicPath = '',
  sfxPath = '',
  sfxVolume = 0.25,
  psychologyTrigger = '',
  isClimaxScene = false,
  // allEpisodeImages kept in signature for backward compat — no longer used for cycling
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const isHorizontal = width > height;

  const clipSrc = resolveAssetSrc(scene.animatedClip || '');
  const imageSrc = resolveAssetSrc(scene.imagePath || '');

  // Ken Burns over FULL scene duration — no cycling, one continuous motion per scene
  const kbIndex = (scene.sceneIndex ?? 1) % KB_MOVES.length;
  const kb = KB_MOVES[kbIndex];
  const kbProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kbScale = kb.startS + (kb.endS - kb.startS) * kbProgress;
  const kbX = kb.startX + (kb.endX - kb.startX) * kbProgress;
  const kbY = kb.startY + (kb.endY - kb.startY) * kbProgress;

  // Entrance scale — subtle push-in on scene open (no opacity fade — hard cut transitions)
  const entranceScale = interpolate(frame, [0, 12], [0.97, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const totalScale = entranceScale * kbScale;

  // 4.2 — Music ducking during narration
  const musicVolume = narrationPath
    ? interpolate(
        frame,
        [0, 8, durationInFrames - 60, durationInFrames - 30],
        [0.22, 0.06, 0.06, 0.22],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 0.22;

  // 5.1 — COMPLETION_SATISFACTION: subtle brightness on last 20 frames
  const brightnessPulse = psychologyTrigger === 'COMPLETION_SATISFACTION'
    ? interpolate(
        frame,
        [durationInFrames - 20, durationInFrames - 10, durationInFrames],
        [1, 1.03, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 1;

  // 5.3 — Heartbeat on Act 3 climax (reduced amplitude)
  const climaxPulse =
    isClimaxScene && psychologyTrigger === 'COMPLETION_SATISFACTION'
      ? 1 + 0.02 * Math.sin((frame / 30) * 2 * Math.PI * 1.1)
      : 1;

  return (
    // No opacity envelope — hard cut transitions (no fade-to-black between scenes)
    <AbsoluteFill>
      {clipSrc ? (
        <Video src={clipSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : imageSrc ? (
        <>
          {/* Horizontal render: blurred portrait fills bars */}
          {isHorizontal ? (
            <AbsoluteFill
              style={{
                overflow: 'hidden',
                filter: 'blur(28px) brightness(0.35)',
                transform: `translate(${kbX}px, ${kbY}px) scale(${totalScale * 1.08})`,
                transformOrigin: 'center center',
              }}
            >
              <Img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AbsoluteFill>
          ) : null}

          {/* Main image */}
          <AbsoluteFill
            style={{
              overflow: 'hidden',
              transform: `translate(${kbX}px, ${kbY}px) scale(${totalScale * climaxPulse})`,
              transformOrigin: 'center center',
              filter: `brightness(${brightnessPulse})`,
            }}
          >
            <Img
              src={imageSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: isHorizontal ? 'contain' : 'cover',
              }}
            />
          </AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }} />
      )}

      {/* 5.1 — Per-act psychology overlays */}
      {psychologyTrigger === 'NOSTALGIA' && (
        <AbsoluteFill
          style={{
            backgroundColor: 'rgba(255,200,100,1)',
            opacity: 0.08,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
      )}
      {psychologyTrigger === 'IDENTITY_MIRROR' && (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.12) 100%)',
            mixBlendMode: 'normal',
            pointerEvents: 'none',
          }}
        />
      )}
      {psychologyTrigger === 'CURIOSITY_GAP' && (
        <AbsoluteFill
          style={{
            backgroundColor: 'rgba(100,120,255,1)',
            opacity: 0.05,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      )}

      {narrationPath ? <Audio src={resolveAssetSrc(narrationPath)} /> : null}
      {backgroundMusicPath ? (
        <Audio src={resolveAssetSrc(backgroundMusicPath)} volume={musicVolume} />
      ) : null}
      {sfxPath ? (
        <Audio
          src={resolveAssetSrc(sfxPath)}
          volume={interpolate(
            frame,
            [0, 6, durationInFrames - 15, durationInFrames],
            [0, narrationPath ? sfxVolume * 0.4 : sfxVolume, narrationPath ? sfxVolume * 0.4 : sfxVolume, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )}
        />
      ) : null}

      <PillCaption text={scene.narration || ''} />
    </AbsoluteFill>
  );
};
