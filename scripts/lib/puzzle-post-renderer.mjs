import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const fontsDir = path.join(ROOT, 'assets', 'fonts');

async function fontFaceStack() {
  const customFredoka = path.join(fontsDir, 'FredokaOne-Regular.ttf');
  const customNunito = path.join(fontsDir, 'Nunito-ExtraBold.ttf');
  const fallbackFredoka = path.join('C:\\Windows\\Fonts', 'comic.ttf');
  const fallbackNunito = path.join('C:\\Windows\\Fonts', 'trebucbd.ttf');
  const [hasFredoka, hasNunito] = await Promise.all([
    fs.access(customFredoka).then(() => true).catch(() => false),
    fs.access(customNunito).then(() => true).catch(() => false),
  ]);
  return {
    fredokaUrl: pathToFileURL(hasFredoka ? customFredoka : fallbackFredoka).href,
    nunitoUrl: pathToFileURL(hasNunito ? customNunito : fallbackNunito).href,
  };
}

export function getThemeConfig(themeStr) {
  const t = String(themeStr || '').toLowerCase();
  if (t.includes('ocean') || t.includes('sea') || t.includes('fish') || t.includes('marine') || t.includes('underwater')) {
    return {
      family: 'ocean',
      bg: 'linear-gradient(170deg, #0A4A82 0%, #1972B8 50%, #0EA8D5 100%)',
      pattern: ['radial-gradient(ellipse 160% 60px at 50% 220px, rgba(255,255,255,0.07) 0%, transparent 100%)','radial-gradient(ellipse 130% 45px at 25% 680px, rgba(255,255,255,0.05) 0%, transparent 100%)','radial-gradient(ellipse 180% 70px at 75% 1100px, rgba(255,255,255,0.06) 0%, transparent 100%)'].join(','),
      titleColor: '#FFF7B8', titleStroke: '#114E85', titleShadow: '0 3px 12px rgba(0,0,0,0.35)',
      cardBg: '#FFFFFF', cardBorderColor: '#45C0D8', cardBorderWidth: '6px', cardShadow: '0 16px 56px rgba(5,40,110,0.60), 0 0 0 4px rgba(69,192,216,0.35)', cardRadius: '22px',
      decors: [{ pos: 'tl', emoji: '🐠', size: 64, opacity: 0.90 }, { pos: 'tr', emoji: '🌊', size: 58, opacity: 0.85 }, { pos: 'bl', emoji: '🐚', size: 52, opacity: 0.80 }, { pos: 'br', emoji: '🐟', size: 56, opacity: 0.85 }],
      startSticker: '🐠 START', finishSticker: '🏁 FINISH', stickerBg: '#FFFFFF', stickerText: '#0A4A82', stickerBorder: '#45C0D8',
      bottomBg: 'rgba(0,0,0,0.22)', bottomColor: 'rgba(255,255,255,0.95)', dotFill: '#FFD700', dotEmpty: 'rgba(255,255,255,0.30)',
    };
  }
  if (t.includes('space') || t.includes('rocket') || t.includes('planet') || t.includes('galaxy') || t.includes('astronaut') || t.includes('star')) {
    return {
      family: 'space',
      bg: 'linear-gradient(170deg, #04071A 0%, #0D1B4B 60%, #1A2A6C 100%)',
      pattern: ['radial-gradient(1.5px 1.5px at 8% 12%, #FFFFFF 0%, transparent 100%)','radial-gradient(1px 1px at 22% 35%, #FFFFFF 0%, transparent 100%)','radial-gradient(2px 2px at 55% 8%, #FFFFFF 0%, transparent 100%)','radial-gradient(1px 1px at 78% 28%, #FFFFFF 0%, transparent 100%)','radial-gradient(2px 2px at 92% 15%, #FFFFFF 0%, transparent 100%)','radial-gradient(1px 1px at 35% 65%, #FFFFFF 0%, transparent 100%)'].join(','),
      titleColor: '#FFFFFF', titleStroke: '#7B61FF', titleShadow: '0 3px 16px rgba(123,97,255,0.60)',
      cardBg: '#F8F7FF', cardBorderColor: '#7B61FF', cardBorderWidth: '5px', cardShadow: '0 0 0 4px rgba(123,97,255,0.25), 0 0 40px rgba(123,97,255,0.50), 0 0 80px rgba(123,97,255,0.20)', cardRadius: '20px',
      decors: [{ pos: 'tl', emoji: '🚀', size: 62, opacity: 0.90 }, { pos: 'tr', emoji: '⭐', size: 58, opacity: 0.85 }, { pos: 'bl', emoji: '🪐', size: 60, opacity: 0.85 }, { pos: 'br', emoji: '🌙', size: 54, opacity: 0.80 }],
      startSticker: '🚀 START', finishSticker: '🌟 FINISH', stickerBg: '#FFFFFF', stickerText: '#312E81', stickerBorder: '#7B61FF',
      bottomBg: 'rgba(0,0,0,0.35)', bottomColor: 'rgba(200,190,255,0.95)', dotFill: '#A78BFA', dotEmpty: 'rgba(167,139,250,0.25)',
    };
  }
  if (t.includes('dino') || t.includes('dinosaur') || t.includes('jurassic') || t.includes('prehistoric') || t.includes('t-rex') || t.includes('trex')) {
    return {
      family: 'dinosaurs',
      bg: 'linear-gradient(170deg, #F1F8E9 0%, #DCEDC8 50%, #C5E1A5 100%)',
      pattern: ['radial-gradient(circle 3px at 15% 20%, rgba(51,105,30,0.20) 0%, transparent 100%)','radial-gradient(circle 2px at 40% 35%, rgba(51,105,30,0.15) 0%, transparent 100%)','radial-gradient(circle 4px at 70% 18%, rgba(51,105,30,0.18) 0%, transparent 100%)','radial-gradient(circle 3px at 85% 55%, rgba(51,105,30,0.15) 0%, transparent 100%)'].join(','),
      titleColor: '#FFF176', titleStroke: '#33691E', titleShadow: '0 3px 12px rgba(0,0,0,0.25)',
      cardBg: '#FFFFFF', cardBorderColor: '#558B2F', cardBorderWidth: '6px', cardShadow: '0 14px 44px rgba(0,0,0,0.22), 0 0 0 3px rgba(85,139,47,0.40)', cardRadius: '20px',
      decors: [{ pos: 'tl', emoji: '🦕', size: 68, opacity: 0.95 }, { pos: 'tr', emoji: '🌴', size: 60, opacity: 0.90 }, { pos: 'bl', emoji: '🥚', size: 54, opacity: 0.85 }, { pos: 'br', emoji: '🦖', size: 64, opacity: 0.95 }],
      startSticker: '🦕 START', finishSticker: '🥚 FINISH', stickerBg: '#FFFFFF', stickerText: '#33691E', stickerBorder: '#558B2F',
      bottomBg: 'rgba(51,105,30,0.18)', bottomColor: '#33691E', dotFill: '#558B2F', dotEmpty: 'rgba(85,139,47,0.25)',
    };
  }
  if (t.includes('dog') || t.includes('cat') || t.includes('puppy') || t.includes('kitten') || t.includes('bunny') || t.includes('rabbit') || t.includes('hamster') || t.includes('pet')) {
    return {
      family: 'animals',
      bg: 'linear-gradient(170deg, #FFF3E0 0%, #FFE0B2 55%, #FFCC80 100%)',
      pattern: ['radial-gradient(ellipse 100% 100% at 0% 0%, rgba(229,91,43,0.10) 0%, transparent 60%)','radial-gradient(ellipse 80% 80% at 100% 100%, rgba(229,91,43,0.08) 0%, transparent 60%)'].join(','),
      titleColor: '#FFF7B8', titleStroke: '#E65100', titleShadow: '0 3px 14px rgba(0,0,0,0.25)',
      cardBg: '#FFFFFF', cardBorderColor: '#E65100', cardBorderWidth: '6px', cardShadow: '0 14px 44px rgba(100,30,0,0.25), 0 0 0 3px rgba(230,81,0,0.35)', cardRadius: '22px',
      decors: [{ pos: 'tl', emoji: '🐶', size: 64, opacity: 0.95 }, { pos: 'tr', emoji: '🐾', size: 56, opacity: 0.85 }, { pos: 'bl', emoji: '🐾', size: 52, opacity: 0.80 }, { pos: 'br', emoji: '🐱', size: 62, opacity: 0.95 }],
      startSticker: '🐶 START', finishSticker: '🦴 FINISH', stickerBg: '#FFFFFF', stickerText: '#BF360C', stickerBorder: '#E65100',
      bottomBg: 'rgba(230,81,0,0.12)', bottomColor: '#BF360C', dotFill: '#E65100', dotEmpty: 'rgba(230,81,0,0.20)',
    };
  }
  return {
    family: 'default',
    bg: 'linear-gradient(170deg, #FFF3E8 0%, #FFE0C4 55%, #FFCBA0 100%)',
    pattern: ['radial-gradient(ellipse 100% 100% at 0% 0%, rgba(229,91,43,0.08) 0%, transparent 60%)','radial-gradient(ellipse 80% 80% at 100% 100%, rgba(229,91,43,0.06) 0%, transparent 60%)'].join(','),
    titleColor: '#FFF7B8', titleStroke: '#E55B2B', titleShadow: '0 3px 14px rgba(0,0,0,0.25)',
    cardBg: '#FFFFFF', cardBorderColor: '#F4874B', cardBorderWidth: '6px', cardShadow: '0 14px 44px rgba(150,60,0,0.22), 0 0 0 3px rgba(244,135,75,0.40)', cardRadius: '22px',
    decors: [{ pos: 'tl', emoji: '🧩', size: 60, opacity: 0.90 }, { pos: 'tr', emoji: '⭐', size: 56, opacity: 0.85 }, { pos: 'bl', emoji: '🎯', size: 58, opacity: 0.85 }, { pos: 'br', emoji: '🏆', size: 58, opacity: 0.85 }],
    startSticker: '👉 START', finishSticker: '🏁 FINISH', stickerBg: '#FFFFFF', stickerText: '#BF3A0F', stickerBorder: '#F4874B',
    bottomBg: 'rgba(229,91,43,0.10)', bottomColor: '#BF3A0F', dotFill: '#E55B2B', dotEmpty: 'rgba(229,91,43,0.20)',
  };
}

function difficultyDotsHtml(level, cfg) {
  const map = { easy: 1, medium: 2, hard: 3, difficult: 4, extreme: 5 };
  const filled = map[level] ?? 2;
  return Array.from({ length: 5 }, (_, i) => `<span class="dot ${i < filled ? 'dot-on' : 'dot-off'}"></span>`).join('');
}

function decorHtml(decors) {
  const positions = {
    tl: 'top:130px; left:40px',
    tr: 'top:130px; right:40px',
    bl: 'bottom:100px; left:40px',
    br: 'bottom:100px; right:40px',
  };
  return decors.map(d => `<span style="position:absolute;${positions[d.pos]};font-size:${d.size}px;opacity:${d.opacity};line-height:1;z-index:5;user-select:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">${d.emoji}</span>`).join('\n');
}

function fittedCropLayout(layout) {
  if (!layout) return null;
  const { offsetX, offsetY, mazeW, mazeH, cropPad = 32 } = layout;
  const cropX = offsetX - cropPad;
  const cropY = offsetY - cropPad;
  const cropW = mazeW + cropPad * 2;
  const cropH = mazeH + cropPad * 2;
  const fitScale = Math.min(824 / cropW, 1258 / cropH);
  const fittedW = cropW * fitScale;
  const fittedH = cropH * fitScale;
  const zoneLeft = (824 - fittedW) / 2;
  const zoneTop = (1258 - fittedH) / 2;
  return { cropX, cropY, cropW, cropH, fittedW, fittedH, zoneLeft, zoneTop };
}

function stickerHtml(meta, cfg) {
  if (meta.puzzleType !== 'maze' || !meta.layout) return '';
  const fit = fittedCropLayout(meta.layout);
  const { offsetX, offsetY, mazeW, mazeH } = meta.layout;
  const startX = fit.zoneLeft + (((offsetX - fit.cropX) / fit.cropW) * fit.fittedW) - 18;
  const startY = fit.zoneTop + (((offsetY - fit.cropY) / fit.cropH) * fit.fittedH) - 54;
  const finishX = fit.zoneLeft + (((offsetX + mazeW - fit.cropX) / fit.cropW) * fit.fittedW) - 104;
  const finishY = fit.zoneTop + (((offsetY + mazeH - fit.cropY) / fit.cropH) * fit.fittedH) - 34;
  const finishSticker = `<div class="finish-sticker" style="left:${finishX}px;top:${finishY}px;">${cfg.finishSticker}</div>`;
  return `<div class="sticker sticker-start" style="left:${startX}px;top:${startY}px;">${cfg.startSticker}</div>${finishSticker}`;
}

function wordSearchFooterHtml(meta, cfg) {
  if (meta.puzzleType !== 'word-search' || !meta.layout?.wordsTop) return '';
  const fit = fittedCropLayout(meta.layout);
  const y = fit.zoneTop + (((meta.layout.wordsTop - fit.cropY) / fit.cropH) * fit.fittedH) - 42;
  return `<div class="word-label-zone" style="top:${y}px;"><div class="word-label-divider"></div><div class="word-label-text">FIND THESE WORDS</div></div>`;
}

export async function buildPostHtml(svgContent, titleText, cfg, meta = {}) {
  const { difficulty = 'medium', ageMin = 5, ageMax = 8, brandName = 'JoyMaze' } = meta;
  const safeTitle = String(titleText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanSvg = svgContent.replace(/<\?xml[^>]*\?>/gi, '').trim();
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const fonts = await fontFaceStack();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family:'Fredoka'; src:url('${fonts.fredokaUrl}') format('truetype'); font-weight:400; }
@font-face { font-family:'Nunito'; src:url('${fonts.nunitoUrl}') format('truetype'); font-weight:800; }
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;} html,body{width:1000px;height:1500px;overflow:hidden;}
.post{position:relative;width:1000px;height:1500px;overflow:hidden;display:flex;flex-direction:column;align-items:center;}
.bg{position:absolute;inset:0;background:${cfg.bg};z-index:0;} .bg-pattern{position:absolute;inset:0;background-image:${cfg.pattern};z-index:1;}
.title-zone{position:relative;z-index:4;width:100%;padding:20px 60px 6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;height:132px;}
.title-text{font-family:'Fredoka',Arial,sans-serif;font-size:54px;font-weight:400;color:${cfg.titleColor};text-align:center;line-height:1.05;max-width:900px;text-shadow:${cfg.titleShadow};-webkit-text-stroke:10px ${cfg.titleStroke};paint-order:stroke fill;letter-spacing:0.5px;}
.maze-zone{position:relative;z-index:4;flex:1;width:100%;padding:0 60px 0;display:flex;align-items:stretch;min-height:0;}
.maze-card{background:${cfg.cardBg};border:${cfg.cardBorderWidth} solid ${cfg.cardBorderColor};border-radius:${cfg.cardRadius};box-shadow:${cfg.cardShadow};width:100%;display:flex;align-items:center;justify-content:center;padding:22px;overflow:hidden;position:relative;}
.maze-card svg{width:100%;height:100%;display:block;}
.sticker{position:absolute;z-index:6;background:${cfg.stickerBg};border:4px solid ${cfg.stickerBorder};border-radius:999px;padding:8px 14px;font-family:'Nunito',Arial,sans-serif;font-size:24px;font-weight:800;color:${cfg.stickerText};box-shadow:0 10px 22px rgba(0,0,0,0.18);white-space:nowrap;transform:rotate(-6deg);} .finish-sticker{position:absolute;background:#E53E3E;color:#FFFFFF;font-family:'Fredoka', Arial, sans-serif;font-size:24px;font-weight:400;padding:8px 16px;border-radius:20px;box-shadow:0 3px 10px rgba(0,0,0,0.30);z-index:10;letter-spacing:0.5px;transform:rotate(6deg);} .word-label-zone{position:absolute;left:88px;right:88px;z-index:8;pointer-events:none;} .word-label-divider{height:2px;background:${cfg.cardBorderColor};opacity:0.28;margin-bottom:8px;} .word-label-text{font-family:'Fredoka',Arial,sans-serif;font-size:22px;font-weight:400;letter-spacing:1.5px;color:${cfg.cardBorderColor};text-align:center;text-shadow:0 1px 0 rgba(255,255,255,0.3);}
.bottom-strip{position:relative;z-index:4;width:100%;height:82px;flex-shrink:0;background:${cfg.bottomBg};display:flex;align-items:center;justify-content:space-between;padding:0 36px;}
.difficulty-block{display:flex;align-items:center;gap:8px;} .dot{display:inline-block;width:15px;height:15px;border-radius:50%;} .dot-on{background:${cfg.dotFill};} .dot-off{background:${cfg.dotEmpty};}
.diff-label{font-family:'Nunito',Arial,sans-serif;font-size:22px;font-weight:800;color:${cfg.bottomColor};margin-left:4px;} .age-badge{font-family:'Nunito',Arial,sans-serif;font-size:22px;font-weight:800;color:${cfg.bottomColor};opacity:0.85;} .brand{font-family:'Fredoka',Arial,sans-serif;font-size:24px;font-weight:400;color:${cfg.bottomColor};opacity:0.60;letter-spacing:1px;}
</style></head><body><div class="post"><div class="bg"></div><div class="bg-pattern"></div>${decorHtml(cfg.decors)}<div class="title-zone"><div class="title-text">${safeTitle}</div></div><div class="maze-zone"><div class="maze-card">${cleanSvg}${stickerHtml(meta, cfg)}${wordSearchFooterHtml(meta, cfg)}</div></div><div class="bottom-strip"><div class="difficulty-block">${difficultyDotsHtml(difficulty, cfg)}<span class="diff-label">${diffLabel}</span></div><span class="age-badge">Ages ${ageMin}–${ageMax}</span><span class="brand">${brandName}</span></div></div></body></html>`;
}

export async function renderPuzzlePost(svgContent, titleText, theme, outPath, meta = {}) {
  const cfg = getThemeConfig(theme);
  const html = await buildPostHtml(svgContent, titleText, cfg, meta);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1500, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.evaluateHandle('document.fonts.ready');
    await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: 1000, height: 1500 } });
  } finally {
    await browser.close();
  }
}
