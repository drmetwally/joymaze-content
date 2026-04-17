import React from 'react';
import {
  AbsoluteFill,
  Series,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { AsmrReveal } from './AsmrReveal.jsx';

export const puzzleCompilationSchema = {
  compilationFolder: '',
  compilation: {},
};

const TITLE_CARD_FRAMES = 150;
const REVEAL_FRAMES = 2100;
const CHAPTER_FRAMES = TITLE_CARD_FRAMES + REVEAL_FRAMES;

const mapRevealType = (activityType) => {
  switch (activityType) {
    case 'coloring':
      return 'ttb';
    case 'maze':
      return 'ltr';
    case 'wordsearch':
      return 'ltr';
    case 'dotdot':
      return 'ltr';
    default:
      return 'ttb';
  }
};

const ChapterTitleCard = ({ chapterNumber, chapterTitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({
    frame: Math.min(frame, 20),
    fps,
    config: { stiffness: 200, damping: 16 },
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #1a1200 0%, #0d0900 100%)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 64px',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(255,210,0,0.93)',
          borderRadius: 22,
          color: '#1a1a1a',
          maxWidth: '90%',
          padding: '24px 34px',
          textAlign: 'center',
          transform: `scale(${entry})`,
          boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'Nunito, Fredoka One, sans-serif',
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: 1,
            lineHeight: 1.1,
          }}
        >
          CHAPTER {chapterNumber}
        </p>
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: 'Nunito, Fredoka One, sans-serif',
            fontSize: 64,
            fontWeight: 900,
            lineHeight: 1.08,
          }}
        >
          {chapterTitle}
        </p>
      </div>
    </AbsoluteFill>
  );
};

const resolveActivityAsset = (activityFolder, filename) => {
  if (!activityFolder) return '';
  const normalized = activityFolder.replace(/\\/g, '/').replace(/\/+$/, '');
  const filePath = `${normalized}/${filename}`;
  if (/^[A-Za-z]:\//.test(filePath) || filePath.startsWith('/')) return filePath;
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
    : '';
  return cwd ? `${cwd}/${filePath}` : filePath;
};

export const PuzzleCompilation = ({
  compilationFolder = '',
  compilation = {},
}) => {
  const chapters = Array.isArray(compilation.chapters) ? compilation.chapters : [];
  const backgroundMusicPath = compilationFolder
    ? `${compilationFolder.replace(/\\/g, '/').replace(/\/+$/, '')}/background.mp3`
    : '';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        {chapters.map((chapter) => (
          <React.Fragment key={chapter.chapterNumber}>
            <Series.Sequence
              durationInFrames={TITLE_CARD_FRAMES}
            >
              <ChapterTitleCard
                chapterNumber={chapter.chapterNumber}
                chapterTitle={chapter.chapterTitle}
              />
            </Series.Sequence>

            <Series.Sequence
              durationInFrames={REVEAL_FRAMES}
            >
              <AsmrReveal
                blankImagePath={resolveActivityAsset(chapter.activityFolder, 'blank.png')}
                solvedImagePath={resolveActivityAsset(chapter.activityFolder, 'solved.png')}
                revealType={mapRevealType(chapter.activityType)}
                hookText={chapter.chapterTitle}
                revealDurationSec={65}
                holdDurationSec={2}
                loopDurationSec={2}
                audioPath={backgroundMusicPath || 'assets/audio/Twinkle - The Grey Room _ Density & Time.mp3'}
                audioVolume={0.6}
                showJoyo={false}
                showParticles={true}
                pathWaypoints={null}
                wordRects={null}
                dotWaypoints={null}
              />
            </Series.Sequence>
          </React.Fragment>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
