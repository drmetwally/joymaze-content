import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
} from 'remotion';
import { CaptionBar } from '../CaptionBar.jsx';

// ─── StorySegment ─────────────────────────────────────────────────────────────
// Single story slide for LongFormEpisode.
// Mirrors SlideScene from StoryEpisode but as a standalone exportable component.
// Uses cross-fade in/out + subtle Ken Burns zoom.

export const StorySegment = ({
  imagePath      = '',
  captionText    = '',
  transitionFrames = 12,  // ~0.4s cross-fade at 30fps
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const tf = Math.min(transitionFrames, Math.floor(durationInFrames / 3));

  const opacity = interpolate(
    frame,
    [0, tf, durationInFrames - tf, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Subtle Ken Burns: 1.0 → 1.04 over full duration
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const src = imagePath?.startsWith('http')
    ? imagePath
    : staticFile(imagePath ?? '');

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#000' }}>
      {/* Background image with Ken Burns */}
      <AbsoluteFill style={{
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        overflow: 'hidden',
      }}>
        <Img
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Caption bar at bottom */}
      {captionText && <CaptionBar text={captionText} />}
    </AbsoluteFill>
  );
};
