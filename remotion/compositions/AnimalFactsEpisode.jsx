import { AbsoluteFill, Series } from 'remotion';
import { AnimalHookScene } from '../components/longform/animal/AnimalHookScene.jsx';
import { AnimalNameReveal } from '../components/longform/animal/AnimalNameReveal.jsx';
import { AnimalFactScene } from '../components/longform/animal/AnimalFactScene.jsx';
import { AnimalSungRecap } from '../components/longform/animal/AnimalSungRecap.jsx';
import { AnimalActivityScene } from '../components/longform/animal/AnimalActivityScene.jsx';
import { AnimalOutroScene } from '../components/longform/animal/AnimalOutroScene.jsx';

export const animalFactsEpisodeSchema = {
  episodeFolder: '',
  episode: {},
};

const HOOK_FRAMES = 300;
const NAME_REVEAL_FRAMES = 450;
const HABITAT_FRAMES = 900;
const DIET_FRAMES = 900;
const FUN_FACT_FRAMES = 600;
const SUNG_RECAP_FRAMES = 900;
const ACTIVITY_FRAMES = 900;
const OUTRO_FRAMES = 450;

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

export const AnimalFactsEpisode = ({
  episodeFolder = '',
  episode = {},
}) => {
  const activityEnabled = hasActivitySegment(episode.activityFolder);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={HOOK_FRAMES}>
          <AnimalHookScene
            hookFact={episode.hookFact || ''}
            joyo_png_path="assets/joyo_waving.png"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={NAME_REVEAL_FRAMES}>
          <AnimalNameReveal
            animalName={episode.animalName || ''}
            imagePath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={HABITAT_FRAMES}>
          <AnimalFactScene
            label="WHERE IT LIVES"
            description={episode.habitat?.description || ''}
            imagePath={resolveEpisodeAsset(episodeFolder, 'habitat.png')}
            animatedClip={resolveEpisodeAsset(episodeFolder, 'habitat.mp4')}
            narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-habitat.wav')}
            backgroundMusicPath={resolveEpisodeAsset(episodeFolder, 'background.mp3')}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={DIET_FRAMES}>
          <AnimalFactScene
            label="WHAT IT EATS"
            description={episode.diet?.description || ''}
            imagePath={resolveEpisodeAsset(episodeFolder, 'diet.png')}
            animatedClip={resolveEpisodeAsset(episodeFolder, 'diet.mp4')}
            narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-diet.wav')}
            backgroundMusicPath={resolveEpisodeAsset(episodeFolder, 'background.mp3')}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={FUN_FACT_FRAMES}>
          <AnimalFactScene
            label="FUN FACT"
            description={episode.funFact?.description || ''}
            imagePath={resolveEpisodeAsset(episodeFolder, 'funfact.png')}
            animatedClip={resolveEpisodeAsset(episodeFolder, 'funfact.mp4')}
            narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-funfact.wav')}
            backgroundMusicPath={resolveEpisodeAsset(episodeFolder, 'background.mp3')}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SUNG_RECAP_FRAMES}>
          <AnimalSungRecap
            lyrics={episode.sungRecapLyrics || ''}
            sungAudioPath={resolveEpisodeAsset(episodeFolder, 'sung-recap.mp3')}
          />
        </Series.Sequence>

        {activityEnabled ? (
          <Series.Sequence durationInFrames={ACTIVITY_FRAMES}>
            <AnimalActivityScene
              activityFolder={episode.activityFolder}
              countdownSec={60}
              hookText={`${episode.animalName || ''} Challenge!`}
            />
          </Series.Sequence>
        ) : null}

        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <AnimalOutroScene
            joyo_png_path="assets/joyo_waving.png"
            outroJinglePath={resolveEpisodeAsset(episodeFolder, 'outro-jingle.mp3')}
            nextEpisodeTeaser={episode.nextEpisodeTeaser || 'New animal every week!'}
            durationSec={15}
          />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
