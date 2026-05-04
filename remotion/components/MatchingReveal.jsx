import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile } from 'remotion';

// ─── MatchingReveal ────────────────────────────────────────────────────────────
// 3-phase matching puzzle reveal:
//   Phase 1 (0 → hookFrames):          all pairs face-up — solved backdrop image
//   Phase 2 (hookFrames → hook+challenge): face-down cards + countdown strip
//   Phase 3 (hook+challenge → end):   sticker reward reveal
//                                      Pairs revealed one-by-one left→right.
//                                      Unrevealed pairs = blank card-backs.
//                                      Revealed pair = both cards spring in together.
//
// Timing:
//   Pair k (k=0..N-1) revealed when solveProgress >= (k+1)/N
//   appearFrame(k) = solveStart + (k+1)/N * solveFrames
//   solveFrames=360, N=6 → 60 frames/pair = 2.0s per pair.
//   All 6 pairs revealed in 12s; last ~3s shows fully-solved board.

const OCEAN_STICKER_MAP = {
  DOLPHIN:  'dolphin',
  FISH:     'fish',
  CRAB:     'crab',
  OCTOPUS:  'octopus',
  TURTLE:   'turtle',
  SEAHORSE: 'seahorse',
};

function resolveStickerThemeKey(themeStr) {
  const t = String(themeStr || '').toLowerCase();
  if (t.includes('ocean') || t.includes('sea') || t.includes('fish') || t.includes('marine')) return 'ocean';
  if (t.includes('space') || t.includes('rocket') || t.includes('planet')) return 'space';
  if (t.includes('dino') || t.includes('jurassic')) return 'dinosaurs';
  if (t.includes('farm') || t.includes('cow') || t.includes('pig')) return 'farm';
  if (t.includes('vehicle') || t.includes('car') || t.includes('bus')) return 'vehicles';
  return 'animals';
}

function getStickerAsset(label, themeKey) {
  if (themeKey === 'ocean' && OCEAN_STICKER_MAP[label]) {
    return `assets/stickers/matching/ocean/${OCEAN_STICKER_MAP[label]}.png`;
  }
  const fallback = { animals: 'cat', space: 'rocket', dinosaurs: 'trex', farm: 'cow', vehicles: 'car' };
  return `assets/stickers/matching/${themeKey}/${fallback[themeKey] || 'cat'}.png`;
}

// ── Revealed face-up card with spring pop-in ────────────────────────────────────
function RevealedCard({ rect, label, stickerSrc, appearFrame }) {
  const frame = useCurrentFrame();
  const revealed = frame >= appearFrame;
  const scale = interpolate(frame, [appearFrame, appearFrame + 14], [0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  if (!revealed || scale <= 0) return null;

  const { x, y, w, h } = rect;
  const radius = w * 0.12;
  const labelSize = Math.max(9, w * 0.1);
  const imgSize = w * 0.52;

  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      borderRadius: radius,
      backgroundColor: '#FFFDF5',
      border: '4px solid #C8860A',
      boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 8, overflow: 'hidden', pointerEvents: 'none',
      transform: `scale(${scale})`,
      transformOrigin: 'center center',
    }}>
      <div style={{ fontSize: labelSize, fontWeight: 900, color: '#1A1A2E', fontFamily: 'Arial Black, Arial, sans-serif', textAlign: 'center', lineHeight: 1.05, padding: '0 4px', marginBottom: 4 }}>
        {label}
      </div>
      <Img src={staticFile(stickerSrc)} style={{ width: imgSize, height: imgSize, objectFit: 'contain', pointerEvents: 'none' }} />
    </div>
  );
}

// ── Blank card back (unrevealed in P3) ─────────────────────────────────────────
function BlankCardBack({ rect }) {
  const { x, y, w, h } = rect;
  const radius = w * 0.12;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      borderRadius: radius,
      background: 'repeating-linear-gradient(135deg, #6B4E2A 0, #8B6340 8px, #7A5A35 8px, #7A5A35 16px)',
      border: '3px solid #C8860A',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 6, overflow: 'hidden', pointerEvents: 'none',
    }} />
  );
}

// ── Title strip: title + countdown in a single horizontal row ─────────────────
function TitleStrip({ title, countdownLabel }) {
  return (
    <div style={{ position: 'absolute', top: 42, left: 28, right: 28 }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(14,20,38,0.97) 0%, rgba(22,30,52,0.92) 100%)',
        border: '3px solid rgba(255,255,255,0.14)',
        borderRadius: 38,
        boxShadow: '0 18px 48px rgba(0,0,0,0.32)',
        padding: '0 34px',
        height: 172,
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24,
      }}>
        <div style={{ fontSize: 58, fontWeight: 900, color: '#FFFFFF', fontFamily: 'Arial Black, Arial, sans-serif', textAlign: 'center' }}>
          {title}
        </div>
        {countdownLabel && (
          <div style={{ fontSize: 82, fontWeight: 900, color: '#FFD700', fontFamily: 'Arial Black, Arial, sans-serif' }}>
            {countdownLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MatchingReveal ────────────────────────────────────────────────────────────
export const MatchingReveal = ({
  blankPath,    // face-down card PNG (used in P2)
  solvedPath,   // all-cards-face-up PNG (used for card art reference)
  sceneBackgroundPath = null, // DEPRECATED — background now comes from blankPath
  matchRects    = [],
  matchPairs    = [],
  matchConnections = [],
  pairOrder     = [],   // reveal order: indices into matchPairs, left→right
  hookFrames    = 75,   // Phase 1 duration
  challengeFrames = 450, // Phase 2 duration
  solveFrames  = 360,  // Phase 3 duration
  fps           = 30,
  theme         = '',
  titleText     = '',
  countdownSec  = 15,
}) => {
  const frame = useCurrentFrame();

  const phase1End  = hookFrames;
  const phase2End  = phase1End + challengeFrames;
  const solveStart = phase2End;

  const isPhase1  = frame < phase1End;
  const isPhase2  = frame >= phase1End && frame < phase2End;
  const isSolving = frame >= solveStart;

  const solveProgress = isSolving
    ? Math.min((frame - solveStart) / solveFrames, 1)
    : 0;

  const countdownRemaining = isPhase2
    ? Math.max(1, Math.ceil(countdownSec * (1 - (frame - phase1End) / challengeFrames)))
    : null;
  const countdownLabel = countdownRemaining != null ? String(countdownRemaining) : '';

  const themeKey = resolveStickerThemeKey(theme);

  // gridIndex → rect lookup
  const rectByIndex = {};
  matchRects.forEach(r => { rectByIndex[r.gridIndex] = r; });

  // ── Reveal logic ───────────────────────────────────────────────────────────
  // P3: pairs revealed left→right as solveProgress crosses each threshold.
  // Unrevealed pairs → blank card-backs.
  // Revealed pairs → spring-in sticker cards at same positions as P1.
  const N = Math.max(1, matchPairs.length);

  // Pair k (k=0..N-1) revealed when solveProgress >= (k+1)/N
  const isPairRevealed = (pairIdx) => {
    const k = pairOrder.indexOf(pairIdx);
    if (k < 0) return false;
    return solveProgress >= (k + 1) / N;
  };

  // Frame at which pair k's cards should spring in
  const pairAppearFrame = (pairIdx) => {
    const k = pairOrder.indexOf(pairIdx);
    if (k < 0) return solveStart + solveFrames + 999;
    return Math.round(solveStart + (k + 1) / N * solveFrames);
  };

  // Build set of revealed pair ids
  const revealedPairIds = new Set();
  matchPairs.forEach(p => { if (isPairRevealed(p.id)) revealedPairIds.add(p.id); });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>

      {/* Screen background: blankPath has the ocean scene + card backs composited.
          P2 renders it as-is. P1 shows scene behind face-up sticker overlays.
          P3 shows scene behind blank backs + revealed sticker cards.
          Use objectFit:'fill' so the scene fills the entire frame (no letterboxing). */}
      {blankPath && (isPhase1 || isPhase2 || isSolving) && (
        <Img src={staticFile(blankPath)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
      )}

      {/* ── P1: all 12 cards face-up as explicit overlays (same system as P3) ── */}
      {/* No solvedImage dependency — guarantees P1 and P3 sticker positions match exactly */}
      {isPhase1 && matchRects.map((r) => {
        const rect = rectByIndex[r.gridIndex];
        if (!rect) return null;
        const label = matchPairs.find(p => p.positions.includes(r.gridIndex))?.label;
        if (!label) return null;
        // P1: card is always visible (appearFrame = -infinity)
        return (
          <RevealedCard
            key={`p1-${r.gridIndex}`}
            rect={rect}
            label={label}
            stickerSrc={getStickerAsset(label, themeKey)}
            appearFrame={-9999}
          />
        );
      })}

      {/* Phase 2: face-down cards (blankPath PNG as background, SVG overlay for clean card backs) */}
      {isPhase2 && blankPath && (
        <Img src={staticFile(blankPath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}
      {isPhase2 && matchRects.map((r) => {
        const rect = rectByIndex[r.gridIndex];
        if (!rect) return null;
        return <BlankCardBack key={`bd-${r.gridIndex}`} rect={rect} />;
      })}

      {/* Phase 3: all cards start face-down (blank SVG overlays for unrevealed) */}
      {isSolving && matchPairs.map((pair) => {
        // Unrevealed: blank card-back
        if (!isPairRevealed(pair.id)) {
          return pair.positions.map((pos, pi) => {
            const rect = rectByIndex[pos];
            if (!rect) return null;
            return <BlankCardBack key={`hidden-${pair.id}-${pi}`} rect={rect} />;
          });
        }
        // Revealed: spring-in sticker card overlay
        const appearF = pairAppearFrame(pair.id);
        return pair.positions.map((pos, pi) => {
          const rect = rectByIndex[pos];
          if (!rect) return null;
          return (
            <RevealedCard
              key={`${pair.id}-${pi}`}
              rect={rect}
              label={pair.label}
              stickerSrc={getStickerAsset(pair.label, themeKey)}
              appearFrame={appearF}
            />
          );
        });
      })}

      {/* Title strip: always visible */}
      {titleText && (
        <TitleStrip title={titleText} countdownLabel={countdownLabel} />
      )}

    </AbsoluteFill>
  );
};