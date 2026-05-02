import { Img, interpolate, spring, staticFile } from 'remotion';

// ─── WordSearchJoyoOverlay ────────────────────────────────────────────────────
// Renders Joyo as an active participant in word-search challenge reels.
//
// Challenge phase: joyo_magnifying.png at lower-right of puzzle frame, idle bob + tilt
// Solve phase:     Joyo reacts (scale pop) each time a word is revealed; sparkle burst
//                  at each revealed word's center rect; cross-fades to joyo_celebrating
//                  2s before end.
//
// Props:
//   frameBounds     — { x, y, width, height } in video pixels (puzzle image bounds)
//   wordRects       — [{ x1, y1, x2, y2 }] in video pixel coords, one per word
//   challengeFrames — frame count of countdown phase
//   solveStart      — frame at which word reveal begins
//   solveFrames     — total frames in solve phase
//   frame           — current frame (passed from parent)
//   fps             — frames per second (passed from parent)

const SPARKLE_COLORS = ['#FFD700', '#FF6B35', '#4ECDC4', '#FF69B4', '#A78BFA'];
const SPARKLE_ANGLES_DEG = [0, 60, 120, 180, 240, 300];
const SPARKLE_LIFETIME = 22; // frames — after this many frames, sparkle is gone
const SPARKLE_TRAVEL = 35;   // px
const SPARKLE_FRAMES = 18;   // animation duration frames

// ── Sparkle burst at center of a revealed word rect ──────────────────────────
const SparkleBurst = ({ centerX, centerY, frameAge }) => {
  if (frameAge > SPARKLE_LIFETIME) return null;

  return (
    <>
      {SPARKLE_ANGLES_DEG.map((angleDeg, i) => {
        const angleRad = (angleDeg * Math.PI) / 180;
        const progress = Math.min(frameAge / SPARKLE_FRAMES, 1);
        const dist = interpolate(progress, [0, 1], [0, SPARKLE_TRAVEL], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const opacity = interpolate(frameAge, [0, SPARKLE_FRAMES * 0.4, SPARKLE_LIFETIME], [1, 0.9, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const tx = Math.cos(angleRad) * dist;
        const ty = Math.sin(angleRad) * dist;
        const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
        const size = 9 + (i % 3) * 2; // 9, 11, or 13 px

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: centerX + tx - size / 2,
              top: centerY + ty - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              opacity,
              pointerEvents: 'none',
              zIndex: 12,
              boxShadow: `0 0 ${size / 2}px ${color}`,
            }}
          />
        );
      })}
    </>
  );
};

// ── Main overlay component ────────────────────────────────────────────────────
export const WordSearchJoyoOverlay = ({
  frameBounds,
  wordRects = [],
  challengeFrames,
  solveStart,
  solveFrames,
  frame,
  fps,
}) => {
  // Fixed anchor: lower-right of puzzle area
  const joyoX = frameBounds.x + frameBounds.width - 80;
  const joyoY = frameBounds.y + frameBounds.height * 0.72;

  const isSolvePhase = frame >= solveStart;
  const solveFrame = frame - solveStart;
  const framesPerWord = Math.round(fps * 1.2);

  // Current word being revealed
  const wordIdx = isSolvePhase ? Math.floor(solveFrame / framesPerWord) : -1;
  // How many frames into the current word's reveal slot
  const framesIntoWord = isSolvePhase ? solveFrame % framesPerWord : 0;

  // ── Spring bounce-in for challenge phase entry ─────────────────────────────
  const entrySpring = spring({
    frame: Math.max(0, frame),
    fps,
    config: { stiffness: 260, damping: 14 },
  });
  const entryScale = Math.min(1, entrySpring);

  // ── Idle animations ────────────────────────────────────────────────────────
  const idleBob = Math.sin((frame / fps) * Math.PI * 2 / 2.0) * 6; // ±6px, ~2s
  const idleTilt = Math.sin((frame / fps) * Math.PI * 2 / 3.2) * 4; // ±4°, ~3.2s

  // ── Per-word reaction pop during solve phase ───────────────────────────────
  // Only applies for the first 8 frames after a word is revealed
  let reactionScale = 1;
  if (isSolvePhase && wordIdx >= 0 && wordIdx < wordRects.length) {
    const reactionSpring = spring({
      frame: framesIntoWord,
      fps,
      config: { stiffness: 400, damping: 8, mass: 0.5 },
    });
    reactionScale = 1 + reactionSpring * 0.18;
  }

  // ── Celebrate cross-fade ───────────────────────────────────────────────────
  const celebStartFrame = solveStart + solveFrames - Math.round(fps * 2);
  const celebFadeFrames = 14;
  const celebOpacity = interpolate(
    frame,
    [celebStartFrame, celebStartFrame + celebFadeFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const magnifyingOpacity = interpolate(
    frame,
    [celebStartFrame, celebStartFrame + celebFadeFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const celebEntrySpring = spring({
    frame: Math.max(0, frame - celebStartFrame),
    fps,
    config: { stiffness: 300, damping: 10 },
  });
  const celebScale = interpolate(celebEntrySpring, [0, 1], [0.7, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Sparkles — show only for the most recently revealed word ───────────────
  const sparkleWordIdx = isSolvePhase && wordIdx >= 0 && wordIdx < wordRects.length ? wordIdx : -1;
  const sparkleFrameAge = framesIntoWord;

  return (
    <>
      {/* Sparkle burst at center of the most recently revealed word rect */}
      {sparkleWordIdx >= 0 && wordRects[sparkleWordIdx] ? (
        <SparkleBurst
          centerX={(wordRects[sparkleWordIdx].x1 + wordRects[sparkleWordIdx].x2) / 2}
          centerY={(wordRects[sparkleWordIdx].y1 + wordRects[sparkleWordIdx].y2) / 2}
          frameAge={sparkleFrameAge}
        />
      ) : null}

      {/* joyo_magnifying — challenge phase + most of solve phase */}
      <div
        style={{
          position: 'absolute',
          left: joyoX,
          top: joyoY,
          width: 100,
          height: 100,
          transform: `translate(-50%, -50%) scale(${entryScale * reactionScale}) translateY(${idleBob}px) rotate(${idleTilt}deg)`,
          transformOrigin: 'bottom center',
          opacity: magnifyingOpacity,
          zIndex: 11,
          pointerEvents: 'none',
        }}
      >
        <Img
          src={staticFile('assets/mascot/joyo_magnifying.png')}
          style={{ width: 100, height: 100 }}
        />
      </div>

      {/* joyo_celebrating — cross-fades in 2s before end */}
      {celebOpacity > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: joyoX,
            top: joyoY,
            width: 100,
            height: 100,
            transform: `translate(-50%, -50%) scale(${celebScale})`,
            transformOrigin: 'bottom center',
            opacity: celebOpacity,
            zIndex: 11,
            pointerEvents: 'none',
          }}
        >
          <Img
            src={staticFile('assets/mascot/joyo_celebrating.png')}
            style={{ width: 100, height: 100 }}
          />
        </div>
      ) : null}
    </>
  );
};
