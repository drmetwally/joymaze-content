import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { WipeReveal } from '../components/WipeReveal.jsx';
import { MazeSolverReveal } from '../components/MazeSolverReveal.jsx';
import { WordSearchReveal } from '../components/WordSearchReveal.jsx';
import { DotToDoReveal } from '../components/DotToDoReveal.jsx';
import { JoyoWatermark } from '../components/JoyoWatermark.jsx';
import { BrandWatermark } from '../components/BrandWatermark.jsx';

export const activityChallengeSchema = {
  imagePath: '',
  blankImagePath: '',
  solvedImagePath: '',
  hookText: 'Can you solve this maze in 10 seconds?',
  titleText: '',
  activityLabel: 'MAZE',
  puzzleType: 'maze',
  countdownSec: 10,
  hookDurationSec: 0.6,
  holdAfterSec: 12,
  challengeAudioPath: '',
  tickAudioPath: '',
  transitionCueAudioPath: '',
  solveAudioPath: '',
  challengeAudioVolume: 0.11,
  tickAudioVolume: 0.3,
  transitionCueVolume: 0.24,
  solveAudioVolume: 0.52,
  showJoyo: true,
  showBrandWatermark: false,
  pathWaypoints: null,
  pathColor: '#22BB44',
  wordRects: null,
  highlightColor: '#FFD700',
  dotWaypoints: null,
  dotColor: '#FF6B35',
};

const toSrc = (value) => {
  if (!value) {
    return '';
  }
  return value.startsWith('http') ? value : staticFile(value);
};

const formatCountdown = (frame, fps, challengeFrames) => {
  const secondsLeft = Math.ceil((challengeFrames - frame) / fps);
  return String(Math.max(0, secondsLeft));
};

const TitleStrip = ({ title, countdown, visible, pulse }) => {
  const opacity = visible ? 1 : 0;
  const y = visible ? 0 : -24;

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 40,
        right: 40,
        height: 146,
        padding: '0 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 32,
        backgroundColor: 'rgba(18, 20, 27, 0.82)',
        boxShadow: pulse ? '0 0 40px rgba(255, 255, 255, 0.18)' : '0 16px 40px rgba(0, 0, 0, 0.24)',
        transform: `translateY(${y}px) scale(${pulse ? 1.015 : 1})`,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 34,
          top: 18,
          bottom: 18,
          width: 144,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFF6E8',
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: 88,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: '-2px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {countdown}
      </div>

      <div
        style={{
          width: '100%',
          textAlign: 'center',
          color: '#FFFFFF',
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: 50,
          fontWeight: 900,
          lineHeight: 1.08,
          padding: '0 80px 0 120px',
          textShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {title}
      </div>
    </div>
  );
};

const StaticSolve = ({ imagePath }) => (
  <AbsoluteFill style={{ backgroundColor: '#F5F1E8' }}>
    {imagePath ? (
      <Img
        src={toSrc(imagePath)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    ) : (
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B5E51',
          fontFamily: 'Arial, sans-serif',
          fontSize: 48,
        }}
      >
        solve preview
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);

const SolveReveal = ({
  blankImagePath,
  solvedImagePath,
  puzzleType,
  durationFrames,
  pathWaypoints,
  pathColor,
  wordRects,
  highlightColor,
  dotWaypoints,
  dotColor,
  fallbackImagePath,
}) => {
  const normalizedType = puzzleType === 'spot-the-difference' ? 'matching' : puzzleType;

  if (!blankImagePath || !solvedImagePath) {
    return <StaticSolve imagePath={fallbackImagePath || blankImagePath || solvedImagePath} />;
  }

  if (dotWaypoints?.length > 1 || normalizedType === 'dot-to-dot') {
    return (
      <DotToDoReveal
        blankPath={blankImagePath}
        solvedPath={solvedImagePath}
        dots={dotWaypoints ?? []}
        dotColor={dotColor}
        startFrame={0}
        durationFrames={durationFrames}
      />
    );
  }

  if (wordRects?.length > 0 || normalizedType === 'word-search') {
    return (
      <WordSearchReveal
        blankPath={blankImagePath}
        solvedPath={solvedImagePath}
        rects={wordRects ?? []}
        highlightColor={highlightColor}
        startFrame={0}
        durationFrames={durationFrames}
      />
    );
  }

  if (pathWaypoints?.length > 1 && (normalizedType === 'maze' || normalizedType === 'tracing')) {
    return (
      <MazeSolverReveal
        blankPath={blankImagePath}
        solvedPath={solvedImagePath}
        waypoints={pathWaypoints}
        pathColor={pathColor}
        startFrame={0}
        durationFrames={durationFrames}
      />
    );
  }

  return (
    <WipeReveal
      blankPath={blankImagePath}
      solvedPath={solvedImagePath}
      revealType={normalizedType === 'tracing' ? 'ttb' : 'ltr'}
      startFrame={0}
      durationFrames={durationFrames}
      easing="linear"
      pathWaypoints={null}
    />
  );
};

export const ActivityChallenge = ({
  imagePath = '',
  blankImagePath = '',
  solvedImagePath = '',
  hookText = activityChallengeSchema.hookText,
  titleText = '',
  activityLabel = activityChallengeSchema.activityLabel,
  puzzleType = activityChallengeSchema.puzzleType,
  countdownSec = activityChallengeSchema.countdownSec,
  hookDurationSec = activityChallengeSchema.hookDurationSec,
  holdAfterSec = activityChallengeSchema.holdAfterSec,
  challengeAudioPath = '',
  tickAudioPath = '',
  transitionCueAudioPath = '',
  solveAudioPath = '',
  challengeAudioVolume = activityChallengeSchema.challengeAudioVolume,
  tickAudioVolume = activityChallengeSchema.tickAudioVolume,
  transitionCueVolume = activityChallengeSchema.transitionCueVolume,
  solveAudioVolume = activityChallengeSchema.solveAudioVolume,
  showJoyo = true,
  showBrandWatermark = false,
  pathWaypoints = null,
  pathColor = activityChallengeSchema.pathColor,
  wordRects = null,
  highlightColor = activityChallengeSchema.highlightColor,
  dotWaypoints = null,
  dotColor = activityChallengeSchema.dotColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const title = titleText || hookText || activityLabel;
  const challengeFrames = Math.max(1, Math.round(countdownSec * fps));
  const transitionFrames = Math.max(1, Math.round(hookDurationSec * fps));
  const solveFrames = Math.max(1, Math.round(holdAfterSec * fps));
  const transitionStart = challengeFrames;
  const solveStart = challengeFrames + transitionFrames;
  const sourceImagePath = imagePath || blankImagePath || solvedImagePath;
  const challengeScale = interpolate(frame, [0, challengeFrames], [1, 1.03], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionPulse = interpolate(
    frame,
    [transitionStart, transitionStart + Math.max(1, Math.floor(transitionFrames * 0.35)), solveStart],
    [1.03, 1.05, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const baseScale = frame < solveStart ? (frame < transitionStart ? challengeScale : transitionPulse) : 1;
  const puzzleBrightness = interpolate(
    frame,
    [transitionStart, transitionStart + Math.max(1, Math.floor(transitionFrames * 0.35)), solveStart],
    [1, 1.08, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const stripVisible = frame < solveStart;
  const pulseStrength = frame >= transitionStart && frame < solveStart;
  const challengeFrame = Math.min(frame, challengeFrames - 1);
  const countdownLabel = formatCountdown(challengeFrame, fps, challengeFrames);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - Math.max(1, Math.round(fps * 0.35)), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const tickSequenceFrames = Math.min(Math.max(1, fps), challengeFrames);
  const tickCount = Math.ceil(challengeFrames / fps);
  const fastTickWindowFrames = Math.min(challengeFrames, Math.max(fps * 5, Math.round(challengeFrames * 0.18)));
  const fastTickStart = Math.max(0, challengeFrames - fastTickWindowFrames);
  const fastTickInterval = Math.max(1, Math.round(fps / 2));
  const fastTickCount = Math.ceil(fastTickWindowFrames / fastTickInterval);
  const stripExitSpring = spring({
    frame: Math.max(0, frame - transitionStart),
    fps,
    config: { damping: 18, stiffness: 180, mass: 0.7 },
  });
  const stripExitOpacity = stripVisible ? 1 : interpolate(stripExitSpring, [0, 1], [1, 0]);
  const stripYOffset = stripVisible ? 0 : interpolate(stripExitSpring, [0, 1], [0, -32]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#F5F1E8', opacity: fadeOut }}>
      <AbsoluteFill
        style={{
          transform: `scale(${baseScale})`,
          filter: `brightness(${puzzleBrightness})`,
        }}
      >
        {sourceImagePath ? (
          <Img
            src={toSrc(sourceImagePath)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <AbsoluteFill
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B5E51',
              fontFamily: 'Arial, sans-serif',
              fontSize: 48,
            }}
          >
            puzzle image
          </AbsoluteFill>
        )}
      </AbsoluteFill>

      <div
        style={{
          opacity: stripExitOpacity,
          transform: `translateY(${stripYOffset}px)`,
        }}
      >
        <TitleStrip
          title={title}
          countdown={countdownLabel}
          visible={stripVisible}
          pulse={pulseStrength}
        />
      </div>

      <Sequence from={solveStart} durationInFrames={solveFrames}>
        <SolveReveal
          blankImagePath={blankImagePath || imagePath}
          solvedImagePath={solvedImagePath}
          puzzleType={puzzleType}
          durationFrames={solveFrames}
          pathWaypoints={pathWaypoints}
          pathColor={pathColor}
          wordRects={wordRects}
          highlightColor={highlightColor}
          dotWaypoints={dotWaypoints}
          dotColor={dotColor}
          fallbackImagePath={sourceImagePath}
        />
      </Sequence>

      {challengeAudioPath ? (
        <Audio
          src={toSrc(challengeAudioPath)}
          loop
          volume={(f) => (f < solveStart ? challengeAudioVolume : 0)}
        />
      ) : null}

      {tickAudioPath
        ? Array.from({ length: tickCount }).map((_, index) => {
            const from = index * fps;
            if (from >= challengeFrames) {
              return null;
            }
            return (
              <Sequence key={`tick-${from}`} from={from} durationInFrames={tickSequenceFrames}>
                <Audio src={toSrc(tickAudioPath)} volume={tickAudioVolume} />
              </Sequence>
            );
          })
        : null}

      {tickAudioPath
        ? Array.from({ length: fastTickCount }).map((_, index) => {
            const from = fastTickStart + index * fastTickInterval;
            if (from >= challengeFrames || from % fps === 0) {
              return null;
            }
            return (
              <Sequence key={`fast-tick-${from}`} from={from} durationInFrames={Math.max(1, Math.round(fps * 0.45))}>
                <Audio src={toSrc(tickAudioPath)} volume={tickAudioVolume * 0.9} />
              </Sequence>
            );
          })
        : null}

      {transitionCueAudioPath ? (
        <Sequence from={transitionStart} durationInFrames={transitionFrames}>
          <Audio src={toSrc(transitionCueAudioPath)} volume={transitionCueVolume} />
        </Sequence>
      ) : null}

      {solveAudioPath ? (
        <Sequence from={solveStart} durationInFrames={solveFrames}>
          <Audio
            src={toSrc(solveAudioPath)}
            loop
            volume={solveAudioVolume}
          />
        </Sequence>
      ) : null}

      {showJoyo ? <JoyoWatermark visible /> : null}
      {showBrandWatermark ? <BrandWatermark text="joymaze.com" position="bottom-center" /> : null}
    </AbsoluteFill>
  );
};
