import {
  AbsoluteFill,
  Sequence,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from 'remotion';
import { WipeReveal }          from '../components/WipeReveal.jsx';
import { MazeSolverReveal }   from '../components/MazeSolverReveal.jsx';
import { WordSearchReveal }   from '../components/WordSearchReveal.jsx';
import { HookText }          from '../components/HookText.jsx';
import { JoyoWatermark }     from '../components/JoyoWatermark.jsx';
import { FloatingParticles } from '../components/FloatingParticles.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
export const asmrRevealSchema = {
  blankImagePath:  '',      // path relative to project root (e.g. "output/asmr/maze-slug/blank.png")
  solvedImagePath: '',      // path relative to project root
  revealType:      'ltr',   // 'ltr' (maze) | 'ttb' (coloring)
  hookText:        '',      // shown throughout the video as persistent visual hook
  hookDurationSec: 3,       // unused for timing now; kept for API compat
  revealDurationSec: 30,    // wipe takes this long
  holdDurationSec:   1.5,   // hold on completed reveal before video ends
  audioPath:       'assets/audio/crayon.mp3',
  audioVolume:     0.85,
  showJoyo:        true,
  showParticles:   true,    // sparkles after reveal completes
  particleEmoji:   '✨',
  pathWaypoints:   null,    // [{x, y}] in video pixel space — drives MazeSolverReveal
  pathColor:       '#22BB44', // solution line color (sampled by extract-maze-path.mjs)
  wordRects:       null,    // [{x1,y1,x2,y2}] normalized 0-1 — drives WordSearchReveal
  highlightColor:  '#FFD700', // word highlight color (sampled by extract-wordsearch-path.mjs)
};

// ─── AsmrReveal ───────────────────────────────────────────────────────────────
// ASMR progressive reveal composition.
//
// Timeline:
//   0 ──────── hookDuration ──────── hookDuration+revealDuration ──── +hold ──┤
//   [Hook text over blank]  [Wipe reveal]                             [Hold + particles]
//
// Total duration = (hookDuration + revealDuration + holdDuration) × 30fps
// render-video.mjs computes this and sets composition.durationInFrames.

export const AsmrReveal = ({
  blankImagePath,
  solvedImagePath,
  revealType       = 'ltr',
  hookText         = '',
  hookDurationSec  = 3,
  revealDurationSec = 30,
  holdDurationSec  = 1.5,
  audioPath        = 'assets/audio/crayon.mp3',
  audioVolume      = 0.85,
  showJoyo         = true,
  showParticles    = true,
  particleEmoji    = '✨',
  pathWaypoints    = null,
  pathColor        = '#22BB44',
  wordRects        = null,
  highlightColor   = '#FFD700',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const hookFrames   = Math.round(hookDurationSec * fps);
  const revealFrames = Math.round(revealDurationSec * fps);
  const holdFrames   = Math.round(holdDurationSec * fps);
  const revealStart  = hookFrames;
  const holdStart    = hookFrames + revealFrames;

  // Determine reveal mode:
  //   WordSearch: wordRects array provided or revealType === 'wordsearch'
  //   MazeSolver: pathWaypoints array provided (and not coloring/ttb/wordsearch)
  //   WipeReveal: coloring TTB wipe (default)
  const useWordSearch  = (wordRects?.length > 0) || revealType === 'wordsearch';
  const useSolverReveal = !useWordSearch && pathWaypoints?.length > 0
    && revealType !== 'ttb' && revealType !== 'coloring';

  // Maze solver + word search draw from frame 0 (hook text is a persistent overlay)
  const drawStart  = (useSolverReveal || useWordSearch) ? 0 : revealStart;
  const drawFrames = (useSolverReveal || useWordSearch) ? hookFrames + revealFrames : revealFrames;

  // Progress bar: 0→1 during draw window
  const barProgress = Math.min(Math.max(0, frame - drawStart) / drawFrames, 1);

  // Bar fades in at drawStart and out at video end.
  // Guards ensure monotonic range even in preview mode (very short durationInFrames).
  const _bt1 = Math.min(drawStart + fps * 0.5, durationInFrames - 2);
  const _bt2 = Math.max(_bt1 + 1, durationInFrames - Math.round(fps * 0.4));
  const barOpacity = interpolate(
    frame,
    [drawStart, _bt1, _bt2, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

      {/* ── Reveal layer — branch by type ────────────────────────────────── */}
      {useWordSearch ? (
        <WordSearchReveal
          blankPath={blankImagePath}
          solvedPath={solvedImagePath}
          rects={wordRects ?? []}
          highlightColor={highlightColor}
          startFrame={drawStart}
          durationFrames={drawFrames}
        />
      ) : useSolverReveal ? (
        <MazeSolverReveal
          blankPath={blankImagePath}
          solvedPath={solvedImagePath}
          waypoints={pathWaypoints}
          pathColor={pathColor}
          startFrame={drawStart}
          durationFrames={drawFrames}
        />
      ) : (
        <WipeReveal
          blankPath={blankImagePath}
          solvedPath={solvedImagePath}
          revealType={revealType === 'coloring' ? 'ttb' : revealType}
          startFrame={revealStart}
          durationFrames={revealFrames}
          easing="linear"
          pathWaypoints={null}
        />
      )}

      {/* ── Hook text overlay — persistent throughout for visual hook ── */}
      {hookText && (
        <HookText text={hookText} position="top" />
      )}

      {/* ── Sparkle particles after reveal completes ─────────────────── */}
      {showParticles && (
        <Sequence from={holdStart} durationInFrames={holdFrames}>
          <FloatingParticles
            count={22}
            emoji={particleEmoji}
            startFrame={0}
          />
        </Sequence>
      )}

      {/* ── Joyo watermark ───────────────────────────────────────────── */}
      <JoyoWatermark visible={showJoyo} />

      {/* ── ASMR audio — loops to fill the full video, fade in + fade out ── */}
      {audioPath && (
        <Audio
          src={audioPath.startsWith('http') ? audioPath : staticFile(audioPath)}
          loop
          volume={(frame) =>
            interpolate(
              frame,
              [0, fps, durationInFrames - fps, durationInFrames],
              [0, audioVolume, audioVolume, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )
          }
        />
      )}

      {/* ── Progress bar — framed, centred, just below hook text ─────────── */}
      {/* Frame sits at ~264px — 5px below the hook text card bottom (~259px) */}
      <div
        style={{
          position:     'absolute',
          top:          261,
          left:         48,
          width:        'calc(100% - 96px)',
          height:       18,
          opacity:      barOpacity,
          border:       '2.5px solid rgba(0, 0, 0, 0.72)',
          borderRadius: 5,
          overflow:     'hidden',
        }}
      >
        <div
          style={{
            height:          '100%',
            width:           `${(barProgress * 100).toFixed(2)}%`,
            backgroundColor: '#FF6B35',
            boxShadow:       '0 0 8px rgba(255,107,53,0.5)',
          }}
        />
      </div>

    </AbsoluteFill>
  );
};
