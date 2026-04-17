import { AbsoluteFill, Series } from 'remotion';
import { StoryHookScene } from '../components/longform/story/StoryHookScene.jsx';
import { StoryActScene } from '../components/longform/story/StoryActScene.jsx';
import { StoryBridgeCard } from '../components/longform/story/StoryBridgeCard.jsx';
import { StoryActivityScene } from '../components/longform/story/StoryActivityScene.jsx';
import { StoryOutroScene } from '../components/longform/story/StoryOutroScene.jsx';

export const storyLongFormEpisodeSchema = {
  episodeFolder: '',
  episode: {},
};

const FPS = 30;
const HOOK_FRAMES = 600;
const BRIDGE_FRAMES = 450;
const ACTIVITY_FRAMES = 2700;
const OUTRO_FRAMES = 600;
const DEFAULT_SCENE_FRAMES = 120;

const hasActivitySegment = (activityFolder) =>
  typeof activityFolder === 'string' && activityFolder.trim().length > 0;

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const isAbsolutePath = (value) => {
  const normalized = normalizeSlashes(value);
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/');
};

const joinPathParts = (...parts) =>
  normalizeSlashes(parts.filter(Boolean).join('/')).replace(/\/+/g, '/');

const resolveEpisodeAsset = (episodeFolder, relativePath) => {
  if (!relativePath) {
    return '';
  }

  const normalizedRelativePath = normalizeSlashes(relativePath);
  if (
    normalizedRelativePath.startsWith('http://') ||
    normalizedRelativePath.startsWith('https://') ||
    normalizedRelativePath.startsWith('data:')
  ) {
    return normalizedRelativePath;
  }

  if (isAbsolutePath(normalizedRelativePath)) {
    return normalizedRelativePath;
  }

  const normalizedEpisodeFolder = normalizeSlashes(episodeFolder).replace(/\/+$/, '');
  const relativeWithoutLeadingSlash = normalizedRelativePath.replace(/^\/+/, '');
  if (isAbsolutePath(normalizedEpisodeFolder)) {
    return joinPathParts(normalizedEpisodeFolder, relativeWithoutLeadingSlash);
  }

  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? normalizeSlashes(process.cwd()).replace(/\/+$/, '')
    : '';

  if (normalizedEpisodeFolder) {
    return joinPathParts(cwd, normalizedEpisodeFolder, relativeWithoutLeadingSlash);
  }

  if (cwd) {
    return joinPathParts(cwd, relativeWithoutLeadingSlash);
  }

  return relativeWithoutLeadingSlash;
};

const getSceneFrames = (scene) => {
  const durationSec = Number(scene?.durationSec);

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return DEFAULT_SCENE_FRAMES;
  }

  return Math.round(durationSec * FPS);
};

const getActScenes = (episode, actIndex) => {
  const act = Array.isArray(episode?.acts) ? episode.acts[actIndex] : null;
  return Array.isArray(act?.scenes) ? act.scenes : [];
};

export const StoryLongFormEpisode = ({
  episodeFolder = '',
  episode = {},
}) => {
  const activityEnabled = hasActivitySegment(episode.activityFolder);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={HOOK_FRAMES}>
          <StoryHookScene
            hookQuestion={episode.hookQuestion || ''}
            jinglePath={resolveEpisodeAsset(episodeFolder, 'hook-jingle.mp3')}
            joyo_png_path="assets/joyo_waving.png"
            durationSec={20}
          />
        </Series.Sequence>

        {[0, 1, 2].map((actIndex) =>
          getActScenes(episode, actIndex).map((scene, sceneIndex) => (
            <Series.Sequence
              key={`act-${actIndex + 1}-scene-${scene.sceneIndex ?? sceneIndex + 1}`}
              durationInFrames={getSceneFrames(scene)}
            >
              <StoryActScene
                scene={{
                  ...scene,
                  imagePath: resolveEpisodeAsset(episodeFolder, scene?.imagePath || ''),
                  animatedClip: resolveEpisodeAsset(episodeFolder, scene?.animatedClip || ''),
                }}
                narrationPath={scene?.narrationFile ? resolveEpisodeAsset(episodeFolder, scene.narrationFile) : ''}
                backgroundMusicPath={resolveEpisodeAsset(episodeFolder, 'background.mp3')}
                actNumber={actIndex + 1}
              />
            </Series.Sequence>
          ))
        )}

        {activityEnabled ? (
          <Series.Sequence durationInFrames={BRIDGE_FRAMES}>
            <StoryBridgeCard
              joyo_png_path="assets/joyo_waving.png"
              ctaText="Try the activity below!"
              durationSec={15}
            />
          </Series.Sequence>
        ) : null}

        {activityEnabled ? (
          <Series.Sequence durationInFrames={ACTIVITY_FRAMES}>
            <StoryActivityScene
              activityFolder={episode.activityFolder}
              countdownSec={60}
              hookText={episode.title || 'Can you solve it?'}
            />
          </Series.Sequence>
        ) : null}

        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <StoryOutroScene
            joyo_png_path="assets/joyo_waving.png"
            outroJinglePath={resolveEpisodeAsset(episodeFolder, 'outro-jingle.mp3')}
            nextEpisodeTeaser={episode.nextEpisodeTeaser || 'New episode every week!'}
            durationSec={20}
          />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
