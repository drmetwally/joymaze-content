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

const CAMERA_PRESETS = {
  'push-in': { scaleFrom: 1.0, scaleTo: 1.08, xFrom: 0, yFrom: 0, xTo: 0, yTo: -10 },
  'drift-right': { scaleFrom: 1.03, scaleTo: 1.09, xFrom: -20, yFrom: 0, xTo: 12, yTo: -6 },
  'wide-sweep': { scaleFrom: 0.98, scaleTo: 1.08, xFrom: 18, yFrom: 6, xTo: -18, yTo: -10 },
  'lift-up': { scaleFrom: 1.01, scaleTo: 1.1, xFrom: 0, yFrom: 16, xTo: 0, yTo: -18 },
  'loop-settle': { scaleFrom: 1.05, scaleTo: 1.0, xFrom: 10, yFrom: -8, xTo: -4, yTo: 0 },
  'loop-return': { scaleFrom: 1.08, scaleTo: 1.02, xFrom: -10, yFrom: -6, xTo: 0, yTo: 4 },
};

const NOTE_PARTICLES = [
  { symbol: '♪', left: '12%', startY: 74 },
  { symbol: '♫', left: '84%', startY: 66 },
];
const SONG_BADGE = 'FUN FACTS SONG';

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

const buildFallbackScenePlan = (imagePaths, lyricLines) => {
  const length = Math.max(imagePaths.length, lyricLines.length, 1);
  return Array.from({ length }, (_, index) => ({
    key: `fallback-${index + 1}`,
    imageIndex: Math.min(index, Math.max(imagePaths.length - 1, 0)),
    lyric: lyricLines[Math.min(index, Math.max(lyricLines.length - 1, 0))] || '',
    durationWeight: 1,
    cameraPreset: index % 2 === 0 ? 'push-in' : 'drift-right',
    captionLabel: '',
  }));
};

const allocateSceneFrames = (scenePlan, totalFrames) => {
  const totalWeight = scenePlan.reduce((sum, scene) => sum + Math.max(0.1, Number(scene.durationWeight) || 1), 0);
  let consumed = 0;
  return scenePlan.map((scene, index) => {
    const isLast = index === scenePlan.length - 1;
    const durationInFrames = isLast
      ? Math.max(1, totalFrames - consumed)
      : Math.max(1, Math.round((Math.max(0.1, Number(scene.durationWeight) || 1) / totalWeight) * totalFrames));
    const startFrame = consumed;
    consumed += durationInFrames;
    return {
      ...scene,
      startFrame,
      durationInFrames,
      endFrame: consumed,
    };
  });
};

const getCurrentScene = (scenes, frame) => scenes.find((scene) => frame >= scene.startFrame && frame < scene.endFrame) || scenes[scenes.length - 1];

export const AnimalSungRecap = ({
  imagePaths = [],
  sungAudioPath = '',
  lyrics = '',
  scenePlan = [],
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const lyricLines = lyrics ? lyrics.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const baseScenePlan = Array.isArray(scenePlan) && scenePlan.length > 0
    ? scenePlan
    : buildFallbackScenePlan(imagePaths, lyricLines);
  const scenes = allocateSceneFrames(baseScenePlan, durationInFrames);
  const currentScene = getCurrentScene(scenes, frame);
  const sceneFrame = Math.max(0, frame - currentScene.startFrame);
  const sceneProgress = currentScene.durationInFrames <= 1 ? 1 : Math.min(sceneFrame / (currentScene.durationInFrames - 1), 1);
  const camera = CAMERA_PRESETS[currentScene.cameraPreset] || CAMERA_PRESETS['push-in'];
  const bgScale = camera.scaleFrom + (camera.scaleTo - camera.scaleFrom) * sceneProgress;
  const bgX = camera.xFrom + (camera.xTo - camera.xFrom) * sceneProgress;
  const bgY = camera.yFrom + (camera.yTo - camera.yFrom) * sceneProgress;
  const bgSrc = resolveAssetSrc(imagePaths[currentScene.imageIndex] || imagePaths[0] || '');
  const currentLyric = currentScene.lyric || lyricLines[0] || '';
  const lyricPulse = 1 + (0.02 * Math.sin(sceneFrame * 0.18));
  const lyricBeat = Math.max(0, 1 - Math.abs((sceneFrame / Math.max(8, currentScene.durationInFrames * 0.18)) - 1));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {bgSrc ? (
        <AbsoluteFill
          style={{
            overflow: 'hidden',
            transform: `translate(${bgX}px, ${bgY}px) scale(${bgScale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img src={bgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.20)' }} />

      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(255,240,181,${0.05 + (lyricBeat * 0.06)}) 0%, transparent 46%)`,
        }}
      />

      {sungAudioPath ? <Audio src={resolveAssetSrc(sungAudioPath)} endAt={durationInFrames} /> : null}

      {NOTE_PARTICLES.map((note, index) => {
        const speed = 82 + index * 13;
        const offsetY = (frame * (1 + index * 0.14)) % speed;
        const opacity = interpolate(offsetY, [0, speed * 0.1, speed * 0.75, speed], [0, 0.28, 0.28, 0], {
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
              fontSize: 42 + (index % 2) * 6,
              fontWeight: 800,
            }}
          >
            {note.symbol}
          </div>
        );
      })}

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
          backgroundColor: 'rgba(255,210,0,0.93)',
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          minWidth: 134,
          fontWeight: 900,
          letterSpacing: 0.8,
          boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
        }}
      >
        {SONG_BADGE}
      </div>

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
          {currentScene.captionLabel ? (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 14px',
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.14)',
                color: '#fff7d8',
                fontFamily: FONT_FAMILY,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 0.6,
              }}
            >
              {currentScene.captionLabel}
            </div>
          ) : null}
          <div
            style={{
              transform: `scale(${lyricPulse})`,
              backgroundColor: 'rgba(0,0,0,0.64)',
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
