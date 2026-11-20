import * as THREE from 'three';
import {
  CURB_SEGMENTS,
  GUIDE_MARKERS,
  S_COURSE_GEOMETRY,
  T_COURSE_LAYOUT,
} from '../sim/courseData';
import type { CourseId } from '../sim/types';
import {
  createAsphaltTextures,
  createConfirmPadTexture,
  createCurbHazardTexture,
  createGrassTexture,
  createPavementLabelTexture,
  createSignTexture,
} from './proceduralTextures';

export interface PracticeGroundWorld {
  root: THREE.Group;
  flashCurb: (segmentId: string) => void;
  setParkingConfirmed: (confirmed: boolean) => void;
  setGuidesVisible: (visible: boolean) => void;
  setActiveCourseHighlight: (courseId: CourseId) => void;
  updateEffects: (dt: number) => void;
  dispose: () => void;
}

export function buildPracticeGroundWorld(
  maxAnisotropy: number,
  castShadow: boolean
): PracticeGroundWorld {
  const root = new THREE.Group();
  root.name = 'KoreanDrivingTestGround';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // 1. Expansive outdoor suburban grass terrain (prevents empty void)
  const grassTex = trackTex(createGrassTexture(maxAnisotropy));
  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grassTex,
      roughness: 0.94,
      metalness: 0.0,
    })
  );
  const terrain = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(340, 340)), grassMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.06;
  terrain.receiveShadow = true;
  root.add(terrain);

  // Low rolling distant Korean foothills along the perimeter horizon
  const hillMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c7758,
      roughness: 0.96,
      metalness: 0.0,
    })
  );
  const hillSpecs: [number, number, number, number][] = [
    [-85, -88, 52, 16],
    [0, -104, 66, 21],
    [82, -92, 54, 17],
    [108, -10, 56, 15],
    [-108, 6, 56, 14],
    [70, 96, 58, 13],
    [-68, 98, 58, 12],
  ];
  const hillGeo = trackGeo(new THREE.ConeGeometry(1, 1, 9));
  for (const [hx, hz, hr, hh] of hillSpecs) {
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(hr, hh, hr * 0.72);
    hill.position.set(hx, hh * 0.42 - 0.5, hz);
    root.add(hill);
  }

  // 2. Concrete perimeter apron + Main Paved Asphalt Test Yard (84m x 68m)
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb9bec5,
      roughness: 0.86,
      metalness: 0.02,
    })
  );
  const apron = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(90, 74)), concreteMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  root.add(apron);

  const asphaltTextures = createAsphaltTextures(maxAnisotropy);
  trackTex(asphaltTextures.map);
  trackTex(asphaltTextures.bumpMap);
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTextures.map,
      bumpMap: asphaltTextures.bumpMap,
      bumpScale: 0.035,
      roughness: 0.84,
      metalness: 0.04,
    })
  );
  const asphaltPad = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(84, 68)), asphaltMat);
  asphaltPad.rotation.x = -Math.PI / 2;
  asphaltPad.position.y = 0.0;
  asphaltPad.receiveShadow = true;
  root.add(asphaltPad);

  // Helper for painted road markings (y = 0.018 + polygonOffset -> zero Z-fighting)
  const makeLineMat = (hex: number, opacity = 0.94) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.72,
        metalness: 0.02,
        transparent: opacity < 1,
        opacity,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );

  const whitePaintMat = makeLineMat(0xf1f5f9);
  const yellowPaintMat = makeLineMat(0xf4c414);
  const blueHighlightMat = makeLineMat(0x2563eb, 0.22);

  const addStripe = (
    x: number,
    z: number,
    w: number,
    l: number,
    mat: THREE.Material,
    rotY = 0,
    y = 0.018
  ) => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w, l)), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotY;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // 3. T-Course Pavement Markings & Confirmation Pad
  const t = T_COURSE_LAYOUT;
  // Subtle blue-tinted course surface highlight inside T-course corridor & bay
  addStripe(-18.0, (t.corridorStartZ + t.corridorEndZ) * 0.5, 4.6, t.corridorStartZ - t.corridorEndZ, blueHighlightMat, 0, 0.012);
  addStripe((t.corridorRightX + t.bayBackX) * 0.5, 0, t.bayBackX - t.corridorRightX, t.bayMaxZ - t.bayMinZ, blueHighlightMat, 0, 0.012);

  // Start & Exit white stop bars for T-course
  addStripe(t.entryGate.x, t.entryGate.z, 4.5, 0.36, whitePaintMat);
  addStripe(t.exitGate.x, t.exitGate.z, 4.5, 0.36, whitePaintMat);

  // T-Course Confirmation Pad at rear of parking bay ("주차 확인선")
  const confirmTex = trackTex(createConfirmPadTexture(maxAnisotropy));
  const confirmPadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: confirmTex,
      emissive: 0x059669,
      emissiveIntensity: 0.0,
      roughness: 0.65,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const confirmPad = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.75, 2.75)), confirmPadMat);
  confirmPad.rotation.x = -Math.PI / 2;
  confirmPad.position.set(-10.65, 0.022, 0.0);
  root.add(confirmPad);

  // T-Course Confirmation Sensor Pole behind the bay (Amber -> Emerald Green when confirmed!)
  const poleGroup = new THREE.Group();
  poleGroup.position.set(t.bayBackX + 0.9, 0, 0);
  const metalPoleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.78 })
  );
  const sensorPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 12)), metalPoleMat);
  sensorPole.position.y = 1.3;
  sensorPole.castShadow = castShadow;
  poleGroup.add(sensorPole);

  const housing = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.42, 0.68, 0.34)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 }))
  );
  housing.position.y = 2.55;
  poleGroup.add(housing);

  const confirmBulbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      metalness: 0.1,
    })
  );
  const confirmBulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.16, 14, 14)), confirmBulbMat);
  confirmBulb.position.set(-0.22, 2.55, 0);
  poleGroup.add(confirmBulb);
  root.add(poleGroup);

  // Pavement text labels (Korean)
  const addPavementText = (text: string, x: number, z: number, w: number, h: number, rotZ = 0, color = '#e2e8f0') => {
    const tex = trackTex(createPavementLabelTexture(text, color, maxAnisotropy));
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        roughness: 0.78,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    const mesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(w, h)), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotZ;
    mesh.position.set(x, 0.022, z);
    root.add(mesh);
  };

  addPavementText('T 진입', -18.0, 14.0, 3.6, 1.8, 0, '#f8fafc');
  addPavementText('T 출구 ↑', -18.0, -10.8, 3.6, 1.8, 0, '#93c5fd');
  addPavementText('S 출발 ↑', 16.0, 15.2, 3.4, 1.7, 0, '#f8fafc');
  const sLast = S_COURSE_GEOMETRY.centerline[S_COURSE_GEOMETRY.centerline.length - 1];
  addPavementText('S 종료', sLast.x, sLast.z + 3.4, 3.4, 1.7, 0, '#86efac');
  addPavementText('연결로 · 20km/h 이하', -1.0, -22.5, 9.5, 2.4, 0, '#fde047');

  // 4. S-Course Centerline Dashes, Start/Finish Stop Lines & Lane Surface Tint
  const sPts = S_COURSE_GEOMETRY.centerline;
  for (let i = 0; i < sPts.length - 1; i++) {
    const a = sPts[i];
    const b = sPts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const angle = Math.atan2(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    addStripe(mx, mz, 3.9, segLen + 0.16, blueHighlightMat, angle, 0.012);
    if (i % 2 === 0) {
      addStripe(mx, mz, 0.14, segLen * 0.65, whitePaintMat, angle, 0.018);
    }
  }
  addStripe(S_COURSE_GEOMETRY.southStartGate.x, S_COURSE_GEOMETRY.southStartGate.z, 3.9, 0.36, whitePaintMat);
  addStripe(S_COURSE_GEOMETRY.northEndGate.x, S_COURSE_GEOMETRY.northEndGate.z, 3.9, 0.36, whitePaintMat);

  // North Connector Road Markings (connecting T exit (-18, -15.5) to S north entry (+16, -21.5))
  for (let x = -14; x <= 12; x += 4.2) {
    addStripe(x, -22.5, 2.2, 0.16, yellowPaintMat, 0, 0.018);
  }
  addStripe(-1.0, -25.4, 38, 0.18, whitePaintMat, 0, 0.018);
  addStripe(-1.0, -19.6, 30, 0.18, whitePaintMat, 0, 0.018);

  // 5. Raised Yellow-Black Hazard Concrete Curbs (검지선 연석) with per-segment hit flash!
  const curbHazardTex = trackTex(createCurbHazardTexture(maxAnisotropy));
  const curbFlashMap = new Map<string, { mat: THREE.MeshStandardMaterial; timer: number }>();

  for (const seg of CURB_SEGMENTS) {
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;

    const texClone = trackTex(curbHazardTex.clone());
    texClone.needsUpdate = true;
    texClone.repeat.set(Math.max(1, len / 1.2), 1);

    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: texClone,
        emissive: 0xef4444,
        emissiveIntensity: 0.0,
        roughness: 0.72,
        metalness: 0.04,
      })
    );
    curbFlashMap.set(seg.id, { mat, timer: 0 });

    const segExtend = seg.course === 's-course' ? 0.12 : 0.04;
    const curbGeo = trackGeo(new THREE.BoxGeometry(len + segExtend, 0.17, 0.24));
    const curbMesh = new THREE.Mesh(curbGeo, mat);
    curbMesh.position.set((seg.ax + seg.bx) * 0.5, 0.085, (seg.az + seg.bz) * 0.5);
    curbMesh.rotation.y = -Math.atan2(dz, dx);
    curbMesh.castShadow = castShadow;
    curbMesh.receiveShadow = true;
    root.add(curbMesh);

    // Painted yellow sensor line hugging the base of the curb cleanly without corner protrusion
    const sensorStrip = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(len + segExtend * 0.5, 0.3)), yellowPaintMat);
    sensorStrip.rotation.x = -Math.PI / 2;
    sensorStrip.rotation.z = -Math.atan2(dz, dx);
    sensorStrip.position.set((seg.ax + seg.bx) * 0.5, 0.015, (seg.az + seg.bz) * 0.5);
    root.add(sensorStrip);
  }

  // 6. Corner Rubber Cones (라바콘) & Hazard Bollards at key turning apexes
  const coneOrangeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.48, metalness: 0.05 }));
  const coneWhiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.05 }));
  const coneBaseMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.02 }));
  const coneBaseGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.05, 0.36));
  const coneBodyGeo = trackGeo(new THREE.ConeGeometry(0.14, 0.62, 12));
  const coneCollarGeo = trackGeo(new THREE.CylinderGeometry(0.082, 0.105, 0.14, 12));

  const coneCoords: [number, number][] = [
    [t.corridorRightX + 0.12, t.bayMaxZ + 0.12],
    [t.corridorRightX + 0.12, t.bayMinZ - 0.12],
    [t.bayBackX + 0.12, t.bayMaxZ + 0.12],
    [t.bayBackX + 0.12, t.bayMinZ - 0.12],
    [t.corridorLeftX - 0.14, t.bayMaxZ],
    [t.corridorLeftX - 0.14, t.bayMinZ],
    [t.corridorLeftX - 0.14, -5.8],
    [S_COURSE_GEOMETRY.leftEdge[0].x - 0.2, S_COURSE_GEOMETRY.leftEdge[0].z],
    [S_COURSE_GEOMETRY.rightEdge[0].x + 0.2, S_COURSE_GEOMETRY.rightEdge[0].z],
    [S_COURSE_GEOMETRY.leftEdge[16].x, S_COURSE_GEOMETRY.leftEdge[16].z],
    [S_COURSE_GEOMETRY.rightEdge[28].x, S_COURSE_GEOMETRY.rightEdge[28].z],
    [S_COURSE_GEOMETRY.leftEdge[S_COURSE_GEOMETRY.leftEdge.length - 1].x - 0.2, S_COURSE_GEOMETRY.leftEdge[S_COURSE_GEOMETRY.leftEdge.length - 1].z],
    [S_COURSE_GEOMETRY.rightEdge[S_COURSE_GEOMETRY.rightEdge.length - 1].x + 0.2, S_COURSE_GEOMETRY.rightEdge[S_COURSE_GEOMETRY.rightEdge.length - 1].z],
  ];

  for (const [cx, cz] of coneCoords) {
    const cone = new THREE.Group();
    cone.position.set(cx, 0, cz);
    const base = new THREE.Mesh(coneBaseGeo, coneBaseMat);
    base.position.y = 0.025;
    const body = new THREE.Mesh(coneBodyGeo, coneOrangeMat);
    body.position.y = 0.34;
    body.castShadow = castShadow;
    const collar = new THREE.Mesh(coneCollarGeo, coneWhiteMat);
    collar.position.y = 0.42;
    cone.add(base, body, collar);
    root.add(cone);
  }

  // 7. Overhead Course Sign Gantries (T코스 & S코스) — crossbeam above board so text is 100% clear
  const buildGantry = (x: number, z: number, span: number, title: string, subtitle: string, accent: string) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const postGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 5.15, 10));
    const postL = new THREE.Mesh(postGeo, metalPoleMat);
    postL.position.set(-span * 0.5, 2.575, 0);
    postL.castShadow = castShadow;
    const postR = new THREE.Mesh(postGeo, metalPoleMat);
    postR.position.set(span * 0.5, 2.575, 0);
    postR.castShadow = castShadow;

    // Crossbeam sits cleanly ABOVE the hanging signboard
    const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(span + 0.4, 0.18, 0.18)), metalPoleMat);
    beam.position.set(0, 5.05, 0);

    // Twin short vertical hanger brackets connecting beam to signboard top
    const hangerGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.32, 0.08));
    const hangerL = new THREE.Mesh(hangerGeo, metalPoleMat);
    hangerL.position.set(-1.35, 4.85, 0);
    const hangerR = new THREE.Mesh(hangerGeo, metalPoleMat);
    hangerR.position.set(1.35, 4.85, 0);

    const signTex = trackTex(createSignTexture(title, subtitle, '#132033', accent, maxAnisotropy));
    const signMat = trackMat(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, metalness: 0.1 }));
    const backMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.2 }));
    const board = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.1, 1.12, 0.12)), [
      backMat, backMat, backMat, backMat, signMat, signMat,
    ]);
    board.position.set(0, 4.18, 0);
    board.castShadow = castShadow;

    g.add(postL, postR, beam, hangerL, hangerR, board);
    root.add(g);
  };

  buildGantry(-18.0, 12.0, 5.8, 'T코스 · 직각주차', '제한시간 2분 · 확인선 정지', '#f59e0b');
  buildGantry(16.0, 14.5, 5.2, 'S코스 · 굴절곡선', '검지선 접촉 주의 · 20km/h 이하', '#38bdf8');

  // 8. Landmark Architecture: Korean Driving Test Center Control Tower & Management Building (North-Center)
  const buildControlTower = () => {
    const bldg = new THREE.Group();
    bldg.position.set(-1.5, 0, -32.0);

    const wallMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.76, metalness: 0.04 }));
    const slateMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.15 }));
    const blueGlassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.14, metalness: 0.62 })
    );
    const roofTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45, metalness: 0.18 }));

    // Plinth & 2-story main block
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20, 0.5, 9.2)), concreteMat);
    plinth.position.y = 0.25;
    plinth.receiveShadow = true;

    const mainBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.6, 6.4, 7.6)), wallMat);
    mainBody.position.y = 3.7;
    mainBody.castShadow = castShadow;
    mainBody.receiveShadow = true;

    // Ground & 2nd floor blue window ribbons
    const glassFloor1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16.2, 2.0, 7.72)), blueGlassMat);
    glassFloor1.position.y = 2.1;
    const glassFloor2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16.2, 1.9, 7.72)), blueGlassMat);
    glassFloor2.position.y = 5.0;

    // Roof overhang & blue institutional band
    const roofSlab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.6, 0.45, 8.8)), slateMat);
    roofSlab.position.y = 7.1;
    const accentBand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.65, 0.35, 8.85)), roofTrimMat);
    accentBand.position.y = 7.45;

    // 3rd-story Control Observation Deck (iconic driving test tower overlooking the yard!)
    const towerBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.8, 3.2, 5.4)), slateMat);
    towerBase.position.set(0, 9.1, 0.3);
    towerBase.castShadow = castShadow;

    const towerGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.0, 2.1, 5.55)), blueGlassMat);
    towerGlass.position.set(0, 9.35, 0.3);

    const towerRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.2, 0.35, 6.4)), wallMat);
    towerRoof.position.set(0, 10.9, 0.3);

    // Rooftop antenna mast
    const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8)), metalPoleMat);
    mast.position.set(2.8, 12.5, 0.2);

    // Entrance canopy + Korean facility signboard ("운전면허 기능시험장")
    const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 0.22, 2.6)), slateMat);
    canopy.position.set(0, 3.3, 5.0);

    const facadeSignTex = trackTex(
      createSignTexture('운전면허 기능시험장', 'KOREA DRIVING TEST · T / S COURSE', '#0f2547', '#f59e0b', maxAnisotropy)
    );
    const facadeSignMat = trackMat(new THREE.MeshStandardMaterial({ map: facadeSignTex, roughness: 0.38, metalness: 0.08 }));
    const facadeBacking = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 2.15, 0.18)), slateMat);
    facadeBacking.position.set(0, 7.65, 4.48);
    const facadeSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(10.4, 1.92)), facadeSignMat);
    facadeSign.position.set(0, 7.65, 4.59);

    bldg.add(
      plinth,
      mainBody,
      glassFloor1,
      glassFloor2,
      roofSlab,
      accentBand,
      towerBase,
      towerGlass,
      towerRoof,
      mast,
      canopy,
      facadeBacking,
      facadeSign
    );
    root.add(bldg);
  };
  buildControlTower();

  // 9. Student Waiting Shelter Pavilion (South-Center)
  const buildWaitingPavilion = () => {
    const pav = new THREE.Group();
    pav.position.set(-1.5, 0, 27.5);
    const roof = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(10.5, 0.22, 4.2)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.45, metalness: 0.35 }))
    );
    roof.position.y = 3.1;
    roof.castShadow = castShadow;

    const colGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 8));
    for (const cx of [-4.6, 0, 4.6]) {
      for (const cz of [-1.5, 1.5]) {
        const col = new THREE.Mesh(colGeo, metalPoleMat);
        col.position.set(cx, 1.55, cz);
        pav.add(col);
      }
    }

    const benchMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.78, metalness: 0.02 }));
    const bench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.14, 0.65)), benchMat);
    bench.position.set(0, 0.5, 0);
    pav.add(roof, bench);
    root.add(pav);
  };
  buildWaitingPavilion();

  // 10. Perimeter Guardrail Fence & Instanced Korean Zelkova Trees
  const fenceRailMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.45, metalness: 0.55 }));
  const fenceBorders: [number, number, number, number][] = [
    [0, 34.5, 86, 0.12],
    [-42.5, 0, 0.12, 69],
    [42.5, 0, 0.12, 69],
    [-27, -34.5, 31, 0.12],
    [25, -34.5, 35, 0.12],
  ];
  for (const [fx, fz, fw, fl] of fenceBorders) {
    const railTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(fw, 0.1, fl)), fenceRailMat);
    railTop.position.set(fx, 1.05, fz);
    const railMid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(fw, 0.08, fl)), fenceRailMat);
    railMid.position.set(fx, 0.55, fz);
    root.add(railTop, railMid);
  }

  // Instanced Perimeter Trees (2-part InstancedMesh: trunks + leafy canopies with ±15% scale & tint)
  const treeCoords: [number, number][] = [];
  for (let x = -46; x <= 46; x += 8.5) {
    if (Math.abs(x + 1.5) > 13) treeCoords.push([x, -39.5]);
    treeCoords.push([x, 39.5]);
  }
  for (let z = -34; z <= 34; z += 8.5) {
    treeCoords.push([-47.5, z]);
    treeCoords.push([47.5, z]);
  }

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.28, 2.5, 7));
  trunkGeo.translate(0, 1.25, 0);
  const canopyLowerGeo = trackGeo(new THREE.DodecahedronGeometry(1.75, 1));
  canopyLowerGeo.scale(1.12, 0.78, 1.08);
  canopyLowerGeo.translate(0, 3.35, 0);
  const canopyUpperGeo = trackGeo(new THREE.DodecahedronGeometry(1.22, 1));
  canopyUpperGeo.scale(1.0, 0.88, 1.0);
  canopyUpperGeo.translate(0.32, 4.45, -0.2);

  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.9, metalness: 0.0 }));
  const canopyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.0 }));
  const canopyUpperMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 }));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
  const canopyInst = new THREE.InstancedMesh(canopyLowerGeo, canopyMat, treeCoords.length);
  const canopyTopInst = new THREE.InstancedMesh(canopyUpperGeo, canopyUpperMat, treeCoords.length);
  canopyInst.castShadow = castShadow;
  canopyInst.receiveShadow = true;
  canopyTopInst.castShadow = castShadow;

  const dummy = new THREE.Object3D();
  const colorTmp = new THREE.Color();
  const greens = [0x42683b, 0x4f7843, 0x395c35, 0x5c8049];
  const greensTop = [0x58824c, 0x679156, 0x4c7344, 0x71975b];
  treeCoords.forEach(([tx, tz], idx) => {
    const s = 0.85 + ((idx * 37) % 30) / 100; // ±15% deterministic variation
    dummy.position.set(tx, 0, tz);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.scale.set(s, s * (0.95 + ((idx * 17) % 15) / 100), s);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
    canopyInst.setMatrixAt(idx, dummy.matrix);
    canopyTopInst.setMatrixAt(idx, dummy.matrix);
    colorTmp.setHex(greens[idx % greens.length]);
    canopyInst.setColorAt(idx, colorTmp);
    colorTmp.setHex(greensTop[idx % greensTop.length]);
    canopyTopInst.setColorAt(idx, colorTmp);
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInst.instanceMatrix.needsUpdate = true;
  canopyTopInst.instanceMatrix.needsUpdate = true;
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  if (canopyTopInst.instanceColor) canopyTopInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  canopyTopInst.computeBoundingSphere();
  root.add(trunkInst, canopyInst, canopyTopInst);

  // 11. Toggleable Korean Driving-School Reference Guide Strips (어깨선 / 핸들 1.5바퀴 지점)
  const guideGroup = new THREE.Group();
  guideGroup.name = 'DrivingSchoolGuides';
  for (const gm of GUIDE_MARKERS) {
    const gmMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: gm.color,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    const strip = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gm.width, gm.length)), gmMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = gm.rotationY;
    strip.position.set(gm.x, 0.028, gm.z);
    guideGroup.add(strip);
  }
  root.add(guideGroup);

  const flashCurb = (segmentId: string) => {
    const entry = curbFlashMap.get(segmentId);
    if (!entry) return;
    entry.timer = 1.4;
    entry.mat.emissiveIntensity = 1.8;
  };

  const setParkingConfirmed = (confirmed: boolean) => {
    if (confirmed) {
      confirmBulbMat.color.setHex(0x10b981);
      confirmBulbMat.emissive.setHex(0x10b981);
      confirmBulbMat.emissiveIntensity = 2.0;
      confirmPadMat.emissiveIntensity = 0.55;
    } else {
      confirmBulbMat.color.setHex(0xf59e0b);
      confirmBulbMat.emissive.setHex(0xf59e0b);
      confirmBulbMat.emissiveIntensity = 1.35;
      confirmPadMat.emissiveIntensity = 0.0;
    }
  };

  const setGuidesVisible = (visible: boolean) => {
    guideGroup.visible = visible;
  };

  const setActiveCourseHighlight = (_courseId: CourseId) => {
    // Both courses remain physically visible in the real practice yard; reset curb flashes on switch
    curbFlashMap.forEach((entry) => {
      entry.timer = 0;
      entry.mat.emissiveIntensity = 0;
    });
  };

  const updateEffects = (dt: number) => {
    curbFlashMap.forEach((entry) => {
      if (entry.timer > 0) {
        entry.timer = Math.max(0, entry.timer - dt);
        entry.mat.emissiveIntensity = entry.timer > 0 ? 0.6 + Math.sin(entry.timer * 18) * 0.6 + 0.6 : 0;
      }
    });
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return {
    root,
    flashCurb,
    setParkingConfirmed,
    setGuidesVisible,
    setActiveCourseHighlight,
    updateEffects,
    dispose,
  };
}
