import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from 'remotion';
import { WipeReveal }        from '../WipeReveal.jsx';
import { MazeSolverReveal }  from '../MazeSolverReveal.jsx';
import { WordSearchReveal }  from '../WordSearchReveal.jsx';
import { DotToDoReveal }     from '../DotToDoReveal.jsx';
import { FloatingParticles } from '../FloatingParticles.jsx';
import { HookText }          from '../HookText.jsx';

// ─── ActivitySegment ──────────────────────────────────────────────────────────
// One activity inside a LongFormEpisode.
//
// Timeline (default 70s = 2100 frames @ 30fps):
//   0       → labelSec    : Label card (activity number + title + countdown)
//   labelSec → revealEnd  : Reveal animation (same components as AsmrReveal)
//   revealEnd → end       : Celebration (stars + "Amazing!")
//
// Props:
//   activity: {
//     type,          // 'coloring'|'maze'|'wordsearch'|'dotdot'|'tracing'
//     folder,        // e.g. "output/asmr/maze-ocean/"  (blank.png + solved.png inside)
//     blankPath,     // override: absolute path (optional, derived from folder if omitted)
//     solvedPath,    // override: absolute path (optional)
//     label,         // e.g. "Help the dragon find the path"
//     hookText,      // e.g. "Watch the path appear"
//     pathWaypoints, // [{x,y}] for maze
//     pathColor,
//     wordRects,     // [{x1,y1,x2,y2}] normalized for wordsearch
//     highlightColor,
//     dotWaypoints,  // [{x,y}] for dot-to-dot
//     dotColor,
//   }
//   activityNumber:  1-based index
//   totalActivities: total count for progress indicator
//   labelSec:        seconds for label card (default 6)
//   revealSec:       seconds for the reveal (default 55)
//   celebrateSec:    seconds for celebration (default 9)

const TYPE_EMOJI = {
  coloring:   '🎨',
  maze:       '🌀',
  wordsearch: '🔍',
  dotdot:     '✏️',
  tracing:    '✏️',
  default:    '⭐',
};

export const ActivitySegment = ({
  activity       = {},
  activityNumber = 1,
  totalActivities = 4,
  labelSec       = 6,
  revealSec      = 55,
  celebrateSec   = 9,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    type         = 'coloring',
    folder       = '',
    blankPath:   bpOverride = null,
    solvedPath:  spOverride = null,
    label        = `Activity ${activityNumber}`,
    hookText     = '',
    pathWaypoints = null,
    pathColor    = '#22BB44',
    wordRects    = null,
    highlightColor = '#FFD700',
    dotWaypoints = null,
    dotColor     = '#FF6B35',
  } = activity;

  const labelFrames    = Math.round(labelSec    * fps);
  const revealFrames   = Math.round(revealSec   * fps);
  const celebrateFrames = Math.round(celebrateSec * fps);

  const revealStart   = labelFrames;
  const celebrateStart = revealStart + revealFrames;

  // Derive image paths
  const normalizedFolder = folder.replace(/\\/g, '/').replace(/\/$/, '');
  const blankPath  = bpOverride ?? (normalizedFolder ? `${normalizedFolder}/blank.png`  : '');
  const solvedPath = spOverride ?? (normalizedFolder ? `${normalizedFolder}/solved.png` : '');

  // Pick reveal component — same priority logic as AsmrReveal
  const useDotDo      = (dotWaypoints?.length > 0) || type === 'dotdot';
  const useWordSearch  = !useDotDo && ((wordRects?.length > 0) || type === 'wordsearch');
  const useMazeSolver  = !useDotDo && !useWordSearch && (pathWaypoints?.length > 0) && type === 'maze';

  const revealType    = (type === 'coloring' || type === 'tracing') ? 'ttb' : 'ltr';

  const emoji = TYPE_EMOJI[type] ?? TYPE_EMOJI.default;

  return (
    <AbsoluteFill>
      {/* ── PHASE 1: Label card ─────────────────────────────────────────── */}
      <Sequence from={0} durationInFrames={labelFrames}>
        <LabelCard
          activityNumber={activityNumber}
          totalActivities={totalActivities}
          label={label}
          emoji={emoji}
          labelFrames={labelFrames}
        />
      </Sequence>

      {/* ── PHASE 2: Reveal ─────────────────────────────────────────────── */}
      <Sequence from={revealStart} durationInFrames={revealFrames}>
        <AbsoluteFill style={{ backgroundColor: '#f5f5f0' }}>

          {hookText && <HookText text={hookText} position="top" />}

          {useDotDo ? (
            <DotToDoReveal
              blankPath={blankPath}
              solvedPath={solvedPath}
              dots={dotWaypoints ?? []}
              dotColor={dotColor}
              startFrame={0}
              durationFrames={revealFrames}
            />
          ) : useWordSearch ? (
            <WordSearchReveal
              blankPath={blankPath}
              solvedPath={solvedPath}
              rects={wordRects ?? []}
              highlightColor={highlightColor}
              startFrame={0}
              durationFrames={revealFrames}
            />
          ) : useMazeSolver ? (
            <MazeSolverReveal
              blankPath={blankPath}
              solvedPath={solvedPath}
              waypoints={pathWaypoints}
              pathColor={pathColor}
              startFrame={0}
              durationFrames={revealFrames}
            />
          ) : (
            <WipeReveal
              blankPath={blankPath}
              solvedPath={solvedPath}
              revealType={revealType}
              startFrame={0}
              durationFrames={revealFrames}
              easing="linear"
              pathWaypoints={null}
            />
          )}

          {/* Progress indicator: "2 / 4" */}
          <div style={{
            position: 'absolute',
            bottom: 32,
            right: 36,
            backgroundColor: 'rgba(255,210,0,0.9)',
            borderRadius: 20,
            padding: '6px 18px',
            fontSize: 28,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            color: '#1a1a1a',
          }}>
            {activityNumber} / {totalActivities}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ── PHASE 3: Celebration ────────────────────────────────────────── */}
      <Sequence from={celebrateStart} durationInFrames={celebrateFrames}>
        <CelebrationCard activityNumber={activityNumber} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─── LabelCard ────────────────────────────────────────────────────────────────
const LabelCard = ({ activityNumber, totalActivities, label, emoji, labelFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = (s, e) =>
    interpolate(frame, [fps * s, fps * e], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });

  // Countdown: shows "3", "2", "1" in last 3s of label card
  const labelSec = labelFrames / fps;
  const countdownStart = labelSec - 3;
  const countdownFrame = frame / fps - countdownStart;
  const countdown = countdownFrame >= 0
    ? Math.max(1, 3 - Math.floor(countdownFrame))
    : null;

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #1a1a2e 0%, #0f3460 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: '0 60px',
    }}>
      {/* Activity number badge */}
      <div style={{
        opacity: fade(0, 0.4),
        backgroundColor: 'rgba(255,210,0,0.93)',
        borderRadius: 40,
        padding: '10px 30px',
        fontSize: 32,
        fontFamily: 'sans-serif',
        fontWeight: 800,
        color: '#1a1a1a',
      }}>
        Activity {activityNumber} of {totalActivities}
      </div>

      {/* Emoji */}
      <div style={{ opacity: fade(0.3, 0.7), fontSize: 100 }}>{emoji}</div>

      {/* Label */}
      <div style={{
        opacity: fade(0.5, 0.9),
        fontSize: 54,
        fontFamily: 'sans-serif',
        fontWeight: 800,
        color: '#fff',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {label}
      </div>

      {/* Countdown */}
      {countdown !== null && (
        <div style={{
          fontSize: 120,
          fontFamily: 'sans-serif',
          fontWeight: 900,
          color: '#FFD700',
          textShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {countdown}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── CelebrationCard ──────────────────────────────────────────────────────────
const CelebrationCard = ({ activityNumber }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, fps * 0.3, fps * 0.7], [0, 1, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const MESSAGES = [
    'Amazing work! ⭐',
    'You nailed it! 🎉',
    'Incredible! ⭐⭐',
    'Keep going! 🚀',
  ];
  const msg = MESSAGES[(activityNumber - 1) % MESSAGES.length];

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #FFD700 0%, #FF6B35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}>
      <div style={{
        fontSize: 88,
        fontFamily: 'sans-serif',
        fontWeight: 900,
        color: '#1a1a1a',
        textAlign: 'center',
        padding: '0 60px',
      }}>
        {msg}
      </div>
      <FloatingParticles count={20} emoji="⭐" startFrame={0} />
    </AbsoluteFill>
  );
};
