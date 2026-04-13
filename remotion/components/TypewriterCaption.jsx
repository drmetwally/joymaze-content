import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

// ─── TypewriterCaption ────────────────────────────────────────────────────────
// Drop-in replacement for CaptionBar.
// Same slide-up entry + fade-out. Words are revealed one by one as the scene
// plays — giving the impression the caption is being spoken in sync.
//
// Props:
//   text          — caption string (space-separated words)
//   wordsPerSec   — reveal speed in words/second (default 2.5)
//   startDelaySec — hold before first word appears (default 0.25s)
//
// Usage in StoryEpisode: swap <CaptionBar> for <TypewriterCaption>

export const TypewriterCaption = ({
  text,
  wordsPerSec   = 2.5,
  startDelaySec = 0.25,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  if (!text) return null;

  const words = text.split(' ');
  const framesPerWord  = fps / wordsPerSec;
  const startFrame     = Math.round(startDelaySec * fps);
  const SLIDE_OUT_START = durationInFrames - 10;

  // How many words are visible right now
  const visibleCount = Math.min(
    Math.floor(Math.max(0, frame - startFrame) / framesPerWord) + 1,
    words.length
  );

  // Container: slide up on entry
  const entry = spring({ frame, fps, config: { stiffness: 160, damping: 22 } });
  const entryY = interpolate(entry, [0, 1], [80, 0]);

  // Container: fade in + fade out
  const opacity = interpolate(
    frame,
    [0, 5, SLIDE_OUT_START, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems:     'center',
        padding:        '0 36px 108px',
        pointerEvents:  'none',
      }}
    >
      <div
        style={{
          transform:       `translateY(${entryY}px)`,
          opacity,
          backgroundColor: 'rgba(10, 10, 10, 0.78)',
          borderRadius:    18,
          padding:         '22px 32px',
          maxWidth:        '92%',
          backdropFilter:  'blur(4px)',
        }}
      >
        <p
          style={{
            color:      '#ffffff',
            fontSize:   42,
            fontWeight: 600,
            fontFamily: 'Arial, sans-serif',
            textAlign:  'center',
            margin:     0,
            lineHeight: 1.38,
          }}
        >
          {words.map((word, i) => {
            const isVisible = i < visibleCount;
            // Each word pops in: spring from frame when it becomes visible
            const wordRevealFrame = startFrame + i * framesPerWord;
            const wordLocalFrame  = Math.max(0, frame - wordRevealFrame);
            const wordSpring = spring({
              frame:  wordLocalFrame,
              fps,
              config: { stiffness: 300, damping: 24, mass: 0.7 },
            });
            const wordScale = interpolate(wordSpring, [0, 1], [0.6, 1]);
            const wordOp    = isVisible ? interpolate(wordSpring, [0, 1], [0, 1]) : 0;

            return (
              <span
                key={i}
                style={{
                  display:        'inline-block',
                  marginRight:    '0.28em',
                  transform:      `scale(${wordScale})`,
                  opacity:        wordOp,
                  transformOrigin: 'bottom center',
                  whiteSpace:     'nowrap',
                }}
              >
                {word}
              </span>
            );
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
};
