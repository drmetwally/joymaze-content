import { AbsoluteFill, Sequence } from 'remotion';
import { AnimalSungRecap } from '../components/longform/animal/AnimalSungRecap.jsx';

export const animalFactsSongShortSchema = {
  episodeFolder: '',
  episode: {},
};

const FPS = 30;
const DEFAULT_SONG_FRAMES = 1080;

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

const getBeatImagePaths = (episodeFolder, episode) => {
  const beatCount = Array.isArray(episode.songBeats) ? episode.songBeats.length : 0;
  if (beatCount > 0) {
    return Array.from({ length: beatCount }, (_, index) =>
      resolveEpisodeAsset(episodeFolder, `beat${index + 1}.png`)
    );
  }

  return [
    resolveEpisodeAsset(episodeFolder, 'namereveal.png'),
    ...['fact1', 'fact2', 'fact3', 'fact4', 'fact5'].map((key) =>
      resolveEpisodeAsset(episodeFolder, `${key}.png`)
    ),
  ];
};

const getSongAudioPath = (episodeFolder, episode) => {
  if (episode?.jingleDropPaths?.fullSong) {
    return resolveEpisodeAsset(episodeFolder, episode.jingleDropPaths.fullSong);
  }
  if (episode?.jingleDropPaths?.sungRecap) {
    return resolveEpisodeAsset(episodeFolder, episode.jingleDropPaths.sungRecap);
  }
  return resolveEpisodeAsset(episodeFolder, 'song.mp3');
};

const getSongLyrics = (episode) => episode.fullSongLyrics || episode.sungRecapLyrics || '';

export const AnimalFactsSongShort = ({
  episodeFolder = '',
  episode = {},
}) => {
  const songFrames = secToFrames(
    positiveSec(
      episode.selectedSongDurationSec || episode.songDurationTargetSec || episode.sungRecapShortDurationSec,
      24,
    ),
    24,
  );
  const imagePaths = getBeatImagePaths(episodeFolder, episode);
  const songAudioPath = getSongAudioPath(episodeFolder, episode);
  const lyrics = getSongLyrics(episode);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={0} durationInFrames={songFrames || DEFAULT_SONG_FRAMES}>
        <AnimalSungRecap
          imagePaths={imagePaths}
          sungAudioPath={songAudioPath}
          lyrics={lyrics}
          scenePlan={Array.isArray(episode.songScenePlan) ? episode.songScenePlan : []}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
