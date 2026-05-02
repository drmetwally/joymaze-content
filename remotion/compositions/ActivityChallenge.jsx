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
import { BrandWatermark } from '../components/BrandWatermark.jsx';
import { WordSearchJoyoOverlay } from '../components/WordSearchJoyoOverlay.jsx';
import { MatchingStickerOverlay } from '../components/MatchingStickerOverlay.jsx';

export const activityChallengeSchema = {
  imagePath: '',
  blankImagePath: '',
  solvedImagePath: '',
  hookText: 'Can you solve this maze in 10 seconds?',
  hookStyle: 'challenge',
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
  matchRects: null,
  theme: '',
  sourceImageWidth: 1080,
  sourceImageHeight: 1920,
  mazeStartFraction: null,
  mazeFinishFraction: null,
  mazeHeroAsset: '',
  mazeRewardAsset: '',
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

const getPrimaryThemeEmoji = (themeStr, puzzleType) => {
  const t = String(themeStr || '').toLowerCase();
  if (t.includes('ocean') || t.includes('sea') || t.includes('fish') || t.includes('marine') || t.includes('underwater')) return '🐠';
  if (t.includes('space') || t.includes('rocket') || t.includes('planet') || t.includes('galaxy') || t.includes('astronaut') || t.includes('star')) return '🚀';
  if (t.includes('dino') || t.includes('dinosaur') || t.includes('jurassic') || t.includes('prehistoric') || t.includes('t-rex') || t.includes('trex')) return '🦕';
  if (t.includes('dog') || t.includes('cat') || t.includes('puppy') || t.includes('kitten') || t.includes('bunny') || t.includes('rabbit') || t.includes('hamster') || t.includes('pet')) return '🐶';
  return puzzleType === 'word-search' ? '🔎' : '🧩';
};

const getContainBounds = (imageWidth = 1080, imageHeight = 1920, videoWidth = 1080, videoHeight = 1920) => {
  const imageAspect = imageWidth / imageHeight;
  const videoAspect = videoWidth / videoHeight;
  if (imageAspect > videoAspect) {
    const width = videoWidth;
    const height = videoWidth / imageAspect;
    return { x: 0, y: (videoHeight - height) / 2, width, height };
  }
  const height = videoHeight;
  const width = videoHeight * imageAspect;
  return { x: (videoWidth - width) / 2, y: 0, width, height };
};

const PuzzleBadge = ({ x, y, text, bg, color, border, rotate = -5 }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      zIndex: 7,
      padding: '10px 18px',
      borderRadius: 999,
      background: bg,
      color,
      border: `4px solid ${border}`,
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: 26,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      boxShadow: '0 10px 24px rgba(0,0,0,0.20)',
    }}
  >
    {text}
  </div>
);

const ThemeEmojiBadge = ({ frameBounds, emoji }) => (
  <div
    style={{
      position: 'absolute',
      left: frameBounds.x + frameBounds.width - 54,
      top: frameBounds.y + 54,
      width: 68,
      height: 68,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.92)',
      border: '3px solid rgba(255,255,255,0.68)',
      boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 42,
      zIndex: 7,
    }}
  >
    {emoji}
  </div>
);

const TitleStrip = ({ title, countdown, visible, pulse, hookStyle }) => {
  const opacity = visible ? 1 : 0;
  const y = visible ? 0 : -24;

  const variantMap = {
    challenge: {
      background: 'linear-gradient(180deg, rgba(14,20,38,0.95) 0%, rgba(22,30,52,0.90) 100%)',
      boxShadow: pulse ? '0 0 54px rgba(255,215,70,0.28)' : '0 18px 48px rgba(0,0,0,0.30)',
      titleSize: 60,
    },
    urgent: {
      background: 'linear-gradient(180deg, rgba(28,8,8,0.96) 0%, rgba(44,12,8,0.92) 100%)',
      boxShadow: pulse ? '0 0 54px rgba(255,80,40,0.30)' : '0 18px 48px rgba(0,0,0,0.30)',
      titleSize: 60,
    },
    playful: {
      background: 'linear-gradient(180deg, rgba(220,70,30,0.92) 0%, rgba(240,100,40,0.88) 100%)',
      boxShadow: pulse ? '0 0 54px rgba(255,220,50,0.25)' : '0 18px 48px rgba(0,0,0,0.30)',
      titleSize: 60,
    },
    curiosity: {
      background: 'linear-gradient(180deg, rgba(18,8,40,0.95) 0%, rgba(28,12,60,0.92) 100%)',
      boxShadow: pulse ? '0 0 54px rgba(50,240,220,0.22)' : '0 18px 48px rgba(0,0,0,0.30)',
      titleSize: 60,
    },
    bold: {
      background: '#000000',
      boxShadow: '0 18px 48px rgba(0,0,0,0.30)',
      titleSize: 72,
    },
  };

  const v = variantMap[hookStyle] || variantMap.challenge;

  return (
    <div
      style={{
        position: 'absolute',
        top: 42,
        left: 28,
        right: 28,
        height: 172,
        padding: '0 34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 38,
        background: v.background,
        border: '3px solid rgba(255,255,255,0.12)',
        boxShadow: v.boxShadow,
        transform: `translateY(${y}px) scale(${pulse ? 1.02 : 1})`,
        opacity,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 28,
          top: 16,
          bottom: 16,
          width: 176,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFDF5',
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: 118,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: '-4px',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 4px 16px rgba(0,0,0,0.35)',
          background: 'radial-gradient(circle at 50% 45%, rgba(255,220,92,0.34) 0%, rgba(255,220,92,0.12) 50%, rgba(255,220,92,0.04) 100%)',
          borderRadius: 30,
          border: '2px solid rgba(255,255,255,0.10)',
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
          fontSize: v.titleSize,
          fontWeight: 900,
          lineHeight: 1.02,
          padding: '0 56px 0 168px',
          textShadow: '0 3px 16px rgba(0, 0, 0, 0.32)',
          letterSpacing: '-1px',
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
  sourceImageWidth,
  sourceImageHeight,
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
        sourceImageWidth={sourceImageWidth}
        sourceImageHeight={sourceImageHeight}
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
  hookStyle = activityChallengeSchema.hookStyle,
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
  matchRects = null,
  theme = activityChallengeSchema.theme,
  sourceImageWidth = activityChallengeSchema.sourceImageWidth,
  sourceImageHeight = activityChallengeSchema.sourceImageHeight,
  mazeStartFraction = activityChallengeSchema.mazeStartFraction,
  mazeFinishFraction = activityChallengeSchema.mazeFinishFraction,
  mazeHeroAsset = '',
  mazeRewardAsset = '',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width: videoWidth, height: videoHeight } = useVideoConfig();

  const title = titleText || hookText || activityLabel;
  const challengeFrames = Math.max(1, Math.round(countdownSec * fps));
  const transitionFrames = Math.max(1, Math.round(hookDurationSec * fps));
  const solveFrames = Math.max(1, Math.round(holdAfterSec * fps));
  const transitionStart = challengeFrames;
  const solveStart = challengeFrames + transitionFrames;
  const normalizedType = puzzleType === 'spot-the-difference' ? 'matching' : puzzleType;
  const revealDurationFrames = (() => {
    if (normalizedType === 'word-search' && wordRects?.length) {
      const target = wordRects.length * Math.round(fps * 1.2);
      return Math.max(Math.round(fps * 4), Math.min(solveFrames, target));
    }
    if (normalizedType === 'maze' && pathWaypoints?.length > 1) {
      return Math.max(Math.round(fps * 5), Math.min(solveFrames, Math.round(solveFrames * 0.84)));
    }
    return solveFrames;
  })();
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
  const frameBounds = getContainBounds(sourceImageWidth, sourceImageHeight, videoWidth, videoHeight);
  const themeEmoji = getPrimaryThemeEmoji(theme, normalizedType);
  const pulseStrength = frame >= transitionStart && frame < solveStart;
  const transitionFlashOpacity = interpolate(
    frame,
    [transitionStart + Math.max(1, Math.floor(transitionFrames * 0.58)), transitionStart + Math.max(2, Math.floor(transitionFrames * 0.74)), solveStart],
    [0, 0.65, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
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


      {/* Word-search theme badge */}
      {normalizedType === 'word-search' ? <ThemeEmojiBadge frameBounds={frameBounds} emoji={themeEmoji} /> : null}

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
          hookStyle={hookStyle}
        />
      </div>

      {transitionFlashOpacity > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: transitionFlashOpacity,
            background: 'radial-gradient(circle at 50% 46%, rgba(255,255,255,0.92) 0%, rgba(255,248,214,0.55) 20%, rgba(255,255,255,0.0) 60%)',
            mixBlendMode: 'screen',
          }}
        />
      ) : null}

      <Sequence from={solveStart} durationInFrames={solveFrames}>
        <SolveReveal
          blankImagePath={blankImagePath || imagePath}
          solvedImagePath={solvedImagePath}
          puzzleType={puzzleType}
          durationFrames={revealDurationFrames}
          pathWaypoints={pathWaypoints}
          pathColor={pathColor}
          wordRects={wordRects}
          highlightColor={highlightColor}
          dotWaypoints={dotWaypoints}
          dotColor={dotColor}
          fallbackImagePath={sourceImagePath}
          sourceImageWidth={sourceImageWidth}
          sourceImageHeight={sourceImageHeight}
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

      {showJoyo ? <PuzzleJoyoLayer
        puzzleType={puzzleType}
        frameBounds={frameBounds}
        frame={frame}
        fps={fps}
        challengeFrames={challengeFrames}
        solveStart={solveStart}
        solveFrames={solveFrames}
        mazeStartFraction={mazeStartFraction}
        mazeFinishFraction={mazeFinishFraction}
        wordRects={wordRects}
        matchRects={matchRects}
        theme={theme}
        mazeHeroAsset={mazeHeroAsset}
        mazeRewardAsset={mazeRewardAsset}
      /> : null}
      {showBrandWatermark ? <BrandWatermark text="joymaze.com" position="bottom-center" /> : null}
    </AbsoluteFill>
  );
};

const PuzzleJoyoLayer = ({
  puzzleType,
  frameBounds,
  frame,
  fps,
  challengeFrames,
  solveStart,
  solveFrames,
  mazeStartFraction,
  mazeFinishFraction,
  mazeHeroAsset = '',
  mazeRewardAsset = '',
  wordRects,
  matchRects,
  theme,
}) => {
  const isMaze = puzzleType === 'maze';
  const isWordSearch = puzzleType === 'word-search';
  const isMatching = puzzleType === 'matching';
  const isSolving = frame >= solveStart;
  const celebrateStart = solveStart + solveFrames - Math.round(fps * 1.8);
  const isCelebrating = isSolving && frame >= celebrateStart;

  // Word-search has its own dedicated overlay
  if (isWordSearch) {
    return (
      <WordSearchJoyoOverlay
        frameBounds={frameBounds}
        wordRects={wordRects ?? []}
        challengeFrames={challengeFrames}
        solveStart={solveStart}
        solveFrames={solveFrames}
        frame={frame}
        fps={fps}
      />
    );
  }

  // Matching has its own sticker overlay
  if (isMatching) {
    return (
      <MatchingStickerOverlay
        matchRects={matchRects ?? []}
        theme={theme ?? ''}
        frame={frame}
        fps={fps}
        challengeFrames={challengeFrames}
        solveStart={solveStart}
        solveFrames={solveFrames}
        frameBounds={frameBounds}
      />
    );
  }

  const startX = mazeStartFraction
    ? frameBounds.x + mazeStartFraction.x * frameBounds.width
    : frameBounds.x + 12;
  const startY = mazeStartFraction
    ? frameBounds.y + mazeStartFraction.y * frameBounds.height
    : frameBounds.y + 12;

  const startBob = Math.sin((frame / fps) * Math.PI * 2 / 1.4) * 5;
  const finishX = mazeFinishFraction
    ? frameBounds.x + mazeFinishFraction.x * frameBounds.width
    : frameBounds.x + frameBounds.width - 72;
  const finishY = mazeFinishFraction
    ? frameBounds.y + mazeFinishFraction.y * frameBounds.height
    : frameBounds.y + frameBounds.height - 72;
  const trophyPulse = 1 + Math.sin((frame / fps) * Math.PI * 2 / 1.2) * 0.06;
  const fadeFrames = 12;
  const runningOpacity = isCelebrating
    ? Math.max(0, 1 - (frame - celebrateStart) / fadeFrames)
    : isSolving ? 0 : 1;
  const celebOpacity = isCelebrating
    ? Math.min(1, (frame - celebrateStart) / fadeFrames)
    : 0;
  const celebX = frameBounds.x + frameBounds.width / 2;
  const celebY = frameBounds.y + frameBounds.height - 100;

  const celebSpring = spring({ frame: Math.max(0, frame - celebrateStart), fps, config: { stiffness: 320, damping: 10 } });
  const celebScale = Math.min(1, celebSpring);
  const startSpring = spring({ frame: Math.max(0, frame), fps, config: { stiffness: 300, damping: 12 } });
  const startScale = Math.min(1, startSpring);

  const nonMazeCelebOpacity = !isMaze && isCelebrating ? 1 : 0;

  const TrophyMarker = ({ x, y }) => (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) scale(${trophyPulse})`,
      width: 72,
      height: 72,
      borderRadius: '50%',
      background: 'radial-gradient(circle, #FFE066 0%, #FFB800 60%, #CC8800 100%)',
      border: '3px solid rgba(255,255,255,0.7)',
      boxShadow: '0 0 18px rgba(255,200,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 38,
      zIndex: 8,
    }}>🏆</div>
  );

  return (
    <>
      {/* Maze: hero sticker (or joyo_running.png) at start — challenge phase only (scale-in on entry) */}
      {isMaze && frame < solveStart && (
        <div
          style={{
            position: 'absolute', left: startX, top: startY,
            transform: `translate(-50%, -50%) scale(${startScale})`,
            transformOrigin: 'bottom center', zIndex: 9,
          }}
        >
          <div style={{ transform: `translateY(${startBob}px) scaleX(-1)` }}>
            <Img
              src={mazeHeroAsset ? toSrc(mazeHeroAsset) : staticFile('assets/mascot/joyo_running.png')}
              style={{ width: 90, height: 90 }}
            />
          </div>
        </div>
      )}

      {/* Maze: reward sticker (or trophy) at finish — stays through solve, disappears when celebrating */}
      {isMaze && !isCelebrating && (
        mazeRewardAsset ? (
          <div style={{
            position: 'absolute', left: finishX, top: finishY,
            transform: `translate(-50%, -50%) scale(${trophyPulse})`,
            width: 80, height: 80, zIndex: 8,
          }}>
            <Img src={toSrc(mazeRewardAsset)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <TrophyMarker x={finishX} y={finishY} />
        )
      )}

      {/* Maze solve phase: hero stays at start, fades when celebrating; joyo_celebrating appears at center */}
      {isMaze && (
        <>
          <div
            style={{
              position: 'absolute', left: startX, top: startY,
              transform: 'translate(-50%, -50%)',
              zIndex: 9,
              opacity: frame < solveStart ? 0 : isCelebrating ? runningOpacity : 1,
            }}
          >
            {mazeHeroAsset ? (
              <div style={{ transform: `translateY(${startBob}px) scaleX(-1)` }}>
                <Img src={toSrc(mazeHeroAsset)} style={{ width: 90, height: 90 }} />
              </div>
            ) : (
              <div style={{ transform: `translateY(${startBob}px)` }}>
                <Img src={staticFile('assets/mascot/joyo_running.png')} style={{ width: 90, height: 90 }} />
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', left: celebX, top: celebY, transform: `translate(-50%, -50%) scale(${celebScale})`, zIndex: 9, opacity: celebOpacity }}>
            <Img src={staticFile('assets/mascot/joyo_celebrating.png')} style={{ width: 110, height: 110 }} />
          </div>
        </>
      )}

      {/* Matching: Joyo thinking during challenge, celebrating at solve end */}
      {isMatching && frame < solveStart && (
        <div style={{
          position: 'absolute',
          left: frameBounds.x + frameBounds.width - 120,
          top: frameBounds.y + frameBounds.height - 140,
          transform: `translate(-50%, -50%) scale(${startSpring})`,
          zIndex: 9,
        }}>
          <div style={{ transform: `translateY(${Math.sin((frame / fps) * Math.PI * 2 / 1.4) * 5}px)` }}>
            <Img src={staticFile('assets/mascot/joyo_thinking.png')} style={{ width: 88, height: 88 }} />
          </div>
        </div>
      )}

      {/* All puzzle types: celebrating at last 1.8s of solve */}
      {(isMatching || !isMaze) && (
        <div style={{
          position: 'absolute',
          left: frameBounds.x + frameBounds.width / 2,
          top: frameBounds.y + frameBounds.height - 100,
          transform: 'translate(-50%, -50%)',
          zIndex: 9,
          opacity: nonMazeCelebOpacity,
        }}>
          <Img src={staticFile('assets/mascot/joyo_celebrating.png')} style={{ width: 110, height: 110 }} />
        </div>
      )}
    </>
  );
};
