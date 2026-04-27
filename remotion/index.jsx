import { registerRoot, Composition } from 'remotion';
import { StoryEpisode,        storyEpisodeSchema }        from './compositions/StoryEpisode.jsx';
import { AsmrReveal,          asmrRevealSchema }          from './compositions/AsmrReveal.jsx';
import { HookIntro,           hookIntroSchema }           from './compositions/HookIntro.jsx';
import { AnimatedFactCard,    animatedFactCardSchema }    from './compositions/AnimatedFactCard.jsx';
import { ActivityChallenge,   activityChallengeSchema }   from './compositions/ActivityChallenge.jsx';
import { LongFormEpisode,     longFormEpisodeSchema }     from './compositions/LongFormEpisode.jsx';
import { StoryLongFormEpisode, storyLongFormEpisodeSchema } from './compositions/StoryLongFormEpisode.jsx';
import { AnimalFactsEpisode, animalFactsEpisodeSchema } from './compositions/AnimalFactsEpisode.jsx';
import { PuzzleCompilation, puzzleCompilationSchema } from './compositions/PuzzleCompilation.jsx';

// ─── Composition Registry ────────────────────────────────────────────────────
// durationInFrames here is the default shown in Remotion Studio.
// render-video.mjs overrides it per-render based on actual content length.

const Root = () => (
  <>
    {/* ── Story video: multi-slide with cross-fade + hook + Joyo ───── */}
    <Composition
      id="StoryEpisode"
      component={StoryEpisode}
      durationInFrames={900}    // 30s default @ 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={storyEpisodeSchema}
    />

    {/* ── ASMR progressive reveal: wipe + sparkles + brand ─────────── */}
    <Composition
      id="AsmrReveal"
      component={AsmrReveal}
      durationInFrames={1395}   // 3s hook + 30s reveal + 1.5s hold @ 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={asmrRevealSchema}
    />

    {/* ── Hook intro: 3-5s punchy standalone clip ───────────────────── */}
    <Composition
      id="HookIntro"
      component={HookIntro}
      durationInFrames={120}    // 4s default @ 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={hookIntroSchema}
    />

    {/* ── Animated fact card: "Did You Know?" educational carousel ──── */}
    <Composition
      id="AnimatedFactCard"
      component={AnimatedFactCard}
      durationInFrames={375}    // 2s intro + 3 cards × 3.5s @ 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={animatedFactCardSchema}
    />

    {/* ── Activity challenge: hook → puzzle + timer → CTA ──────────── */}
    <Composition
      id="ActivityChallenge"
      component={ActivityChallenge}
      durationInFrames={1950}   // 2.5s hook + 60s timer + 2.5s CTA @ 30fps
      fps={30}
      width={1080}
      height={1920}
      defaultProps={activityChallengeSchema}
    />
    {/* ── Long-form episode: 7-8 min story + activity pack ────────── */}
    <Composition
      id="LongFormEpisode"
      component={LongFormEpisode}
      durationInFrames={13650}  // 455s default @ 30fps (overridden by render-longform.mjs)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={longFormEpisodeSchema}
    />
    {/* ── Story long-form episode: ~5-7 min — 9:16 vertical (TikTok Series) ── */}
    <Composition
      id="StoryLongFormEpisode"
      component={StoryLongFormEpisode}
      durationInFrames={9750}   // 325s default @ 30fps (overridden by render-story-longform.mjs)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={storyLongFormEpisodeSchema}
    />
    {/* ── Story long-form episode: ~5-7 min — 16:9 horizontal (YouTube) ──── */}
    <Composition
      id="StoryLongFormEpisodeH"
      component={StoryLongFormEpisode}
      durationInFrames={9750}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={storyLongFormEpisodeSchema}
    />
    {/* ── Animal facts episode: ~3-5 min — 9:16 vertical (TikTok Series) ─── */}
    <Composition
      id="AnimalFactsEpisode"
      component={AnimalFactsEpisode}
      durationInFrames={5400}   // 180s default @ 30fps (overridden at render time)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={animalFactsEpisodeSchema}
    />
    {/* ── Animal facts episode: ~3-5 min — 16:9 horizontal (YouTube) ──────── */}
    <Composition
      id="AnimalFactsEpisodeH"
      component={AnimalFactsEpisode}
      durationInFrames={5400}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={animalFactsEpisodeSchema}
    />
    {/* ── Puzzle compilation: ~60 min — 9:16 vertical (TikTok) ────────────── */}
    <Composition
      id="PuzzleCompilation"
      component={PuzzleCompilation}
      durationInFrames={108000}   // 3600s = 60 min @ 30fps (overridden by render script)
      fps={30}
      width={1080}
      height={1920}
      defaultProps={puzzleCompilationSchema}
    />
    {/* ── Puzzle compilation: ~60 min — 16:9 horizontal (YouTube) ─────────── */}
    <Composition
      id="PuzzleCompilationH"
      component={PuzzleCompilation}
      durationInFrames={108000}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={puzzleCompilationSchema}
    />
  </>
);

registerRoot(Root);
