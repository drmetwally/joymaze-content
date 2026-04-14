import { AbsoluteFill } from 'remotion';

// ─── MazeHandCursor ───────────────────────────────────────────────────────────
// A hand holding a pencil, drawn as SVG. Sits at the tip of the solution line.
// Rebuilt with bezier-curved fingers, fingernails, and depth gradients.
//
// Props: tipX, tipY (video pixels), frame (for jitter), videoWidth, videoHeight

// ── Skin palette ──────────────────────────────────────────────────────────────
const SKIN_LT  = '#F9CFAD';  // highlight (knuckle tops, fingertip fronts)
const SKIN_MID = '#EBB087';  // mid tone
const SKIN_DK  = '#C8774E';  // shadow (underside, crevices)
const NAIL_CLR = '#F5E0D0';  // fingernail
const NAIL_RIM = '#D4A88A';  // nail border

// ── Deterministic jitter (same frame = same values every render) ──────────────
function jitter(frame, seed = 0) {
  const t = frame / 300;
  const yOff =   Math.sin(t * Math.PI * 2 * 1.7  + seed)       * 16
               + Math.sin(t * Math.PI * 2 * 4.3  + seed * 1.3) *  7
               + Math.sin(t * Math.PI * 2 * 9.1  + seed * 2.2) *  2;
  const aOff =   Math.sin(t * Math.PI * 2 * 1.1  + seed * 0.7) *  3.5
               + Math.sin(t * Math.PI * 2 * 3.1  + seed * 1.6) *  1.5;
  return { yOff, aOff };
}

export const MazeHandCursor = ({ tipX, tipY, frame, videoWidth, videoHeight }) => {
  const { yOff, aOff } = jitter(frame, 1.47);

  const finalTipX = Math.min(tipX + 4, videoWidth - 20);
  const finalTipY = tipY + yOff;

  const ANGLE_DEG = 42 + aOff;
  const rad       = ANGLE_DEG * Math.PI / 180;

  // ── Pencil geometry ────────────────────────────────────────────────────────
  const GRAPHITE_LEN = 14;
  const WOOD_LEN     = 36;
  const BODY_LEN     = 210;
  const ERASER_LEN   = 20;
  const BODY_W       = 26;   // pencil body diameter

  // Axis helpers: d = distance along pencil from tip
  const ax = d => finalTipX + d * Math.sin(rad);
  const ay = d => finalTipY - d * Math.cos(rad);

  // Perpendicular unit vectors
  const fpX = -Math.cos(rad);  const fpY = -Math.sin(rad);  // finger side (index)
  const tpX =  Math.cos(rad);  const tpY =  Math.sin(rad);  // thumb side

  // Point helpers: d along pencil axis, r perpendicular offset
  const fp  = (d, r) => [ax(d) + fpX * r,  ay(d) + fpY * r];  // finger side
  const tp  = (d, r) => [ax(d) + tpX * r,  ay(d) + tpY * r];  // thumb side
  const s   = pts => pts.map(v => v.toFixed(1)).join(' ');
  const pt  = pts => pts.map(v => v.toFixed(1)).join(',');

  // Cubic bezier path helper
  const cubicPath = (start, c1, c2, end) =>
    `M ${pt(start)} C ${pt(c1)} ${pt(c2)} ${pt(end)}`;

  // ── Hand attachment zone ───────────────────────────────────────────────────
  // Grip centre: 52 % of body length from tip
  const GRIP_D   = WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.52;
  const HALF_W   = BODY_W / 2;

  // ── Finger definitions ─────────────────────────────────────────────────────
  // Each finger: attach position along pencil (d), forward lean (fwd), outward reach (reach)
  const fingerDefs = [
    { d: WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.29, fwd: 24, reach: 94, w: 24, label: 'index'  },
    { d: WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.48, fwd: 18, reach: 90, w: 22, label: 'middle' },
    { d: WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.66, fwd: 12, reach: 76, w: 19, label: 'ring'   },
  ];

  const fingers = fingerDefs.map(({ d, fwd, reach, w }) => {
    const start  = fp(d,                   HALF_W + 2);
    const ctrl1  = fp(d  + fwd * 0.15,     reach  * 0.50);
    const ctrl2  = fp(d  + fwd * 0.65,     reach  * 0.88);
    const end    = fp(d  + fwd,            reach);
    // Nail sits slightly inset from tip, angled like the fingernail face
    const nail   = fp(d  + fwd * 0.82,    reach  * 0.92);
    return { path: cubicPath(start, ctrl1, ctrl2, end), end, nail, w };
  });

  // ── Thumb ──────────────────────────────────────────────────────────────────
  const THD        = WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.43;
  const thumbStart = tp(THD,       HALF_W + 2);
  const thumbCtrl1 = tp(THD - 4,   38);
  const thumbCtrl2 = tp(THD - 12,  64);
  const thumbEnd   = tp(THD - 18,  72);
  const thumbPath  = cubicPath(thumbStart, thumbCtrl1, thumbCtrl2, thumbEnd);
  const thumbNail  = tp(THD - 16, 66);

  // ── Palm ──────────────────────────────────────────────────────────────────
  // A rounded quadrilateral behind the grip area, linking finger bases to thumb
  const palmPts = [
    tp(GRIP_D - 28,  52),  // thumb side, back
    fp(GRIP_D - 28, -12),  // finger side, back
    fp(GRIP_D + 38, -10),  // finger side, front
    tp(GRIP_D + 38,  48),  // thumb side, front
  ];
  // Rounded corners via cubic bezier arcs
  const palmPath = [
    `M ${pt(palmPts[0])}`,
    `C ${pt(fp(GRIP_D - 28, 20))} ${pt(fp(GRIP_D - 32, -6))} ${pt(palmPts[1])}`,
    `L ${pt(palmPts[2])}`,
    `C ${pt(fp(GRIP_D + 38, 20))} ${pt(tp(GRIP_D + 42, 20))} ${pt(palmPts[3])}`,
    `Z`,
  ].join(' ');

  // ── Gradient anchor points ─────────────────────────────────────────────────
  const gradFpx  = fp(GRIP_D, 70)[0].toFixed(0);
  const gradFpy  = fp(GRIP_D, 70)[1].toFixed(0);
  const gradTpx  = tp(GRIP_D, 40)[0].toFixed(0);
  const gradTpy  = tp(GRIP_D, 40)[1].toFixed(0);

  // Knuckle accent: small arc across each finger at ~55 % of the way out
  const knuckleAccents = fingers.map(({ path: _, w, end, ...f }, i) => {
    const { d, fwd, reach } = fingerDefs[i];
    const kd   = d + fwd * 0.52;
    const kr   = reach * 0.60;
    const kp   = fp(kd, kr);
    const ka   = ANGLE_DEG - 90;
    const klen = w * 0.38;
    const krad = (ka + 90) * Math.PI / 180;
    return {
      x1: (kp[0] - Math.cos(krad) * klen).toFixed(1),
      y1: (kp[1] - Math.sin(krad) * klen).toFixed(1),
      x2: (kp[0] + Math.cos(krad) * klen).toFixed(1),
      y2: (kp[1] + Math.sin(krad) * klen).toFixed(1),
    };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg
        width={videoWidth}
        height={videoHeight}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <defs>
          {/* Pencil drop shadow */}
          <filter id="mhc-pencilShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="3" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.42" />
          </filter>
          {/* Hand drop shadow */}
          <filter id="mhc-handShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="5" stdDeviation="8" floodColor="#000" floodOpacity="0.30" />
          </filter>
          {/* Main skin gradient: light on finger tops, shadow on underside */}
          <linearGradient id="mhc-skinGrad" gradientUnits="userSpaceOnUse"
            x1={gradFpx} y1={gradFpy} x2={gradTpx} y2={gradTpy}>
            <stop offset="0%"   stopColor={SKIN_LT}  />
            <stop offset="55%"  stopColor={SKIN_MID} />
            <stop offset="100%" stopColor={SKIN_DK}  />
          </linearGradient>
          {/* Finger highlight gradient: lighter on knuckle-top edge */}
          <linearGradient id="mhc-hiGrad" gradientUnits="userSpaceOnUse"
            x1={gradFpx} y1={gradFpy} x2={gradTpx} y2={gradTpy}>
            <stop offset="0%"   stopColor="rgba(255,255,255,0.28)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
          </linearGradient>
        </defs>

        {/* ── Pencil (below hand so grip area is covered) ────────────────── */}
        <g filter="url(#mhc-pencilShadow)">
          {/* Graphite tip */}
          <line x1={finalTipX.toFixed(1)} y1={finalTipY.toFixed(1)}
                x2={ax(GRAPHITE_LEN).toFixed(1)} y2={ay(GRAPHITE_LEN).toFixed(1)}
                stroke="#4A4A4A" strokeWidth="9" strokeLinecap="round" />
          {/* Wood shaving */}
          <line x1={ax(GRAPHITE_LEN).toFixed(1)} y1={ay(GRAPHITE_LEN).toFixed(1)}
                x2={ax(WOOD_LEN).toFixed(1)}      y2={ay(WOOD_LEN).toFixed(1)}
                stroke="#C8924E" strokeWidth="18" strokeLinecap="round" />
          {/* Pencil body */}
          <line x1={ax(WOOD_LEN).toFixed(1)}   y1={ay(WOOD_LEN).toFixed(1)}
                x2={ax(BODY_LEN).toFixed(1)}   y2={ay(BODY_LEN).toFixed(1)}
                stroke="#E8B820" strokeWidth={BODY_W} strokeLinecap="round" />
          {/* Ferrule (metal band) */}
          <line x1={ax(BODY_LEN).toFixed(1)}   y1={ay(BODY_LEN).toFixed(1)}
                x2={ax(BODY_LEN + 8).toFixed(1)} y2={ay(BODY_LEN + 8).toFixed(1)}
                stroke="#B8C0CC" strokeWidth={BODY_W + 2} strokeLinecap="butt" />
          {/* Eraser */}
          <line x1={ax(BODY_LEN + 8).toFixed(1)} y1={ay(BODY_LEN + 8).toFixed(1)}
                x2={ax(BODY_LEN + ERASER_LEN).toFixed(1)} y2={ay(BODY_LEN + ERASER_LEN).toFixed(1)}
                stroke="#F08080" strokeWidth={BODY_W + 2} strokeLinecap="round" />
        </g>

        {/* ── Hand (above pencil, covers grip area) ──────────────────────── */}
        <g filter="url(#mhc-handShadow)">

          {/* Palm base */}
          <path d={palmPath} fill="url(#mhc-skinGrad)" />

          {/* Thumb */}
          <path d={thumbPath} fill="none"
                stroke="url(#mhc-skinGrad)" strokeWidth="28" strokeLinecap="round" />
          {/* Thumb highlight */}
          <path d={thumbPath} fill="none"
                stroke="url(#mhc-hiGrad)" strokeWidth="14" strokeLinecap="round" />

          {/* Fingers — base colour */}
          {fingers.map(({ path, w }, i) => (
            <path key={`fb${i}`} d={path} fill="none"
                  stroke="url(#mhc-skinGrad)" strokeWidth={w}
                  strokeLinecap="round" />
          ))}

          {/* Fingers — highlight overlay (upper edge brightening) */}
          {fingers.map(({ path, w }, i) => (
            <path key={`fh${i}`} d={path} fill="none"
                  stroke="url(#mhc-hiGrad)" strokeWidth={w * 0.5}
                  strokeLinecap="round" />
          ))}

          {/* Knuckle accents */}
          {knuckleAccents.map((k, i) => (
            <line key={`k${i}`}
              x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2}
              stroke={SKIN_DK} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
          ))}

          {/* Fingernails */}
          {fingers.map(({ nail }, i) => {
            const [nx, ny] = nail;
            return (
              <g key={`nail${i}`}>
                <ellipse
                  cx={nx.toFixed(1)} cy={ny.toFixed(1)}
                  rx="9" ry="5.5"
                  transform={`rotate(${(ANGLE_DEG - 90).toFixed(1)}, ${nx.toFixed(1)}, ${ny.toFixed(1)})`}
                  fill={NAIL_CLR} stroke={NAIL_RIM} strokeWidth="1.2" opacity="0.90" />
              </g>
            );
          })}

          {/* Thumb nail */}
          {(() => {
            const [nx, ny] = thumbNail;
            return (
              <ellipse
                cx={nx.toFixed(1)} cy={ny.toFixed(1)}
                rx="9" ry="6"
                transform={`rotate(${(ANGLE_DEG + 90).toFixed(1)}, ${nx.toFixed(1)}, ${ny.toFixed(1)})`}
                fill={NAIL_CLR} stroke={NAIL_RIM} strokeWidth="1.2" opacity="0.90" />
            );
          })()}

        </g>
      </svg>
    </AbsoluteFill>
  );
};
