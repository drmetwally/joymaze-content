import { AbsoluteFill, Sequence } from 'remotion';
import { AnimalHookScene } from '../components/longform/animal/AnimalHookScene.jsx';
import { AnimalNameReveal } from '../components/longform/animal/AnimalNameReveal.jsx';
import { AnimalSungRecap } from '../components/longform/animal/AnimalSungRecap.jsx';
import { AnimalOutroScene } from '../components/longform/animal/AnimalOutroScene.jsx';

export const animalFactsSongShortSchema = {
  episodeFolder: '',
  episode: {},
};

const FPS = 30;
const NAME_REVEAL_FRAMES = 75;
const DEFAULT_SUNG_RECAP_FRAMES = 510;
const DEFAULT_OUTRO_FRAMES = 120;

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

const secToFrames = (sec, fallbackSec) => Math.round((sec || fallbackSec) * FPS);
const positiveSec = (value, fallbackSec) => {
  const sec = Number(value);
  return Number.isFinite(sec) && sec > 0 ? sec : fallbackSec;
};

export const AnimalFactsSongShort = ({
  episodeFolder = '',
  episode = {},
}) => {
  const hookFrames = secToFrames(Math.min(Math.max(episode.hookNarrationDurationSec || 4, 3), 5), 4);
  const sungRecapFrames = secToFrames(positiveSec(episode.sungRecapShortDurationSec, 17), 17);
  const outroFrames = secToFrames(Math.min(Math.max(episode.outroCtaShortDurationSec || 4, 3), 4), 4);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={0} durationInFrames={hookFrames}>
        <AnimalHookScene
          hookText={episode.hookNarration || episode.hookFact || ''}
          namerevealPath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
          hookNarrationPath={resolveEpisodeAsset(episodeFolder, 'narration-hook.mp3')}
        />
      </Sequence>

      <Sequence from={hookFrames} durationInFrames={NAME_REVEAL_FRAMES}>
        <AnimalNameReveal
          animalName={episode.animalName || ''}
          imagePath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
          hookJinglePath={resolveEpisodeAsset(episodeFolder, 'hook-jingle.mp3')}
          narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-namereveal.mp3')}
        />
      </Sequence>

      <Sequence from={hookFrames + NAME_REVEAL_FRAMES} durationInFrames={sungRecapFrames}>
        <AnimalSungRecap
          imagePaths={[
            resolveEpisodeAsset(episodeFolder, 'namereveal.png'),
            ...['fact1', 'fact2', 'fact3', 'fact4', 'fact5'].map((key) =>
              resolveEpisodeAsset(episodeFolder, `${key}.png`)
            ),
          ]}
          sungAudioPath={resolveEpisodeAsset(episodeFolder, 'sung-recap.mp3')}
          lyrics={episode.sungRecapLyrics || ''}
        />
      </Sequence>

      <Sequence from={hookFrames + NAME_REVEAL_FRAMES + sungRecapFrames} durationInFrames={outroFrames || DEFAULT_OUTRO_FRAMES}>
        <AnimalOutroScene
          imagePath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
          outroCta={episode.outroCtaShort || episode.outroCta || `What was your favorite ${episode.animalName || 'animal'} fact?`}
          outroCtaNarrationPath={episode.outroCtaShortFile
            ? resolveEpisodeAsset(episodeFolder, episode.outroCtaShortFile)
            : resolveEpisodeAsset(episodeFolder, 'narration-outro-cta.mp3')}
          outroJinglePath={resolveEpisodeAsset(episodeFolder, 'outro-jingle.mp3')}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
