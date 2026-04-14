import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Img,
  Audio,
  interpolate,
  staticFile,
} from 'remotion';
import { HookText }            from '../components/HookText.jsx';
import { JoyoWatermark }       from '../components/JoyoWatermark.jsx';
import { CaptionBar }          from '../components/CaptionBar.jsx';
import { TypewriterCaption }   from '../components/TypewriterCaption.jsx';
import { FloatingParticles }   from '../components/FloatingParticles.jsx';

// ─── Default props / schema ──────────────────────────────────────────────────
// Used as defaultProps in index.jsx and as a reference for callers.
export const storyEpisodeSchema = {
  slides: [
    // Each slide: { imagePath, captionText, durationFrames }
    // imagePath: path relative to project root (e.g. "output/raw/story/slide-01.png")
    //            OR a full https:// URL (Cloudinary)
  ],
  hookText: '',           // Yellow banner text — shown for first 3s. Leave '' to skip.
  musicPath: '',          // Relative path to background music file. Leave '' to skip.
  musicVolume: 0.28,      // 0–1
  showJoyo: true,         // Show floating Joyo watermark
  transitionFrames: 15,   // Cross-fade duration in frames (15 = 0.5s @ 30fps)
  typewriterCaptions: false,  // If true, use animated word-by-word TypewriterCaption instead of static CaptionBar
  peakSlideIndex: -1,          // Slide index where FloatingParticles fires (emotional high point). -1 = disabled.
};

// ─── StoryEpisode ─────────────────────────────────────────────────────────────
// Multi-slide story video with cross-fade transitions.
//
// Props: see storyEpisodeSchema above.
//
// Rendering flow:
//   render-video.mjs → bundle → selectComposition → renderMedia
//   Total duration = sum of slide.durationFrames (set dynamically by render-video.mjs)

export const StoryEpisode = ({
  slides = [],
  hookText = '',
  musicPath = '',
  musicVolume = 0.28,
  showJoyo = true,
  transitionFrames = 15,
  typewriterCaptions = false,
  peakSlideIndex = -1,
}) => {
  const { fps } = useVideoConfig();

  // Build slide schedule: each slide knows its global start frame
  let cursor = 0;
  const schedule = slides.map((slide) => {
    const entry = { ...slide, startFrame: cursor };
    cursor += slide.durationFrames ?? Math.round(fps * 4);
    return entry;
  });

  const hookDuration = hookText ? fps * 3 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>

      {/* ── Slides ──────────────────────────────────────────────────────── */}
      {schedule.map((slide, i) => (
        <Sequence
          key={i}
          from={slide.startFrame}
          durationInFrames={slide.durationFrames ?? Math.round(fps * 4)}
        >
          <SlideScene
            slide={slide}
            transitionFrames={transitionFrames}
            typewriterCaptions={typewriterCaptions}
          />
        </Sequence>
      ))}

      {/* ── Hook text (first 3s) ─────────────────────────────────────── */}
      {hookText && (
        <Sequence from={0} durationInFrames={hookDuration}>
          <HookText text={hookText} position="center" />
        </Sequence>
      )}

      {/* ── Floating particles on peak scene (emotional high point) ─── */}
      {peakSlideIndex >= 0 && schedule[peakSlideIndex] && (() => {
        const peak = schedule[peakSlideIndex];
        const particleFrames = Math.round(fps * 2.5);
        const particleStart  = peak.startFrame + Math.floor((peak.durationFrames ?? fps * 4) * 0.35);
        return (
          <Sequence from={particleStart} durationInFrames={particleFrames}>
            <FloatingParticles count={18} emoji="✨" startFrame={0} />
          </Sequence>
        );
      })()}

      {/* ── Joyo watermark (full video) ──────────────────────────────── */}
      <JoyoWatermark visible={showJoyo} />

      {/* ── Background music ─────────────────────────────────────────── */}
      {musicPath && (
        <Audio
          src={musicPath.startsWith('http') ? musicPath : staticFile(musicPath)}
          volume={(frame) => {
            // Fade in over 1s, fade out over last 1.5s
            const totalFrames = cursor;
            return interpolate(
              frame,
              [0, fps, totalFrames - fps * 1.5, totalFrames],
              [0, musicVolume, musicVolume, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            );
          }}
        />
      )}

    </AbsoluteFill>
  );
};

// ─── SlideScene ───────────────────────────────────────────────────────────────
// Individual slide: image + caption, with cross-fade in/out.

const SlideScene = ({ slide, transitionFrames, typewriterCaptions = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const tf = Math.min(transitionFrames, Math.floor(durationInFrames / 3));

  const opacity = interpolate(
    frame,
    [0, tf, durationInFrames - tf, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Subtle Ken Burns: very slow zoom (1.00 → 1.04 over full duration)
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const src = slide.imagePath?.startsWith('http')
    ? slide.imagePath
    : staticFile(slide.imagePath ?? '');

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Background image with Ken Burns */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          overflow: 'hidden',
        }}
      >
        <Img
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Caption bar — static or typewriter */}
      {slide.captionText && (
        typewriterCaptions
          ? <TypewriterCaption text={slide.captionText} />
          : <CaptionBar text={slide.captionText} />
      )}
    </AbsoluteFill>
  );
};
