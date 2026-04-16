import {
  AbsoluteFill,
  Series,
  Audio,
  staticFile,
} from 'remotion';
import { IntroSegment }    from '../components/longform/IntroSegment.jsx';
import { StorySegment }    from '../components/longform/StorySegment.jsx';
import { TransitionCard }  from '../components/longform/TransitionCard.jsx';
import { ActivitySegment } from '../components/longform/ActivitySegment.jsx';
import { OutroSegment }    from '../components/longform/OutroSegment.jsx';

// ─── Default props / schema ───────────────────────────────────────────────────
// Used by Remotion Studio and as a reference for render-longform.mjs

export const longFormEpisodeSchema = {
  episode: {
    // Metadata
    title:         'JoyMaze Adventure',
    episodeNumber: 1,
    theme:         'adventure',
    format:        'adventure-activities',   // 'adventure-activities' | 'asmr-pack' | 'challenge-ladder'
    hookText:      '',                        // yellow pill text on intro card
    nextEpisodeHint: '',                      // teaser on outro card

    // Story slides (adventure-activities format)
    // Each: { imagePath: 'output/stories/ep01-.../01.png', captionText: '...' }
    storySlides: [],

    // Activity pack (all formats)
    // Each: { type, folder, label, hookText, pathWaypoints, pathColor, wordRects, highlightColor, dotWaypoints, dotColor }
    activities: [],

    // Audio
    musicPath:   'assets/audio/Twinkle - The Grey Room _ Density & Time.mp3',
    musicVolume: 0.3,

    // Segment durations (seconds) — override per episode if needed
    introSec:     20,
    storySlideSec: 15,    // per slide
    transitionSec: 5,
    labelSec:      6,     // per activity: label card
    revealSec:    55,     // per activity: reveal animation
    celebrateSec:  9,     // per activity: celebration
    outroSec:     30,
  },
};

// ─── LongFormEpisode ──────────────────────────────────────────────────────────
// Master composition for ~7.5-8 minute long-form videos.
//
// Timeline (adventure-activities with 8 story slides + 4 activities):
//   Intro           20s
//   Story × 8      120s
//   Transition       5s
//   Activities × 4 280s  (6 + 55 + 9 = 70s each)
//   Outro           30s
//   ─────────────────────
//   Total          455s ≈ 7.6 min
//
// render-longform.mjs calculates exact frame count from episode.json and
// passes it to `npx remotion render` via --props.

export const LongFormEpisode = ({ episode = {} }) => {
  const {
    title            = 'JoyMaze Adventure',
    episodeNumber    = 1,
    theme            = 'adventure',
    format           = 'adventure-activities',
    hookText         = '',
    nextEpisodeHint  = '',
    storySlides      = [],
    activities       = [],
    musicPath        = 'assets/audio/Twinkle - The Grey Room _ Density & Time.mp3',
    musicVolume      = 0.3,
    introSec         = 20,
    storySlideSec    = 15,
    transitionSec    = 5,
    labelSec         = 6,
    revealSec        = 55,
    celebrateSec     = 9,
    outroSec         = 30,
  } = episode;

  const fps = 30;

  const INTRO_FRAMES      = fps * introSec;
  const SLIDE_FRAMES      = fps * storySlideSec;
  const TRANSITION_FRAMES = fps * transitionSec;
  const ACTIVITY_FRAMES   = fps * (labelSec + revealSec + celebrateSec);
  const OUTRO_FRAMES      = fps * outroSec;

  const showStory = format === 'adventure-activities' && storySlides.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>

        {/* ── 1. Intro ──────────────────────────────────────────────────── */}
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <IntroSegment
            title={title}
            episodeNumber={episodeNumber}
            theme={theme}
            hookText={hookText}
          />
        </Series.Sequence>

        {/* ── 2. Story slides (adventure-activities only) ────────────────── */}
        {showStory && storySlides.map((slide, i) => (
          <Series.Sequence key={`story-${i}`} durationInFrames={SLIDE_FRAMES}>
            <StorySegment
              imagePath={slide.imagePath}
              captionText={slide.captionText}
            />
          </Series.Sequence>
        ))}

        {/* ── 3. Transition card ────────────────────────────────────────── */}
        {showStory && (
          <Series.Sequence durationInFrames={TRANSITION_FRAMES}>
            <TransitionCard />
          </Series.Sequence>
        )}

        {/* ── 4. Activity segments ──────────────────────────────────────── */}
        {activities.map((activity, i) => (
          <Series.Sequence key={`activity-${i}`} durationInFrames={ACTIVITY_FRAMES}>
            <ActivitySegment
              activity={activity}
              activityNumber={i + 1}
              totalActivities={activities.length}
              labelSec={labelSec}
              revealSec={revealSec}
              celebrateSec={celebrateSec}
            />
          </Series.Sequence>
        ))}

        {/* ── 5. Outro ──────────────────────────────────────────────────── */}
        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <OutroSegment
            episodeNumber={episodeNumber}
            nextHint={nextEpisodeHint}
          />
        </Series.Sequence>

      </Series>

      {/* ── Global background music (full video, looped) ──────────────── */}
      {musicPath && (
        <Audio
          src={musicPath.startsWith('http') ? musicPath : staticFile(musicPath)}
          loop
          volume={musicVolume}
        />
      )}
    </AbsoluteFill>
  );
};
