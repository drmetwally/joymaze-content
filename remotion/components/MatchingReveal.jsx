import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion';

// ─── MatchingReveal ────────────────────────────────────────────────────────────
// 3-phase matching puzzle reveal:
//   Phase 1 (hook):  all pairs shown face-up with text labels for ~2.5s
//   Phase 2 (challenge): cards flip face-down, countdown runs
//   Phase 3 (solve): cards flip face-up, orange connection lines draw
//
// Props:
//   blankPath        — path to blank/face-down cards image
//   solvedPath       — path to solved image (used as solve-phase backdrop)
//   matchRects       — [{ x, y, w, h, gridIndex }] video pixel coords
//   matchPairs       — [{ id, label, positions: [gridIdxA, gridIdxB] }]
//   matchConnections — [{ x1, y1, x2, y2, label }] pixel coords
//   hookFrames       — frames for Phase 1
//   challengeFrames  — frames for Phase 2
//   solveFrames      — frames for Phase 3
//   fps              — frames per second
//   theme            — theme string for sticker resolution

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

const THEME_STICKERS = {
  animals:    ['cat','dog','rabbit','elephant','lion','penguin'],
  ocean:      ['fish','crab','seahorse','octopus','turtle','dolphin'],
  space:      ['rocket','planet','astronaut','star','ufo','moon'],
  dinosaurs:  ['trex','triceratops','stegosaurus','pterodactyl','brachiosaurus','raptor'],
  farm:       ['cow','pig','chicken','horse','sheep','duck'],
  vehicles:   ['car','bus','train','airplane','boat','bicycle'],
};

const OCEAN_STICKER_MAP = {
  DOLPHIN:  'dolphin',
  FISH:     'fish',
  CRAB:     'crab',
  OCTOPUS:  'octopus',
  TURTLE:   'turtle',
  SEAHORSE: 'seahorse',
};

function getStickerAsset(label, themeKey) {
  if (themeKey === 'ocean' && OCEAN_STICKER_MAP[label]) {
    return `assets/stickers/matching/ocean/${OCEAN_STICKER_MAP[label]}.png`;
  }
  // Other themes: fall back to position-cycling (theme may not have explicit map)
  const stickerList = THEME_STICKERS[themeKey] || THEME_STICKERS.animals;
  // Derive a stable sticker from the label string
  const idx = label.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % stickerList.length;
  return `assets/stickers/matching/${themeKey}/${stickerList[idx]}.png`;
}

// Progressively drawing connection line
function ConnectionLine({ x1, y1, x2, y2, progress }) {
  if (progress <= 0) return null;
  const cx = x1 + (x2 - x1) * progress;
  const cy = y1 + (y2 - y1) * progress;
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9 }}>
      <line x1={x1} y1={y1} x2={cx} y2={cy} stroke="#FF8C00" strokeWidth="6" strokeLinecap="round" opacity="0.95" />
      <line x1={x1} y1={y1} x2={cx} y2={cy} stroke="#FFB347" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// Flat colored card with label + sticker (face-up state)
function FaceUpCard({ rect, label, stickerSrc, debugId }) {
  const cardW = rect.w;
  const cardH = rect.h;
  const radius = cardW * 0.1;
  const labelSize = Math.max(10, cardW * 0.09);
  const imgSize = cardW * 0.55;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: cardW,
        height: cardH,
        borderRadius: radius,
        backgroundColor: '#FFFDF5',
        border: `4px solid #C8860A`,
        boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 7,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* Label */}
      <div style={{
        fontSize: labelSize,
        fontWeight: 900,
        color: '#1A1A2E',
        fontFamily: 'Arial Black, Arial, sans-serif',
        textAlign: 'center',
        lineHeight: 1.05,
        padding: '0 4px',
        marginBottom: 4,
      }}>
        {label}
      </div>
      {/* Sticker */}
      <Img
        src={staticFile(stickerSrc)}
        style={{
          width: imgSize,
          height: imgSize,
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export const MatchingReveal = ({
  blankPath,
  solvedPath,
  matchRects       = [],
  matchPairs       = [],
  matchConnections = [],
  hookFrames       = 75,
  challengeFrames  = 450,
  solveFrames      = 360,
  fps              = 30,
  theme            = '',
}) => {
  const frame = useCurrentFrame();
  const { width: VW, height: VH } = useVideoConfig();

  const phase1End  = hookFrames;
  const phase2End  = phase1End + challengeFrames;
  const solveStart = phase2End;

  const isPhase1 = frame < phase1End;
  const isPhase2 = frame >= phase1End && frame < phase2End;
  const isSolving = frame >= solveStart;

  const solveProgress = isSolving
    ? Math.min((frame - solveStart) / solveFrames, 1)
    : 0;

  const themeKey = resolveStickerThemeKey(theme);

  // gridIndex → rect lookup
  const rectByIndex = {};
  matchRects.forEach(r => { rectByIndex[r.gridIndex] = r; });

  // Debug: always show cards during phase1 and solving for visibility testing
  const showOverlay = isPhase1 || isSolving;

  return (
    <AbsoluteFill style={{ backgroundColor: '#F5F1E8', pointerEvents: 'none' }}>

      {/* Phase 2: blank/face-down cards + countdown */}
      {isPhase2 && blankPath && (
        <Img
          src={staticFile(blankPath)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}

      {/* Phase 3: solved backdrop (cards face-up, lines will draw on top) */}
      {isSolving && solvedPath && (
        <Img
          src={staticFile(solvedPath)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}

      {/* Phase 1 + Phase 3: face-up cards with labels + stickers */}
      {showOverlay && matchPairs.length > 0 && matchPairs.map(pair => {
        const rectA = rectByIndex[pair.positions[0]];
        const rectB = rectByIndex[pair.positions[1]];
        if (!rectA || !rectB) return null;
        const stickerA = getStickerAsset(pair.label, themeKey);
        const stickerB = getStickerAsset(pair.label, themeKey);
        return [
          <FaceUpCard key={`fa-${pair.id}`} rect={rectA} label={pair.label} stickerSrc={stickerA} debugId={`A-${pair.id}`} />,
          <FaceUpCard key={`fb-${pair.id}`} rect={rectB} label={pair.label} stickerSrc={stickerB} debugId={`B-${pair.id}`} />,
        ];
      })}

      {/* Phase 3: connection lines draw progressively */}
      {isSolving && matchConnections.map((conn, i) => (
        <ConnectionLine
          key={`conn-${i}`}
          x1={conn.x1}
          y1={conn.y1}
          x2={conn.x2}
          y2={conn.y2}
          progress={solveProgress}
        />
      ))}

    </AbsoluteFill>
  );
};
