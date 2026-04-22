import { AbsoluteFill, Audio, Series, staticFile } from 'remotion';
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

const FPS                = 30;
const NAME_REVEAL_FRAMES = 150; // 5s — celebration pop
const SUNG_RECAP_FRAMES  = 900; // 30s — song recap
const ACTIVITY_FRAMES    = 900;

// Scene durations driven by actual narration audio length (narration script writes durationSec)
const secToFrames = (sec, fallbackSec) => Math.round((sec || fallbackSec) * FPS);
const segFrames = (episode, key, fallbackSec = 16) =>
  secToFrames(episode[key]?.durationSec, fallbackSec);

const hasActivitySegment = (activityFolder) =>
  typeof activityFolder === 'string' && activityFolder.trim().length > 0;

const resolveAssetSrc = (src) => {
  if (!src) return '';
  const s = String(src).replace(/\\/g, '/');
  if (s.startsWith('http') || s.startsWith('data:') || /^[A-Za-z]:\//.test(s) || s.startsWith('/')) return s;
  return staticFile(s);
};

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
  const HOOK_FRAMES  = secToFrames(Math.max(episode.hookNarrationDurationSec || 8, 6), 8);
  const OUTRO_FRAMES = secToFrames(Math.max(episode.outroCtaDurationSec || 11, 8), 11);

  const bgMusicSrc = resolveEpisodeAsset(episodeFolder, 'background.mp3');

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {bgMusicSrc ? <Audio src={resolveAssetSrc(bgMusicSrc)} volume={0.08} loop /> : null}

      <Series>
        {/* HOOK — question only, voice is hero, no jingle conflict */}
        <Series.Sequence durationInFrames={HOOK_FRAMES}>
          <AnimalHookScene
            hookText={episode.hookNarration || episode.hookFact || ''}
            namerevealPath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
            hookNarrationPath={resolveEpisodeAsset(episodeFolder, 'narration-hook.mp3')}
          />
        </Series.Sequence>

        {/* NAME REVEAL — 5s celebration pop, jingle plays here */}
        <Series.Sequence durationInFrames={NAME_REVEAL_FRAMES}>
          <AnimalNameReveal
            animalName={episode.animalName || ''}
            imagePath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
            hookJinglePath={resolveEpisodeAsset(episodeFolder, 'hook-jingle.mp3')}
            narrationPath={resolveEpisodeAsset(episodeFolder, 'narration-namereveal.mp3')}
          />
        </Series.Sequence>

        {/* FACTS 1–5 — still-image motion + doodle accents + always-on captions */}
        {['fact1', 'fact2', 'fact3', 'fact4', 'fact5'].map((factKey) => (
          <Series.Sequence key={`scene-${factKey}`} durationInFrames={segFrames(episode, factKey)}>
            <AnimalFactScene
              imagePath={resolveEpisodeAsset(episodeFolder, `${factKey}.png`)}
              narrationPath={resolveEpisodeAsset(episodeFolder, `narration-${factKey}.mp3`)}
              narration={episode[factKey]?.narration || ''}
            />
          </Series.Sequence>
        ))}

        <Series.Sequence durationInFrames={SUNG_RECAP_FRAMES}>
          <AnimalSungRecap
            imagePaths={[
              resolveEpisodeAsset(episodeFolder, 'namereveal.png'),
              ...['fact1', 'fact2', 'fact3', 'fact4', 'fact5'].map((k) =>
                resolveEpisodeAsset(episodeFolder, `${k}.png`)
              ),
            ]}
            sungAudioPath={resolveEpisodeAsset(episodeFolder, 'sung-recap.mp3')}
            lyrics={episode.sungRecapLyrics || ''}
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

        {/* OUTRO — curiosity CTA with comment engagement */}
        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <AnimalOutroScene
            imagePath={resolveEpisodeAsset(episodeFolder, 'namereveal.png')}
            outroCta={episode.outroCta || ''}
            outroCtaNarrationPath={resolveEpisodeAsset(episodeFolder, 'narration-outro-cta.mp3')}
            outroJinglePath={resolveEpisodeAsset(episodeFolder, 'outro-jingle.mp3')}
          />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
