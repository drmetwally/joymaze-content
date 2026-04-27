import { AbsoluteFill, Sequence } from 'remotion';
import { StoryHookScene } from '../components/longform/story/StoryHookScene.jsx';
import { StoryActScene } from '../components/longform/story/StoryActScene.jsx';
import { StoryBridgeCard } from '../components/longform/story/StoryBridgeCard.jsx';
import { StoryActivityScene } from '../components/longform/story/StoryActivityScene.jsx';
import { StoryOutroScene } from '../components/longform/story/StoryOutroScene.jsx';
import { StoryCtaScene } from '../components/longform/story/StoryCtaScene.jsx';

export const storyLongFormEpisodeSchema = {
  episodeFolder: '',
  episode: {},
};

const FPS = 30;
const HOOK_FRAMES = 210;   // 7s — jingle + typewriter fill ~7s
const BRIDGE_FRAMES = 450;
const ACTIVITY_FRAMES = 2700;
const OUTRO_FRAMES = 240;  // 8s
const CTA_FRAMES = 600;    // 20s — optional YouTube CTA (episode.includeCta)
const DEFAULT_SCENE_FRAMES = 180; // 6s minimum default
const WARM_BG = '#0f0a06'; // warm very dark brown — global background

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
  if (!relativePath) return '';
  const normalizedRelativePath = normalizeSlashes(relativePath);
  if (
    normalizedRelativePath.startsWith('http://') ||
    normalizedRelativePath.startsWith('https://') ||
    normalizedRelativePath.startsWith('data:')
  ) return normalizedRelativePath;
  if (isAbsolutePath(normalizedRelativePath)) return normalizedRelativePath;
  const normalizedEpisodeFolder = normalizeSlashes(episodeFolder).replace(/\/+$/, '');
  const relativeWithoutLeadingSlash = normalizedRelativePath.replace(/^\/+/, '');
  if (isAbsolutePath(normalizedEpisodeFolder)) {
    return joinPathParts(normalizedEpisodeFolder, relativeWithoutLeadingSlash);
  }
  const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? normalizeSlashes(process.cwd()).replace(/\/+$/, '')
    : '';
  if (normalizedEpisodeFolder) return joinPathParts(cwd, normalizedEpisodeFolder, relativeWithoutLeadingSlash);
  if (cwd) return joinPathParts(cwd, relativeWithoutLeadingSlash);
  return relativeWithoutLeadingSlash;
};

const getSceneFrames = (scene) => {
  const durationSec = Number(scene?.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return DEFAULT_SCENE_FRAMES;
  return Math.max(Math.round(durationSec * FPS), DEFAULT_SCENE_FRAMES);
};

const getActScenes = (episode, actIndex) => {
  const act = Array.isArray(episode?.acts) ? episode.acts[actIndex] : null;
  return Array.isArray(act?.scenes) ? act.scenes : [];
};

const ACT_TRIGGERS = ['NOSTALGIA', 'IDENTITY_MIRROR', 'COMPLETION_SATISFACTION'];

export const StoryLongFormEpisode = ({
  episodeFolder = '',
  episode = {},
}) => {
  const activityEnabled = hasActivitySegment(episode.activityFolder);

  // Collect all resolved image paths for the episode cycling pool
  const allEpisodeImages = [0, 1, 2]
    .flatMap((actIdx) => getActScenes(episode, actIdx))
    .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0))
    .map((s) => (s.imagePath ? resolveEpisodeAsset(episodeFolder, s.imagePath) : ''))
    .filter(Boolean);

  // Flash forward: last scene of Act 3 for hook CURIOSITY_GAP
  const act3Scenes = getActScenes(episode, 2);
  const climaxScene = act3Scenes[act3Scenes.length - 1];
  const flashForwardSrc = climaxScene?.imagePath
    ? resolveEpisodeAsset(episodeFolder, climaxScene.imagePath)
    : '';

  const bgMusicPath = resolveEpisodeAsset(episodeFolder, 'background.mp3');

  // Build scene list with sequential from-positions (hard cuts)
  const allActScenes = [];
  let sceneFrom = HOOK_FRAMES;

  for (let actIndex = 0; actIndex < 3; actIndex++) {
    const actScenes = getActScenes(episode, actIndex);
    const actTrigger =
      episode.psychologyMap?.[`act${actIndex + 1}`] || ACT_TRIGGERS[actIndex] || '';
    actScenes.forEach((scene, sceneIndex) => {
      const frames = getSceneFrames(scene);
      const isClimaxScene = actIndex === 2 && sceneIndex === actScenes.length - 1;
      allActScenes.push({ from: sceneFrom, frames, scene, actIndex, sceneIndex, actTrigger, isClimaxScene });
      sceneFrom += frames;
    });
  }

  // postScenesFrom = end frame of the last scene
  const lastSceneMeta = allActScenes[allActScenes.length - 1];
  const postScenesFrom = lastSceneMeta
    ? lastSceneMeta.from + lastSceneMeta.frames
    : HOOK_FRAMES;

  const bridgeFrom = postScenesFrom;
  const outroFrom = bridgeFrom + (activityEnabled ? BRIDGE_FRAMES + ACTIVITY_FRAMES : 0);

  return (
    <AbsoluteFill style={{ backgroundColor: WARM_BG }}>
      {/* Hook — 9s, flash-forward + question + jingle */}
      <Sequence durationInFrames={HOOK_FRAMES}>
        <StoryHookScene
          hookQuestion={episode.hookQuestion || ''}
          jinglePath={resolveEpisodeAsset(episodeFolder, 'hook-jingle.mp3')}
          backgroundMusicPath={bgMusicPath}
          joyo_png_path="assets/mascot/joyo_waving.png"
          flashForwardSrc={flashForwardSrc}
        />
      </Sequence>

      {/* Act scenes — sequential hard cuts */}
      {allActScenes.map(({ from, frames, scene, actIndex, sceneIndex, actTrigger, isClimaxScene }) => (
        <Sequence
          key={`act-${actIndex + 1}-scene-${scene.sceneIndex ?? sceneIndex + 1}`}
          from={from}
          durationInFrames={frames}
        >
          <StoryActScene
            scene={{
              ...scene,
              imagePath: resolveEpisodeAsset(episodeFolder, scene?.imagePath || ''),
              animatedClip: resolveEpisodeAsset(episodeFolder, scene?.animatedClip || ''),
            }}
            narrationPath={scene?.narrationFile
              ? resolveEpisodeAsset(episodeFolder, scene.narrationFile)
              : ''}
            backgroundMusicPath={bgMusicPath}
            sfxPath={scene?.sfxFile || ''}
            sfxVolume={scene?.sfxVolume ?? 0.25}
            actNumber={actIndex + 1}
            allEpisodeImages={allEpisodeImages}
            psychologyTrigger={actTrigger}
            isClimaxScene={isClimaxScene}
          />
        </Sequence>
      ))}

      {activityEnabled ? (
        <Sequence from={bridgeFrom} durationInFrames={BRIDGE_FRAMES}>
          <StoryBridgeCard
            joyo_png_path="assets/mascot/joyo_waving.png"
            ctaText="Try the activity below!"
            durationSec={15}
          />
        </Sequence>
      ) : null}

      {activityEnabled ? (
        <Sequence from={bridgeFrom + BRIDGE_FRAMES} durationInFrames={ACTIVITY_FRAMES}>
          <StoryActivityScene
            activityFolder={episode.activityFolder}
            countdownSec={60}
            hookText={episode.title || 'Can you solve it?'}
          />
        </Sequence>
      ) : null}

      {/* Outro — 8s */}
      <Sequence from={outroFrom} durationInFrames={OUTRO_FRAMES}>
        <StoryOutroScene
          joyo_png_path="assets/mascot/joyo_waving.png"
          outroJinglePath={resolveEpisodeAsset(episodeFolder, 'outro-jingle.mp3')}
          backgroundMusicPath={bgMusicPath}
          nextEpisodeTeaser={episode.nextEpisodeTeaser || 'New episode every week!'}
        />
      </Sequence>

      {/* Optional YouTube CTA — 20s, only when episode.includeCta is true */}
      {episode.includeCta ? (
        <Sequence from={outroFrom + OUTRO_FRAMES} durationInFrames={CTA_FRAMES}>
          <StoryCtaScene
            joyoImagePath="assets/mascot/joyo_waving.png"
            appIconPath="assets/logos/joymaze-icon.png"
            narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-cta.mp3')}
            jinglePath={resolveEpisodeAsset(episodeFolder, 'hook-jingle.mp3')}
            narrationText="Play with Joyo in the JoyMaze app!"
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
