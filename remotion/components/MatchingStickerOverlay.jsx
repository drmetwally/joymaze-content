import { Img, interpolate, spring, staticFile } from 'remotion';

// ─── MatchingStickerOverlay ────────────────────────────────────────────────────
// Renders sticker images on top of the matching card grid.
// Also renders Joyo (thinking during challenge, celebrating at solve end).
//
// Props:
//   matchRects    — [{ x, y, w, h, gridIndex }] in video pixel coords
//   theme         — theme string (e.g. "Ocean Animals", "Dinosaurs")
//   frame         — current frame
//   fps           — frames per second
//   challengeFrames — frame at which countdown ends
//   solveStart    — frame at which solve reveal begins
//   solveFrames   — total solve phase frames

// Map theme string → sticker library key
function resolveStickerThemeKey(themeStr) {
  const t = String(themeStr || '').toLowerCase();
  if (t.includes('ocean') || t.includes('sea') || t.includes('fish') || t.includes('marine')) return 'ocean';
  if (t.includes('space') || t.includes('rocket') || t.includes('planet') || t.includes('galaxy')) return 'space';
  if (t.includes('dino') || t.includes('jurassic') || t.includes('prehistoric')) return 'dinosaurs';
  if (t.includes('farm') || t.includes('cow') || t.includes('pig') || t.includes('chicken') || t.includes('horse')) return 'farm';
  if (t.includes('vehicle') || t.includes('car') || t.includes('bus') || t.includes('train')) return 'vehicles';
  if (t.includes('animal') || t.includes('dog') || t.includes('cat') || t.includes('pet') || t.includes('bunny')) return 'animals';
  return 'animals';
}

// The 6 sticker names per theme (must match assets/stickers/matching/index.json)
const STICKER_NAMES = ['cat','dog','rabbit','elephant','lion','penguin']; // animals — used for all themes as fallback
const THEME_STICKERS = {
  animals:    ['cat','dog','rabbit','elephant','lion','penguin'],
  ocean:      ['fish','crab','seahorse','octopus','turtle','dolphin'],
  space:      ['rocket','planet','astronaut','star','ufo','moon'],
  dinosaurs:  ['trex','triceratops','stegosaurus','pterodactyl','brachiosaurus','raptor'],
  farm:       ['cow','pig','chicken','horse','sheep','duck'],
  vehicles:   ['car','bus','train','airplane','boat','bicycle'],
};

// Stable pairing: gridIndex mod 6 determines which sticker (consistent across renders)
function getStickerAsset(gridIndex, themeKey) {
  const stickerList = THEME_STICKERS[themeKey] || THEME_STICKERS.animals;
  const name = stickerList[gridIndex % stickerList.length];
  return `assets/stickers/matching/${themeKey}/${name}.png`;
}

export function MatchingStickerOverlay({
  matchRects,
  theme,
  frame,
  fps,
  challengeFrames,
  solveStart,
  solveFrames,
  frameBounds,
}) {
  if (!matchRects?.length) return null;

  const themeKey = resolveStickerThemeKey(theme);
  const isSolving = frame >= solveStart;
  const celebrateStart = solveStart + solveFrames - Math.round(fps * 1.8);
  const isCelebrating = isSolving && frame >= celebrateStart;

  // Think → celebrate crossfade at end of solve phase only
  const fadeFrames = 12;
  const thinkOpacity = isCelebrating
    ? Math.max(0, 1 - (frame - celebrateStart) / fadeFrames)
    : 1;
  const celebOpacity = isCelebrating
    ? Math.min(1, (frame - celebrateStart) / fadeFrames)
    : 0;

  const thinkSpring = spring({ frame: Math.max(0, frame), fps, config: { stiffness: 280, damping: 14 } });
  const celebSpring = spring({ frame: Math.max(0, frame - celebrateStart), fps, config: { stiffness: 300, damping: 12 } });

  // Joyo position: lower-right of puzzle frame bounds
  const joyoX = frameBounds ? frameBounds.x + frameBounds.width - 80 : 900;
  const joyoY = frameBounds ? frameBounds.y + frameBounds.height - 110 : 1700;

  return (
    <>
      {/* Sticker images overlaid on each card, with colored backing circle for contrast */}
      {matchRects.map((rect, i) => {
        const stickerSrc = getStickerAsset(rect.gridIndex, themeKey);
        return (
          <div
            key={`sticker-wrap-${i}`}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              borderRadius: rect.w * 0.12,
              backgroundColor: 'rgba(255,255,255,0.85)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          >
            <Img
              key={`sticker-${i}`}
              src={staticFile(stickerSrc)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                zIndex: 6,
                pointerEvents: 'none',
              }}
            />
          </div>
        );
      })}

      {/* Joyo thinking during challenge */}
      {thinkOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            left: joyoX,
            top: joyoY,
            transform: `translate(-50%, -50%) scale(${Math.min(1, thinkSpring)})`,
            zIndex: 9,
            opacity: thinkOpacity,
          }}
        >
          <div style={{ transform: `translateY(${Math.sin((frame / fps) * Math.PI * 2 / 1.5) * 6}px)` }}>
            <Img
              src={staticFile('assets/mascot/joyo_thinking.png')}
              style={{ width: 90, height: 90 }}
            />
          </div>
        </div>
      )}

      {/* Joyo celebrating at end of solve */}
      {celebOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            left: joyoX,
            top: joyoY,
            transform: `translate(-50%, -50%) scale(${Math.min(1, celebSpring)})`,
            zIndex: 9,
            opacity: celebOpacity,
          }}
        >
          <Img
            src={staticFile('assets/mascot/joyo_celebrating.png')}
            style={{ width: 110, height: 110 }}
          />
        </div>
      )}
    </>
  );
}