import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { StoryHookScene } from '../components/longform/story/StoryHookScene.jsx';
import { StoryActScene } from '../components/longform/story/StoryActScene.jsx';

export const storyReelV2Schema = {
  slides: [],
  hookQuestion: '',
  hookNarrationPath: '',
  flashForwardImagePath: '',
  backgroundMusicPath: '',
  hookDurationFrames: 150,
};

const resolveAssetSrc = (src) => {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('data:') || src.includes(':\\') || src.startsWith('/')) return src;
  return staticFile(src);
};

export const StoryReelV2 = ({
  slides = [],
  hookQuestion = '',
  hookNarrationPath = '',
  flashForwardImagePath = '',
  backgroundMusicPath = '',
  hookDurationFrames = 150,
}) => {
  const actSlides = slides.filter((slide) => slide?.imagePath);
  let cursor = hookDurationFrames;
  const scheduledSlides = actSlides.map((slide, index) => {
    const durationFrames = slide.durationFrames ?? 120;
    const entry = {
      ...slide,
      sceneIndex: slide.sceneIndex ?? index + 1,
      startFrame: cursor,
      durationFrames,
    };
    cursor += durationFrames;
    return entry;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0a06' }}>
      {backgroundMusicPath ? (
        <Audio src={resolveAssetSrc(backgroundMusicPath)} volume={0.05} loop />
      ) : null}

      <Sequence from={0} durationInFrames={hookDurationFrames}>
        <StoryHookScene
          hookQuestion={hookQuestion}
          hookNarrationPath={hookNarrationPath}
          backgroundMusicPath={backgroundMusicPath}
          flashForwardSrc={flashForwardImagePath}
        />
      </Sequence>

      {scheduledSlides.map((slide, index) => (
        <Sequence
          key={`story-reel-v2-slide-${slide.sceneIndex ?? index + 1}`}
          from={slide.startFrame}
          durationInFrames={slide.durationFrames}
        >
          <StoryActScene
            scene={{
              sceneIndex: slide.sceneIndex ?? index + 1,
              imagePath: slide.imagePath,
              narration: slide.captionText,
            }}
            narrationPath={slide.narrationPath || ''}
            backgroundMusicPath={backgroundMusicPath}
            sfxPath={slide.sfxPath || ''}
            sfxVolume={slide.sfxVolume ?? 0.15}
            psychologyTrigger={slide.psychologyTrigger || ''}
            isClimaxScene={Boolean(slide.isClimaxScene)}
          />
        </Sequence>
      ))}

    </AbsoluteFill>
  );
};
