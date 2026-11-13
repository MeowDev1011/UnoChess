import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  CardColor,
  ChessPiece,
  Faction,
  MoveAnnotation,
  PIECE_BASE_COLOR_MAP,
  PieceType,
  ReplayNode,
} from '../types/game';
import { deserializeBoardCompact, sqToCoord } from './replay';

export interface VideoExportOptions {
  nodes: ReplayNode[]; // [root, ...movesInActiveLine]
  whiteName: string;
  blackName: string;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  timeControlLabel: string;
  flipped: boolean;
  msPerMove?: number;
  onProgress?: (pct: number) => void;
}

const WIDTH = 720;
const HEIGHT = 880;
const BOARD_SIZE = 656;
const BOARD_X = (WIDTH - BOARD_SIZE) / 2;
const BOARD_Y = 104;
const SQ_SIZE = BOARD_SIZE / 8;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const BASE_FALLBACK_COLORS: Record<CardColor, [string, string]> = {
  red: ['#ef4444', '#991b1b'],
  blue: ['#38bdf8', '#1d4ed8'],
  green: ['#4ade80', '#15803d'],
  yellow: ['#fde047', '#ca8a04'],
};

const NAG_BADGE_COLORS: Record<Exclude<MoveAnnotation, ''>, { bg: string; text: string }> = {
  '!!': { bg: '#14b8a6', text: '#042f2e' },
  '!': { bg: '#38bdf8', text: '#082f49' },
  '!?': { bg: '#34d399', text: '#022c22' },
  '?!': { bg: '#fbbf24', text: '#451a03' },
  '?': { bg: '#fb923c', text: '#431407' },
  '??': { bg: '#f43f5e', text: '#ffffff' },
};

async function loadBaseImages(): Promise<Partial<Record<CardColor, HTMLImageElement>>> {
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  const entries = await Promise.all(
    colors.map(
      (c) =>
        new Promise<[CardColor, HTMLImageElement | null]>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve([c, img]);
          img.onerror = () => resolve([c, null]);
          img.src = `/assets/${c}-base.png`;
        })
    )
  );
  const map: Partial<Record<CardColor, HTMLImageElement>> = {};
  for (const [k, v] of entries) {
    if (v) map[k] = v;
  }
  return map;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCanvasPiece(
  ctx: CanvasRenderingContext2D,
  piece: ChessPiece,
  x: number,
  y: number,
  size: number,
  baseImages: Partial<Record<CardColor, HTMLImageElement>>
) {
  const baseColor = PIECE_BASE_COLOR_MAP[piece.type];
  const baseImg = baseImages[baseColor];

  // 1. Colored Circular Pedestal Base
  const baseW = size * 0.78;
  const baseH = size * 0.34;
  const baseX = x + (size - baseW) / 2;
  const baseY = y + size * 0.6;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(baseX + baseW / 2, baseY + baseH / 2, baseW / 2, baseH / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  if (baseImg) {
    ctx.drawImage(baseImg, baseX, baseY, baseW, baseH);
  } else {
    const [c1, c2] = BASE_FALLBACK_COLORS[baseColor];
    const grad = ctx.createRadialGradient(
      baseX + baseW * 0.35,
      baseY + baseH * 0.3,
      2,
      baseX + baseW / 2,
      baseY + baseH / 2,
      baseW / 2
    );
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(baseX, baseY, baseW, baseH);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(baseX + baseW / 2, baseY + baseH / 2, baseW / 2, baseH / 2, 0, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = piece.faction === 'white' ? '#FEF3C7' : '#020617';
  ctx.stroke();
  ctx.restore();

  // 2. Crisp Vector Chess Silhouette (scaled from 64x64 viewBox)
  const pad = size * 0.08;
  const pSize = size - pad * 2;
  const scale = pSize / 64;
  const ox = x + pad;
  const oy = y + pad * 0.45;

  const isWhite = piece.faction === 'white';
  const fillMain = isWhite ? '#FFFBEB' : '#1E293B';
  const fillAccent = isWhite ? '#FDE68A' : '#475569';
  const stroke = isWhite ? '#0F172A' : '#F8FAFC';

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;

  const drawPedestal = (rx = 14, rw = 36) => {
    ctx.fillStyle = fillAccent;
    ctx.beginPath();
    ctx.roundRect(rx, 49, rw, 7, 3);
    ctx.fill();
    ctx.stroke();
  };

  switch (piece.type) {
    case 'pawn': {
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.arc(32, 18, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, 28);
      ctx.bezierCurveTo(25, 36, 20, 44, 17, 50);
      ctx.lineTo(47, 50);
      ctx.bezierCurveTo(44, 44, 39, 36, 40, 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawPedestal(14, 36);
      break;
    }
    case 'rook': {
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.moveTo(17, 12);
      ctx.lineTo(23, 12);
      ctx.lineTo(23, 18);
      ctx.lineTo(29, 18);
      ctx.lineTo(29, 12);
      ctx.lineTo(35, 12);
      ctx.lineTo(35, 18);
      ctx.lineTo(41, 18);
      ctx.lineTo(41, 12);
      ctx.lineTo(47, 12);
      ctx.lineTo(47, 24);
      ctx.lineTo(42, 28);
      ctx.lineTo(44, 49);
      ctx.lineTo(20, 49);
      ctx.lineTo(22, 28);
      ctx.lineTo(17, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawPedestal(14, 36);
      break;
    }
    case 'knight': {
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.moveTo(21, 49);
      ctx.lineTo(23, 36);
      ctx.bezierCurveTo(19, 34, 16, 30, 17, 24);
      ctx.lineTo(25, 14);
      ctx.lineTo(29, 10);
      ctx.lineTo(33, 14);
      ctx.bezierCurveTo(42, 15, 48, 23, 47, 34);
      ctx.lineTo(44, 49);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(26, 22, 2.4, 0, Math.PI * 2);
      ctx.fill();
      drawPedestal(14, 36);
      break;
    }
    case 'bishop': {
      ctx.fillStyle = fillAccent;
      ctx.beginPath();
      ctx.arc(32, 10, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.moveTo(32, 14);
      ctx.bezierCurveTo(21, 21, 19, 35, 22, 49);
      ctx.lineTo(42, 49);
      ctx.bezierCurveTo(45, 35, 43, 21, 32, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(27, 26);
      ctx.lineTo(37, 36);
      ctx.stroke();
      drawPedestal(14, 36);
      break;
    }
    case 'queen': {
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.moveTo(14, 22);
      ctx.lineTo(23, 34);
      ctx.lineTo(32, 16);
      ctx.lineTo(41, 34);
      ctx.lineTo(50, 22);
      ctx.lineTo(45, 49);
      ctx.lineTo(19, 49);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const [cx, cy, cr] of [
        [14, 19, 3.5],
        [32, 13, 4],
        [50, 19, 3.5],
      ]) {
        ctx.fillStyle = fillAccent;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      drawPedestal(15, 34);
      break;
    }
    case 'king': {
      ctx.beginPath();
      ctx.moveTo(32, 6);
      ctx.lineTo(32, 18);
      ctx.moveTo(26, 11);
      ctx.lineTo(38, 11);
      ctx.stroke();
      ctx.fillStyle = fillMain;
      ctx.beginPath();
      ctx.moveTo(19, 25);
      ctx.bezierCurveTo(19, 18, 45, 18, 45, 25);
      ctx.lineTo(43, 49);
      ctx.lineTo(21, 49);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawPedestal(15, 34);
      break;
    }
  }
  ctx.restore();
}

function renderReplayFrame(
  ctx: CanvasRenderingContext2D,
  node: ReplayNode,
  opts: VideoExportOptions,
  baseImages: Partial<Record<CardColor, HTMLImageElement>>,
  isFinalFrame: boolean
) {
  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('UnoChess', BOARD_X, 42);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${opts.timeControlLabel || '∞'} · ${opts.result}`, BOARD_X + BOARD_SIZE, 40);

  // Top & bottom players
  const topIsWhite = opts.flipped;
  const topName = topIsWhite ? opts.whiteName : opts.blackName;
  const bottomName = topIsWhite ? opts.blackName : opts.whiteName;

  const drawPlayerBar = (name: string, faction: Faction, y: number) => {
    ctx.fillStyle = '#1e293b';
    drawRoundedRect(ctx, BOARD_X, y, BOARD_SIZE, 36, 10);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = faction === 'white' ? '#fffbeb' : '#0f172a';
    ctx.beginPath();
    ctx.arc(BOARD_X + 20, y + 18, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = faction === 'white' ? '#0f172a' : '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name.slice(0, 28), BOARD_X + 36, y + 24);
  };

  drawPlayerBar(topName, topIsWhite ? 'white' : 'black', 58);

  // Board outer rainbow/gold frame
  const frameGrad = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_SIZE, BOARD_Y + BOARD_SIZE);
  frameGrad.addColorStop(0, '#fbbf24');
  frameGrad.addColorStop(0.5, '#ef4444');
  frameGrad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = frameGrad;
  drawRoundedRect(ctx, BOARD_X - 8, BOARD_Y - 8, BOARD_SIZE + 16, BOARD_SIZE + 16, 18);
  ctx.fill();

  const board = deserializeBoardCompact(node.boardStr);
  const fromC = sqToCoord(node.fromSq);
  const toC = sqToCoord(node.toSq);

  ctx.save();
  drawRoundedRect(ctx, BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE, 10);
  ctx.clip();

  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const r = opts.flipped ? 7 - vr : vr;
      const c = opts.flipped ? 7 - vc : vc;
      const sx = BOARD_X + vc * SQ_SIZE;
      const sy = BOARD_Y + vr * SQ_SIZE;
      const isLight = (r + c) % 2 === 0;

      ctx.fillStyle = isLight ? '#FFF5DF' : '#214568';
      ctx.fillRect(sx, sy, SQ_SIZE, SQ_SIZE);

      const isMoveSq =
        (fromC && fromC.row === r && fromC.col === c) ||
        (toC && toC.row === r && toC.col === c);
      if (isMoveSq) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.38)';
        ctx.fillRect(sx, sy, SQ_SIZE, SQ_SIZE);
      }

      if (vc === 0) {
        ctx.fillStyle = isLight ? 'rgba(71, 85, 105, 0.75)' : 'rgba(186, 230, 253, 0.65)';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(8 - r), sx + 4, sy + 14);
      }
      if (vr === 7) {
        ctx.fillStyle = isLight ? 'rgba(71, 85, 105, 0.75)' : 'rgba(186, 230, 253, 0.65)';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(FILES[c], sx + SQ_SIZE - 4, sy + SQ_SIZE - 5);
      }

      const piece = board[r][c];
      if (piece) {
        drawCanvasPiece(ctx, piece, sx + 2, sy + 2, SQ_SIZE - 4, baseImages);
      }

      if (toC && toC.row === r && toC.col === c && node.nag) {
        const badge = NAG_BADGE_COLORS[node.nag];
        ctx.fillStyle = badge.bg;
        ctx.beginPath();
        ctx.arc(sx + SQ_SIZE - 14, sy + 14, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = badge.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.nag, sx + SQ_SIZE - 14, sy + 18);
      }
    }
  }
  ctx.restore();

  drawPlayerBar(bottomName, topIsWhite ? 'black' : 'white', BOARD_Y + BOARD_SIZE + 16);

  // Move caption & comments bar
  const footerY = BOARD_Y + BOARD_SIZE + 62;
  ctx.fillStyle = '#0f172a';
  drawRoundedRect(ctx, BOARD_X, footerY, BOARD_SIZE, 48, 12);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  const movePrefix =
    node.id === 'root'
      ? 'Inicio'
      : `${Math.max(1, node.turnNumber)}${node.faction === 'white' ? '. ' : '... '}${node.san}${node.nag || ''}`;

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(movePrefix, BOARD_X + 16, footerY + 30);

  const note = [node.comment, node.userComment].filter(Boolean).join(' · ');
  if (note) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(note.slice(0, 46), BOARD_X + BOARD_SIZE - 16, footerY + 30);
  }

  if (isFinalFrame && opts.result !== '*') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    drawRoundedRect(ctx, WIDTH / 2 - 120, BOARD_Y + BOARD_SIZE / 2 - 34, 240, 68, 16);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.result, WIDTH / 2, BOARD_Y + BOARD_SIZE / 2 + 10);
  }
}

export async function exportReplayToMp4(opts: VideoExportOptions): Promise<Blob> {
  const baseImages = await loadBaseImages();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const nodes = opts.nodes.length > 0 ? opts.nodes : [];
  const msPerMove = opts.msPerMove ?? 800;

  // Primary path: WebCodecs VideoEncoder + mp4-muxer (fast offline H.264 MP4 generation)
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    const codecCandidates = ['avc1.42001f', 'avc1.4d001f', 'avc1.64001f'];
    let supportedCodec: string | null = null;
    for (const c of codecCandidates) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec: c,
          width: WIDTH,
          height: HEIGHT,
          bitrate: 2_200_000,
          framerate: 30,
        });
        if (res.supported) {
          supportedCodec = c;
          break;
        }
      } catch {
        // try next codec profile
      }
    }

    if (supportedCodec) {
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width: WIDTH,
          height: HEIGHT,
        },
        fastStart: 'in-memory',
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => console.error('VideoEncoder error:', err),
      });

      encoder.configure({
        codec: supportedCodec,
        width: WIDTH,
        height: HEIGHT,
        bitrate: 2_200_000,
        framerate: 30,
      });

      const fps = 30;
      const frameDurationUs = Math.round(1_000_000 / fps);
      let frameIndex = 0;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const holdMs = i === 0 ? 500 : isLast ? 1500 : msPerMove;
        const frameCount = Math.max(4, Math.round((holdMs / 1000) * fps));

        renderReplayFrame(ctx, node, opts, baseImages, isLast);

        for (let f = 0; f < frameCount; f++) {
          const timestampUs = frameIndex * frameDurationUs;
          const vf = new VideoFrame(canvas, {
            timestamp: timestampUs,
            duration: frameDurationUs,
          });
          encoder.encode(vf, { keyFrame: f === 0 || frameIndex % 30 === 0 });
          vf.close();
          frameIndex++;
        }

        if (opts.onProgress) {
          opts.onProgress(Math.round(((i + 1) / nodes.length) * 90));
        }
        // Yield to UI thread so progress updates paint smoothly
        await new Promise((r) => setTimeout(r, 0));
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();
      if (opts.onProgress) opts.onProgress(100);

      return new Blob([target.buffer], { type: 'video/mp4' });
    }
  }

  // Fallback path: MediaRecorder captureStream (e.g. Safari/older browsers without WebCodecs)
  const mimeCandidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const supportedMime =
    typeof MediaRecorder !== 'undefined'
      ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
      : '';

  if (!supportedMime || typeof canvas.captureStream !== 'function') {
    throw new Error('MP4 encoding is not supported in this browser');
  }

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: supportedMime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm' }));
    };
  });

  recorder.start();
  for (let i = 0; i < nodes.length; i++) {
    const isLast = i === nodes.length - 1;
    renderReplayFrame(ctx, nodes[i], opts, baseImages, isLast);
    if (opts.onProgress) {
      opts.onProgress(Math.round(((i + 1) / nodes.length) * 95));
    }
    const holdMs = i === 0 ? 450 : isLast ? 1300 : Math.min(700, msPerMove);
    await new Promise((r) => setTimeout(r, holdMs));
  }
  recorder.stop();
  const blob = await done;
  if (opts.onProgress) opts.onProgress(100);
  return blob;
}

export function triggerVideoDownload(blob: Blob, filename?: string): void {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = filename ?? `unochess-partida-${stamp}.${ext}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
