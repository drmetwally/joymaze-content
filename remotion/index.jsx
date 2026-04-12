import { registerRoot, Composition } from 'remotion';
import { StoryEpisode, storyEpisodeSchema }  from './compositions/StoryEpisode.jsx';
import { AsmrReveal,   asmrRevealSchema }    from './compositions/AsmrReveal.jsx';
import { HookIntro,    hookIntroSchema }     from './compositions/HookIntro.jsx';

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
  </>
);

registerRoot(Root);
