import { registerRoot, Composition } from 'remotion';
import { StoryEpisode, storyEpisodeSchema } from './compositions/StoryEpisode.jsx';

// ─── Composition Registry ────────────────────────────────────────────────────
// Add new compositions here. durationInFrames is the default — render-video.mjs
// overrides it per-render based on actual slide count.

const Root = () => {
  return (
    <>
      <Composition
        id="StoryEpisode"
        component={StoryEpisode}
        durationInFrames={900}   // 30s default @ 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={storyEpisodeSchema}
      />
    </>
  );
};

registerRoot(Root);
