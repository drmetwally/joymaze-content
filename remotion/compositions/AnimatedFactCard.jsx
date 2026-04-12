import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { JoyoWatermark }  from '../components/JoyoWatermark.jsx';
import { BrandWatermark } from '../components/BrandWatermark.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
export const animatedFactCardSchema = {
  title:           'Did you know? 🧠',
  facts: [
    { emoji: '🎨', text: 'Kids who color regularly develop fine motor skills faster than those who don\'t.' },
    { emoji: '🧩', text: 'Puzzles and mazes build spatial reasoning — a key skill for math and science.' },
    { emoji: '✏️', text: 'Handwriting activities strengthen focus and memory — no screen needed!' },
  ],
  backgroundColor:  '#FFF4DC',   // warm parchment
  accentColor:      '#FF6B35',   // JoyMaze orange
  cardColor:        '#FFFFFF',
  titleColor:       '#2D2D2D',
  textColor:        '#333333',
  cardDurationSec:  3.5,         // each card shows for this long
  showJoyo:         true,
};

// ─── Single fact card — used inside a Sequence ────────────────────────────────
const FactCard = ({ emoji, text, accentColor, cardColor, textColor, cardFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slide in from right
  const entrySpring = spring({ frame, fps, config: { stiffness: 130, damping: 18, mass: 0.9 } });
  const slideX = interpolate(entrySpring, [0, 1], [120, 0]);
  const entryOp = interpolate(entrySpring, [0, 1], [0, 1]);

  // Fade out last 10 frames
  const exitOp = interpolate(
    frame,
    [cardFrames - 12, cardFrames - 2],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(entryOp, exitOp);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems:     'center',
        padding:        '0 48px',
      }}
    >
      <div
        style={{
          transform:       `translateX(${slideX}px)`,
          opacity,
          backgroundColor: cardColor,
          borderRadius:    36,
          padding:         '52px 44px',
          width:           '100%',
          boxShadow:       '0 12px 48px rgba(0,0,0,0.10)',
          borderTop:       `8px solid ${accentColor}`,
          textAlign:       'center',
        }}
      >
        {/* Emoji */}
        <p style={{ fontSize: 100, margin: '0 0 28px', lineHeight: 1 }}>{emoji}</p>

        {/* Fact text */}
        <p
          style={{
            fontSize:    38,
            fontWeight:  700,
            color:       textColor,
            fontFamily:  'Arial, sans-serif',
            margin:      0,
            lineHeight:  1.45,
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── AnimatedFactCard ─────────────────────────────────────────────────────────
// Educational "Did You Know?" carousel for Reels / Shorts.
//
// Timeline:
//   0 ────── introFrames ──── introFrames + N×cardFrames ──────┤
//   [Title springs in]        [Cards rotate sequentially]
//
// Total duration = (2s intro + cardDurationSec × facts.length) × 30fps
// render-video.mjs computes this via computeDuration.

export const AnimatedFactCard = ({
  title           = 'Did you know? 🧠',
  facts           = animatedFactCardSchema.facts,
  backgroundColor = '#FFF4DC',
  accentColor     = '#FF6B35',
  cardColor       = '#FFFFFF',
  titleColor      = '#2D2D2D',
  textColor       = '#333333',
  cardDurationSec = 3.5,
  showJoyo        = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const introSec    = 2;
  const introFrames = Math.round(introSec * fps);
  const cardFrames  = Math.round(cardDurationSec * fps);

  // Title: spring scale-in
  const titleSpring = spring({ frame, fps, config: { stiffness: 160, damping: 22, mass: 1 } });
  const titleScale  = interpolate(titleSpring, [0, 1], [0.72, 1]);
  const titleOp     = interpolate(titleSpring, [0, 1], [0, 1]);

  // Counter label: "1 / N" per card
  const activeCard = Math.min(
    Math.floor(Math.max(0, frame - introFrames) / cardFrames),
    facts.length - 1
  );

  // Global fade-out in last 0.5s
  const globalFade = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.5), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor, opacity: globalFade }}>

      {/* ── Title header — always visible ────────────────────────────── */}
      <div
        style={{
          position:   'absolute',
          top:        120,
          left:       0,
          right:      0,
          textAlign:  'center',
          transform:  `scale(${titleScale})`,
          opacity:    titleOp,
        }}
      >
        <p
          style={{
            fontSize:    52,
            fontWeight:  900,
            color:       titleColor,
            fontFamily:  'Arial Black, Arial, sans-serif',
            margin:      0,
            letterSpacing: '-0.5px',
          }}
        >
          {title}
        </p>
        {/* Accent underline */}
        <div
          style={{
            width:           80,
            height:          5,
            backgroundColor: accentColor,
            borderRadius:    3,
            margin:          '12px auto 0',
          }}
        />
      </div>

      {/* ── Card dot indicators ───────────────────────────────────────── */}
      {facts.length > 1 && (
        <div
          style={{
            position:       'absolute',
            bottom:         220,
            left:           0,
            right:          0,
            display:        'flex',
            justifyContent: 'center',
            gap:            12,
            opacity:        titleOp,
          }}
        >
          {facts.map((_, i) => (
            <div
              key={i}
              style={{
                width:           i === activeCard ? 28 : 10,
                height:          10,
                borderRadius:    5,
                backgroundColor: i === activeCard ? accentColor : 'rgba(0,0,0,0.20)',
                transition:      'width 0.3s',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Fact card sequences ───────────────────────────────────────── */}
      {facts.map((fact, i) => (
        <Sequence
          key={i}
          from={introFrames + i * cardFrames}
          durationInFrames={cardFrames}
        >
          <FactCard
            emoji={fact.emoji}
            text={fact.text}
            accentColor={accentColor}
            cardColor={cardColor}
            textColor={textColor}
            cardFrames={cardFrames}
          />
        </Sequence>
      ))}

      {/* ── Joyo — bottom-left ────────────────────────────────────────── */}
      {showJoyo && <JoyoWatermark size={88} />}

      {/* ── Brand watermark ───────────────────────────────────────────── */}
      <BrandWatermark text="joymaze.com" position="bottom-center" />

    </AbsoluteFill>
  );
};
