import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const PILL_BG = 'rgba(255,210,0,0.93)';
const PILL_TEXT = '#1a1a1a';
const PILL_RX = 28;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

export const AnimalNameReveal = ({
  animalName = '',
  imagePath = '',
  hookJinglePath = '',
  narrationPath = '',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const imageSrc = resolveAssetSrc(imagePath);

  // Image Ken Burns
  const bgScale = interpolate(frame, [0, durationInFrames], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Energetic pop-in spring — overshoots then settles
  const popSpring = spring({
    frame,
    fps,
    config: { stiffness: 400, damping: 14, mass: 0.6 },
  });
  const popScale = interpolate(popSpring, [0, 1], [0.0, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Strong reveal flash — bridges dark silhouette hook → bright full-colour reveal
  // Reads as a "camera flash" reveal moment; hides the hard cut entirely
  const flashOpacity = interpolate(frame, [0, 4, 14], [0.92, 0.92, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagOpacity = interpolate(frame, [4, 16, durationInFrames], [0, 1, 1], {
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

      {/* Dark overlay */}
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.50)' }} />

      {/* Entry flash — feels like a "pop" */}
      <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${flashOpacity})` }} />

      {/* Audio — keep the jingle under the voice and delay narration slightly past the jingle attack */}
      {hookJinglePath ? <Audio src={resolveAssetSrc(hookJinglePath)} volume={0.2} /> : null}
      {narrationPath ? (
        <Sequence from={8}>
          <Audio src={resolveAssetSrc(narrationPath)} volume={1.0} />
        </Sequence>
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 30,
          padding: '8px 16px',
          borderRadius: 999,
          backgroundColor: `rgba(255,210,0,${0.86 * tagOpacity})`,
          color: '#1a1a1a',
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 0.9,
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
          opacity: tagOpacity,
        }}
      >
        IT'S A...
      </div>

      {/* Name pill — pops in from nothing */}
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 64px',
        }}
      >
        <div
          style={{
            backgroundColor: PILL_BG,
            borderRadius: PILL_RX,
            padding: '28px 48px',
            maxWidth: '88%',
            transform: `scale(${popScale})`,
            transformOrigin: 'center center',
            border: '2px solid rgba(255,255,255,0.22)',
            boxShadow: '0 24px 56px rgba(0,0,0,0.40)',
          }}
        >
          <p
            style={{
              margin: 0,
              color: PILL_TEXT,
              fontFamily: FONT_FAMILY,
              fontSize: 88,
              fontWeight: 900,
              textAlign: 'center',
              lineHeight: 1.05,
              letterSpacing: -1,
              textTransform: 'uppercase',
            }}
          >
            {animalName}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
