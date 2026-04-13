import {
  AbsoluteFill,
  Sequence,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from 'remotion';
import { WipeReveal }        from '../components/WipeReveal.jsx';
import { HookText }          from '../components/HookText.jsx';
import { JoyoWatermark }     from '../components/JoyoWatermark.jsx';
import { BrandWatermark }    from '../components/BrandWatermark.jsx';
import { FloatingParticles } from '../components/FloatingParticles.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
export const asmrRevealSchema = {
  blankImagePath:  '',      // path relative to project root (e.g. "output/asmr/maze-slug/blank.png")
  solvedImagePath: '',      // path relative to project root
  revealType:      'ltr',   // 'ltr' (maze) | 'ttb' (coloring)
  hookText:        '',      // shown for first hookDurationSec seconds
  hookDurationSec: 3,
  revealDurationSec: 30,    // wipe takes this long
  holdDurationSec:   1.5,   // hold on completed reveal before video ends
  audioPath:       'assets/audio/crayon.mp3',
  audioVolume:     0.85,
  showJoyo:        true,
  showParticles:   true,    // sparkles after reveal completes
  particleEmoji:   '✨',
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
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const hookFrames   = Math.round(hookDurationSec * fps);
  const revealFrames = Math.round(revealDurationSec * fps);
  const holdFrames   = Math.round(holdDurationSec * fps);
  const revealStart  = hookFrames;
  const holdStart    = hookFrames + revealFrames;

  // Progress bar: 0→1 during reveal window, then holds at 1 during hold
  const revealLocalFrame = Math.max(0, frame - revealStart);
  const barProgress = Math.min(revealLocalFrame / revealFrames, 1);

  // Bar fades in with the reveal and out with the video end
  const barOpacity = interpolate(
    frame,
    [revealStart, revealStart + fps * 0.5, durationInFrames - fps * 0.4, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

      {/* ── Wipe reveal — runs for the full video under everything ─────── */}
      <WipeReveal
        blankPath={blankImagePath}
        solvedPath={solvedImagePath}
        revealType={revealType === 'coloring' ? 'ttb' : 'ltr'}
        startFrame={revealStart}
        durationFrames={revealFrames}
        easing="linear"
      />

      {/* ── Hook text overlay (first hookDurationSec) ────────────────── */}
      {hookText && (
        <Sequence from={0} durationInFrames={hookFrames}>
          <HookText text={hookText} position="top" />
        </Sequence>
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

      {/* ── Brand watermark ──────────────────────────────────────────── */}
      <BrandWatermark text="joymaze.com" position="bottom-center" />

      {/* ── ASMR audio — fade in, hold, fade out ─────────────────────── */}
      {audioPath && (
        <Audio
          src={audioPath.startsWith('http') ? audioPath : staticFile(audioPath)}
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

      {/* ── Progress bar — fills left→right as wipe progresses ───────── */}
      <div
        style={{
          position:        'absolute',
          top:             0,
          left:            0,
          width:           '100%',
          height:          7,
          opacity:         barOpacity,
          backgroundColor: 'rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            height:          '100%',
            width:           `${(barProgress * 100).toFixed(2)}%`,
            backgroundColor: '#FF6B35',   // JoyMaze orange
            borderRadius:    '0 4px 4px 0',
            boxShadow:       '0 0 8px rgba(255,107,53,0.6)',
          }}
        />
      </div>

    </AbsoluteFill>
  );
};
