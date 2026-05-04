import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Sequence } from 'remotion';

// ─── MatchingReveal ────────────────────────────────────────────────────────────
// 3-phase matching puzzle reveal:
//   Phase 1 (0 → hookFrames):          all pairs face-up with ocean stickers + labels
//   Phase 2 (hookFrames → hook+challenge): face-down cards + dynamic countdown strip
//   Phase 3 (hook+challenge → end):   sweep reveal — top cards always visible,
//                                      orange line draws from top→bottom,
//                                      bottom card springs up when line reaches it
//
// Sweep spec:
//   - Pair k revealed when solveProgress >= (k+1)/N
//   - Line starts at pair's top-card center, draws toward bottom-card center
//   - Line progress = how far through the pair's own window (k/N → (k+1)/N)
//   - Bottom card snaps/springs when line tip reaches its center (solveProgress = (k+1)/N)

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

// ── SVG connection line that draws progressively from top card → bottom card ──
function ConnectionLine({ x1, y1, x2, y2, progress }) {
  if (progress <= 0) return null;
  const cx = x1 + (x2 - x1) * Math.min(progress, 1);
  const cy = y1 + (y2 - y1) * Math.min(progress, 1);
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9 }}>
      <line x1={x1} y1={y1} x2={cx} y2={cy} stroke="#FF8C00" strokeWidth="8" strokeLinecap="round" opacity="0.95" />
      <line x1={x1} y1={y1} x2={cx} y2={cy} stroke="#FFB347" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// ── Face-up card: white card with label + ocean sticker ───────────────────────
function FaceUpCard({ rect, label, stickerSrc }) {
  const { x, y, w, h } = rect;
  const radius = w * 0.12;
  const labelSize = Math.max(9, w * 0.1);
  const imgSize = w * 0.52;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, backgroundColor: '#FFFDF5', border: '4px solid #C8860A', boxShadow: '0 6px 20px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 7, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ fontSize: labelSize, fontWeight: 900, color: '#1A1A2E', fontFamily: 'Arial Black, Arial, sans-serif', textAlign: 'center', lineHeight: 1.05, padding: '0 4px', marginBottom: 4 }}>
        {label}
      </div>
      <Img src={staticFile(stickerSrc)} style={{ width: imgSize, height: imgSize, objectFit: 'contain', pointerEvents: 'none' }} />
    </div>
  );
}

// ── Face-down card: patterned card back ───────────────────────────────────────
function FaceDownCard({ rect }) {
  const { x, y, w, h } = rect;
  const radius = w * 0.12;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, background: 'repeating-linear-gradient(135deg, #6B4E2A 0, #8B6340 8px, #7A5A35 8px, #7A5A35 16px)', border: '3px solid #C8860A', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 6, overflow: 'hidden', pointerEvents: 'none' }} />
  );
}

// ── Title strip: title + countdown in a single horizontal row ────────────────
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
  blankPath,
  solvedPath,
  matchRects       = [],
  matchPairs        = [],
  matchConnections  = [],  // each: { x1, y1, x2, y2, label } — NO from/to
  pairOrder        = [],   // reveal order: indices into matchPairs, top→bottom
  hookFrames        = 75,  // Phase 1 duration
  challengeFrames  = 450, // Phase 2 duration
  solveFrames      = 360, // Phase 3 duration
  fps              = 30,
  theme            = '',
  titleText        = '',
  countdownSec     = 15,   // Phase 2 total seconds (for countdown math)
}) => {
  const frame = useCurrentFrame();
  const videoConfig = useVideoConfig();
  const vfps = videoConfig?.fps ?? fps;

  const phase1End   = hookFrames;
  const phase2End   = phase1End + challengeFrames;
  const solveStart  = phase2End;

  const isPhase1   = frame < phase1End;
  const isPhase2   = frame >= phase1End && frame < phase2End;
  const isSolving  = frame >= solveStart;

  // Phase 3 overall progress 0→1
  const solveProgress = isSolving
    ? Math.min((frame - solveStart) / solveFrames, 1)
    : 0;

  // Dynamic countdown label for Phase 2
  const countdownRemaining = isPhase2
    ? Math.max(1, Math.ceil(countdownSec * (1 - (frame - phase1End) / challengeFrames)))
    : null;
  const countdownLabel = countdownRemaining != null ? String(countdownRemaining) : '';

  const themeKey = resolveStickerThemeKey(theme);

  // gridIndex → rect lookup
  const rectByIndex = {};
  matchRects.forEach(r => { rectByIndex[r.gridIndex] = r; });

  // ── Phase 3 sweep logic ──────────────────────────────────────────────────
  // Grid: 6 cols × 2 rows. Top row: positions 0–5, bottom row: positions 6–11
  // pairOrder = indices into matchPairs[] in left→right reveal order
  // Pair k revealed when solveProgress >= (k+1)/N
  // Line for pair k: draws from top-card pixel center → bottom-card pixel center
  //   progress = how far through pair k's own window (0 at k/N, 1 at (k+1)/N)
  // Bottom card springs up when solveProgress >= (k+1)/N (at the threshold frame)
  const N = Math.max(1, matchPairs.length);

  const isTopCard = (pos) => pos < 6;  // row 0 = top row in 6×2 grid (col 0–5)

  // lineProgress for pair k: 0 before k/N, 0→1 between k/N and (k+1)/N, 1 after
  const getLineProgress = (pairIdx) => {
    const k = pairOrder.indexOf(pairIdx);
    if (k < 0) return 0;
    const revealAt = (k + 1) / N;          // solveProgress when pair k is revealed
    if (solveProgress < k / N) return 0;   // before this pair's window even starts
    if (solveProgress >= revealAt) return 1; // already revealed → line complete
    // Within pair k's window: scale 0→1
    return (solveProgress - k / N) / (1 / N);
  };

  const isPairRevealed = (pairIdx) => {
    const k = pairOrder.indexOf(pairIdx);
    if (k < 0) return false;
    return solveProgress >= (k + 1) / N;
  };

  // Build a connection map: pair id → {x1,y1,x2,y2} using label to match
  // matchConnections entries: { x1, y1, x2, y2, label }
  // matchPairs have: { id, label, positions: [topPos, bottomPos] }
  const connByLabel = {};
  matchConnections.forEach(c => { connByLabel[c.label] = c; });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AbsoluteFill style={{ backgroundColor: '#F5F1E8', pointerEvents: 'none' }}>

      {/* Phase 1: solved backdrop (all cards visible, sticker labels clear) */}
      {isPhase1 && solvedPath && (
        <Img src={staticFile(solvedPath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}

      {/* Phase 2: face-down cards */}
      {isPhase2 && blankPath && (
        <Img src={staticFile(blankPath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}

      {/* Phase 3: solved backdrop */}
      {isSolving && solvedPath && (
        <Img src={staticFile(solvedPath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}

      {/* ── Phase 2: face-down SVG overlay cards (clean card-back pattern) ── */}
      {isPhase2 && matchRects.map((r) => {
        const rect = rectByIndex[r.gridIndex];
        if (!rect) return null;
        return <FaceDownCard key={`bd-${r.gridIndex}`} rect={rect} />;
      })}

      {/* ── Phase 1 + Phase 3: face-up card overlays ── */}
      {(isPhase1 || isSolving) && matchPairs.map((pair) => {
        return pair.positions.map((pos, pi) => {
          // Top-row cards (positions 0–5): always visible in P1 + P3
          if (isTopCard(pos)) {
            const rect = rectByIndex[pos];
            if (!rect) return null;
            return <FaceUpCard key={`${pair.id}-${pi}`} rect={rect} label={pair.label} stickerSrc={getStickerAsset(pair.label, themeKey)} />;
          }
          // Bottom-row cards (positions 6–11): visible in P1; in P3, spring in when revealed
          if (isSolving && !isPairRevealed(pair.id)) return null;
          const rect = rectByIndex[pos];
          if (!rect) return null;
          return <FaceUpCard key={`${pair.id}-${pi}`} rect={rect} label={pair.label} stickerSrc={getStickerAsset(pair.label, themeKey)} />;
        });
      })}

      {/* ── Phase 3: progressive orange connection lines ── */}
      {isSolving && matchPairs.map((pair, i) => {
        const conn = connByLabel[pair.label];
        if (!conn) return null;
        const lineProgress = Math.min(Math.max(getLineProgress(pair.id), 0), 1);
        return (
          <ConnectionLine
            key={`conn-${i}`}
            x1={conn.x1} y1={conn.y1}
            x2={conn.x2} y2={conn.y2}
            progress={lineProgress}
          />
        );
      })}

      {/* ── Title strip: always visible (title + countdown in horizontal row) ── */}
      {titleText && (
        <TitleStrip title={titleText} countdownLabel={countdownLabel} />
      )}

    </AbsoluteFill>
  );
};