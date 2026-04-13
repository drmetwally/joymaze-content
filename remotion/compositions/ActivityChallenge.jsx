import {
  AbsoluteFill,
  Sequence,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from 'remotion';
import { JoyoWatermark }  from '../components/JoyoWatermark.jsx';
import { BrandWatermark } from '../components/BrandWatermark.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
export const activityChallengeSchema = {
  imagePath:       '',            // Path to puzzle image (maze, word search, coloring page, etc.)
  hookText:        'Can your kid solve this? 🧩',
  ctaText:         'Drop your time below 👇',
  activityLabel:   'MAZE',        // Short label shown on the puzzle screen (e.g. MAZE, PUZZLE, WORD SEARCH)
  hookDurationSec: 2.5,           // Duration of the hook screen before puzzle appears
  countdownSec:    60,            // Timer counts up from 0 to this value
  holdAfterSec:    2.5,           // Hold on CTA screen before video ends
  backgroundColor: '#FFF4DC',     // Warm parchment
  accentColor:     '#FF6B35',     // JoyMaze orange
  showJoyo:        true,
};

// ─── ActivityChallenge ────────────────────────────────────────────────────────
// Timeline:
//   0 ──── hookDuration ──── hookDuration+countdownDuration ──── +hold ──┤
//   [Hook screen]            [Puzzle + timer counting up]          [CTA]
//
// Total duration = (hookDuration + countdownSec + holdAfterSec) × 30fps
// render-video.mjs computes this via computeDuration.

export const ActivityChallenge = ({
  imagePath       = '',
  hookText        = activityChallengeSchema.hookText,
  ctaText         = activityChallengeSchema.ctaText,
  activityLabel   = activityChallengeSchema.activityLabel,
  hookDurationSec = activityChallengeSchema.hookDurationSec,
  countdownSec    = activityChallengeSchema.countdownSec,
  holdAfterSec    = activityChallengeSchema.holdAfterSec,
  backgroundColor = activityChallengeSchema.backgroundColor,
  accentColor     = activityChallengeSchema.accentColor,
  showJoyo        = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const hookFrames      = Math.round(hookDurationSec * fps);
  const challengeFrames = Math.round(countdownSec * fps);
  const holdFrames      = Math.round(holdAfterSec * fps);
  const challengeStart  = hookFrames;
  const holdStart       = hookFrames + challengeFrames;

  // Global fade-out over last 0.4s
  const globalFade = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.4), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor, opacity: globalFade }}>

      {/* ── Phase 1: Hook screen ──────────────────────────────────────── */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <HookScreen
          text={hookText}
          accentColor={accentColor}
          backgroundColor={backgroundColor}
          fps={fps}
          frame={frame}
        />
      </Sequence>

      {/* ── Phase 2: Puzzle + timer ───────────────────────────────────── */}
      <Sequence from={challengeStart} durationInFrames={challengeFrames}>
        <PuzzleScreen
          imagePath={imagePath}
          activityLabel={activityLabel}
          countdownSec={countdownSec}
          accentColor={accentColor}
          fps={fps}
        />
      </Sequence>

      {/* ── Phase 3: CTA hold ────────────────────────────────────────── */}
      <Sequence from={holdStart} durationInFrames={holdFrames}>
        <CtaScreen
          text={ctaText}
          accentColor={accentColor}
          fps={fps}
          frame={frame - holdStart}
        />
      </Sequence>

      {/* ── Persistent: Joyo + brand ─────────────────────────────────── */}
      {showJoyo && <JoyoWatermark visible />}
      <BrandWatermark text="joymaze.com" position="bottom-center" />

    </AbsoluteFill>
  );
};

// ─── HookScreen ───────────────────────────────────────────────────────────────
// Phase 1: Large text springs in on gradient background.

const HookScreen = ({ text, accentColor, backgroundColor, fps, frame }) => {
  const s = spring({ frame, fps, config: { stiffness: 200, damping: 18, mass: 1 } });
  const scale = interpolate(s, [0, 1], [0.75, 1]);
  const opacity = interpolate(s, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems:     'center',
        flexDirection:  'column',
        gap:            32,
        padding:        '0 56px',
        backgroundColor,
      }}
    >
      {/* Accent top bar */}
      <div
        style={{
          position:        'absolute',
          top:             0,
          left:            0,
          right:           0,
          height:          8,
          backgroundColor: accentColor,
        }}
      />

      <div style={{ transform: `scale(${scale})`, opacity, textAlign: 'center' }}>
        <p
          style={{
            fontSize:      72,
            fontWeight:    900,
            fontFamily:    'Arial Black, Arial, sans-serif',
            color:         '#2D2D2D',
            margin:        0,
            lineHeight:    1.2,
            letterSpacing: '-1px',
          }}
        >
          {text}
        </p>
        {/* Accent underline */}
        <div
          style={{
            width:           100,
            height:          6,
            backgroundColor: accentColor,
            borderRadius:    3,
            margin:          '18px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ─── PuzzleScreen ─────────────────────────────────────────────────────────────
// Phase 2: Puzzle image + counting timer + activity label badge.

const PuzzleScreen = ({ imagePath, activityLabel, countdownSec, accentColor, fps }) => {
  const frame = useCurrentFrame();

  // Elapsed seconds (integer display, counts up)
  const elapsedSec = Math.floor(frame / fps);
  const displaySec = Math.min(elapsedSec, countdownSec);
  const mm = String(Math.floor(displaySec / 60)).padStart(2, '0');
  const ss = String(displaySec % 60).padStart(2, '0');

  // Image slides in from bottom on entry
  const entrySpring = spring({ frame, fps, config: { stiffness: 160, damping: 22 } });
  const imageY = interpolate(entrySpring, [0, 1], [120, 0]);
  const imageOp = interpolate(entrySpring, [0, 1], [0, 1]);

  // Timer pulses once per second
  const secFraction = (frame % fps) / fps;
  const timerScale = interpolate(secFraction, [0, 0.08, 0.18, 1], [1.12, 1.06, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const src = imagePath?.startsWith('http') ? imagePath : staticFile(imagePath ?? '');

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>

      {/* Activity label badge */}
      <div
        style={{
          position:        'absolute',
          top:             48,
          left:            0,
          right:           0,
          display:         'flex',
          justifyContent:  'center',
        }}
      >
        <div
          style={{
            backgroundColor: accentColor,
            borderRadius:    999,
            padding:         '10px 32px',
          }}
        >
          <p
            style={{
              color:       '#ffffff',
              fontSize:    32,
              fontWeight:  900,
              fontFamily:  'Arial Black, Arial, sans-serif',
              margin:      0,
              letterSpacing: '2px',
            }}
          >
            {activityLabel}
          </p>
        </div>
      </div>

      {/* Puzzle image */}
      {imagePath ? (
        <div
          style={{
            transform: `translateY(${imageY}px)`,
            opacity:   imageOp,
            width:     '88%',
            aspectRatio: '1 / 1',
            borderRadius: 28,
            overflow:    'hidden',
            boxShadow:   '0 16px 64px rgba(0,0,0,0.18)',
          }}
        >
          <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        // Placeholder when no image is provided (dev/preview)
        <div
          style={{
            width:           '88%',
            aspectRatio:     '1 / 1',
            borderRadius:    28,
            backgroundColor: '#e8e8e8',
            display:         'flex',
            justifyContent:  'center',
            alignItems:      'center',
          }}
        >
          <p style={{ color: '#999', fontSize: 40, fontFamily: 'Arial' }}>puzzle image</p>
        </div>
      )}

      {/* Timer */}
      <div
        style={{
          position:  'absolute',
          bottom:    160,
          left:      0,
          right:     0,
          display:   'flex',
          justifyContent: 'center',
          alignItems:     'center',
          gap:       12,
        }}
      >
        {/* Clock icon (simple SVG circle) */}
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="20" stroke={accentColor} strokeWidth="3" />
          <line x1="22" y1="10" x2="22" y2="22" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="22" x2="30" y2="27" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p
          style={{
            fontSize:    68,
            fontWeight:  900,
            fontFamily:  'Arial Black, Arial, sans-serif',
            color:       '#2D2D2D',
            margin:      0,
            transform:   `scale(${timerScale})`,
            transformOrigin: 'center',
            letterSpacing: '2px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {mm}:{ss}
        </p>
      </div>

    </AbsoluteFill>
  );
};

// ─── CtaScreen ────────────────────────────────────────────────────────────────
// Phase 3: CTA text springs in. Clean, no countdown.

const CtaScreen = ({ text, accentColor, fps, frame }) => {
  const s = spring({ frame, fps, config: { stiffness: 220, damping: 20, mass: 0.9 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  const op = interpolate(s, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems:     'center',
        padding:        '0 56px',
      }}
    >
      <div style={{ transform: `translateY(${y}px)`, opacity: op, textAlign: 'center' }}>
        <p
          style={{
            fontSize:    62,
            fontWeight:  800,
            fontFamily:  'Arial Black, Arial, sans-serif',
            color:       '#2D2D2D',
            margin:      0,
            lineHeight:  1.25,
          }}
        >
          {text}
        </p>
        <div
          style={{
            width:           80,
            height:          6,
            backgroundColor: accentColor,
            borderRadius:    3,
            margin:          '20px auto 0',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
