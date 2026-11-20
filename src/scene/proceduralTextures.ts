import * as THREE from 'three';

function createDeterministicRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createAsphaltTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#363b42';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const rand = createDeterministicRng(20261119);
  for (let i = 0; i < 16000; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const w = 1 + Math.floor(rand() * 3);
    const v = 42 + Math.floor(rand() * 34);
    cCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    cCtx.fillRect(x, y, w, w);

    const bv = 90 + Math.floor(rand() * 85);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, w, w);
  }

  // Subtle aggregate flecks
  for (let i = 0; i < 1800; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    cCtx.fillStyle = rand() > 0.5 ? 'rgba(180,188,198,0.16)' : 'rgba(18,20,24,0.22)';
    cCtx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 14);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(16, 14);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

export function createGrassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#567448';
  ctx.fillRect(0, 0, size, size);

  const rand = createDeterministicRng(88412);
  for (let i = 0; i < 6500; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const g = 96 + Math.floor(rand() * 38);
    const r = Math.floor(g * 0.72);
    const b = Math.floor(g * 0.55);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, 2, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCurbHazardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Korean driving test yellow & dark-charcoal alternating curb blocks
  ctx.fillStyle = '#f2be1a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#1e232a';
  ctx.fillRect(128, 0, 128, 64);

  // Subtle top concrete wear line
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, 0, 256, 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createConfirmPadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark asphalt base with vibrant blue-teal confirmation box
  ctx.fillStyle = '#243447';
  ctx.fillRect(0, 0, 512, 512);

  // Outer yellow sensor border
  ctx.strokeStyle = '#f5c418';
  ctx.lineWidth = 22;
  ctx.strokeRect(14, 14, 484, 484);

  // Inner white dashed box
  ctx.strokeStyle = '#e8f1fa';
  ctx.lineWidth = 8;
  ctx.setLineDash([24, 16]);
  ctx.strokeRect(46, 46, 420, 420);
  ctx.setLineDash([]);

  // Checkered rear sensor strip along the right (back of bay)
  const stripX = 360;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#38bdf8';
      ctx.fillRect(stripX + col * 42, 64 + row * 48, 42, 48);
    }
  }

  // Korean text rotated so readable along the bay
  ctx.save();
  ctx.translate(205, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 54px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('주차 확인선', 0, -28);
  ctx.fillStyle = '#fde047';
  ctx.font = '700 32px Pretendard, sans-serif';
  ctx.fillText('P 또는 주차브레이크', 0, 34);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createSignTexture(
  title: string,
  subtitle: string,
  bgColor: string,
  accentColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 160);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 512, 16);
  ctx.fillRect(0, 144, 512, 16);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 42px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 64, 468);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 20px Pretendard, sans-serif';
  ctx.fillText(subtitle, 256, 114, 468);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPavementLabelTexture(
  text: string,
  color: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 256);

  ctx.fillStyle = color;
  ctx.font = '800 84px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createLicensePlateTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 64);

  // Blue KOR left bar (modern Korean license plate)
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KOR', 16, 48);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 60);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 32px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('34가 8204', 144, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createRoofSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 88);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 36px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('기능시험', 128, 36);
  ctx.fillStyle = '#1e3a8a';
  ctx.font = '800 20px Pretendard, sans-serif';
  ctx.fillText('도로주행 연습차량', 128, 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.14, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(10, 14, 20, 0.65)');
  grad.addColorStop(0.65, 'rgba(10, 14, 20, 0.34)');
  grad.addColorStop(1, 'rgba(10, 14, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
