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
const CREAM = '#fff6db';

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

const CAMERA_POINTS = [
  { at: 0,    scale: 1.00, x: 0,   y: 0 },
  { at: 0.25, scale: 1.05, x: -12, y: -4 },
  { at: 0.5,  scale: 1.10, x: 10,  y: 2 },
  { at: 0.75, scale: 1.14, x: -8,  y: -10 },
  { at: 1,    scale: 1.16, x: 0,   y: 0 },
];

const DOODLE_PRESETS = [
  { icon: '?', top: 72, left: 72, size: 88, rotate: -8, color: 'rgba(255,210,0,0.92)' },
  { icon: '✦', top: 90, right: 92, size: 70, rotate: 10, color: 'rgba(255,245,196,0.95)' },
  { icon: '↗', top: 190, right: 120, size: 72, rotate: 8, color: 'rgba(255,210,0,0.88)' },
  { icon: '◎', top: 120, left: 110, size: 82, rotate: -4, color: 'rgba(255,245,196,0.92)' },
];

export const AnimalFactScene = ({
  imagePath = '',
  narrationPath = '',
  narration = '',
  backgroundMusicPath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const imageSrc = resolveAssetSrc(imagePath);
  const lines = narration ? narration.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  const segments = lines.length > 0 ? lines : [''];
  const lineFrames = Math.max(1, durationInFrames / segments.length);
  const lineIndex = Math.min(Math.floor(frame / lineFrames), segments.length - 1);

  const cameraFrames = CAMERA_POINTS.map((point) => Math.round(point.at * durationInFrames));
  const scale = interpolate(frame, cameraFrames, CAMERA_POINTS.map((point) => point.scale), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const x = interpolate(frame, cameraFrames, CAMERA_POINTS.map((point) => point.x), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, cameraFrames, CAMERA_POINTS.map((point) => point.y), {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const captionText = segments[lineIndex] || '';
  const captionPulse = 1 + (0.018 * Math.sin((frame - (lineIndex * lineFrames)) * 0.18));
  const beatFlash = Math.max(0, 1 - Math.abs(((frame - (lineIndex * lineFrames)) / 8) - 1));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {imageSrc ? (
        <AbsoluteFill
          style={{
            overflow: 'hidden',
            transform: `translate(${x}px, ${y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <Img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }} />
      )}

      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.18)' }} />

      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 44%, rgba(255,230,160,${0.08 + (beatFlash * 0.08)}) 0%, transparent 48%)`,
        }}
      />

      {DOODLE_PRESETS.map((preset, index) => {
        const active = index === (lineIndex % DOODLE_PRESETS.length);
        const pulse = 1 + (active ? 0.08 * Math.sin(frame * 0.22) : 0.03 * Math.sin((frame * 0.16) + index));
        const opacity = active ? 0.92 : 0.24;
        const translateY = active ? (-6 * Math.sin(frame * 0.18)) : 0;
        return (
          <div
            key={`${preset.icon}-${index}`}
            style={{
              position: 'absolute',
              top: preset.top,
              left: preset.left,
              right: preset.right,
              color: preset.color,
              fontFamily: FONT_FAMILY,
              fontSize: preset.size,
              fontWeight: 900,
              transform: `translateY(${translateY}px) rotate(${preset.rotate}deg) scale(${pulse})`,
              transformOrigin: 'center center',
              opacity,
              textShadow: '0 8px 26px rgba(0,0,0,0.28)',
            }}
          >
            {preset.icon}
          </div>
        );
      })}

      {narrationPath ? <Audio src={resolveAssetSrc(narrationPath)} /> : null}
      {backgroundMusicPath ? <Audio src={resolveAssetSrc(backgroundMusicPath)} volume={0.25} /> : null}

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '0 34px 34px',
          pointerEvents: 'none',
        }}
      >
        {captionText ? (
          <div
            style={{
              transform: `scale(${captionPulse})`,
              backgroundColor: 'rgba(0,0,0,0.76)',
              borderRadius: 18,
              padding: '16px 28px',
              maxWidth: '78%',
              boxShadow: '0 14px 36px rgba(0,0,0,0.36)',
              border: `2px solid ${lineIndex % 2 === 0 ? 'rgba(255,210,0,0.58)' : 'rgba(255,255,255,0.18)'}`,
            }}
          >
            <p
              style={{
                margin: 0,
                color: CREAM,
                fontFamily: FONT_FAMILY,
                fontSize: 34,
                fontWeight: 800,
                textAlign: 'center',
                lineHeight: 1.32,
                letterSpacing: 0.2,
              }}
            >
              {captionText}
            </p>
          </div>
        ) : null}
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
