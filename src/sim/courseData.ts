import type { CourseId, CourseMetadata, CurbSegment, GateLine, GuideMarker, RectZone, Vec2 } from './types';

/**
 * Korean Driver's License Functional Test Practice Ground (한국 운전면허 장내기능시험장)
 *
 * Unified 80m x 64m paved test yard:
 * - West sector (x in [-22, -7], z in [-16, +18]): T-Course (직각주차, rotated-T '├' geometry)
 * - East sector (x in [+10, +32], z in [-22, +22]): S-Course (굴절/곡선코스, C1-continuous 3-arc S-curve)
 * - North connector road (z ~ -22): Links T-course exit to S-course north entry for Combined Test
 */

export const T_COURSE_LAYOUT = {
  corridorLeftX: -20.4,
  corridorRightX: -15.6, // 4.8m wide main corridor
  corridorStartZ: 17.0,
  corridorEndZ: -15.5,
  bayMinZ: -1.5,
  bayMaxZ: 1.5,          // 3.0m wide parking bay (1.78m car -> 0.61m margin per side)
  bayBackX: -9.2,        // 6.4m deep from -15.6 to -9.2
  // Confirmation zone at the rear of the T-bay (rear axle / tires must enter, all 4 wheels inside bay)
  bayInnerZone: {
    id: 't-bay-inner',
    minX: -15.5,
    maxX: -9.2,
    minZ: -1.5,
    maxZ: 1.5,
  } satisfies RectZone,
  confirmLineZone: {
    id: 't-confirm-line',
    minX: -11.9,
    maxX: -9.3,
    minZ: -1.45,
    maxZ: 1.45,
  } satisfies RectZone,
  entryGate: {
    id: 't-entry',
    x: -18.0,
    z: 11.5,
    halfWidth: 2.3,
    axis: 'x',
    direction: -1,
  } satisfies GateLine,
  exitGate: {
    id: 't-exit',
    x: -18.0,
    z: -13.0,
    halfWidth: 2.3,
    axis: 'x',
    direction: -1,
  } satisfies GateLine,
};

export interface SCurveGeometry {
  centerline: Vec2[];
  leftEdge: Vec2[];
  rightEdge: Vec2[];
  laneHalfWidth: number;
  southStartGate: GateLine;
  northEndGate: GateLine;
}

function buildSCurveGeometry(): SCurveGeometry {
  const R = 7.2;
  const laneHalfWidth = 2.0; // 4.0m total lane width (inner radius 5.2m, outer 9.2m)
  const deg = Math.PI / 180;

  const centerline: Vec2[] = [];
  const leftEdge: Vec2[] = [];
  const rightEdge: Vec2[] = [];

  const pushPoint = (x: number, z: number, tx: number, tz: number) => {
    const len = Math.hypot(tx, tz) || 1;
    const ux = tx / len;
    const uz = tz / len;
    // Facing along (ux, uz): left normal is (uz, -ux), right normal is (-uz, ux)
    // Wait: check at heading North (0, -1): left should be (-1, 0) = (uz, -ux) = (-1, 0)! Right is (+1, 0) = (-uz, ux)!
    const lx = uz;
    const lz = -ux;
    centerline.push({ x, z });
    leftEdge.push({ x: x + lx * laneHalfWidth, z: z + lz * laneHalfWidth });
    rightEdge.push({ x: x - lx * laneHalfWidth, z: z - lz * laneHalfWidth });
  };

  // 1. Entry straight heading North (-Z): x = 16.0, z = +18.5 -> +11.5
  const startX = 16.0;
  const straightStartZ = 18.5;
  const arc1StartZ = 11.5;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pushPoint(startX, straightStartZ + (arc1StartZ - straightStartZ) * t, 0, -1);
  }

  // 2. Arc 1: Turn RIGHT 70 deg (clockwise from above), center at (startX + R, arc1StartZ)
  // Parametric: x = cx + R cos(a), z = cz + R sin(a), a from 180 deg to 250 deg
  const c1x = startX + R;
  const c1z = arc1StartZ;
  const a1Start = 180 * deg;
  const a1End = 250 * deg;
  const seg1 = 12;
  for (let i = 1; i <= seg1; i++) {
    const a = a1Start + ((a1End - a1Start) * i) / seg1;
    pushPoint(c1x + R * Math.cos(a), c1z + R * Math.sin(a), -Math.sin(a), Math.cos(a));
  }

  // 3. Arc 2: Reverse Turn LEFT 140 deg (CCW from above), C1-continuous join!
  // Join point is at a1End on C1; C2 lies on the line from C1 through join point at distance 2R.
  const c2x = c1x + 2 * R * Math.cos(a1End);
  const c2z = c1z + 2 * R * Math.sin(a1End);
  const a2Start = 70 * deg;   // opposite of 250 deg
  const a2End = -70 * deg;    // 140 deg sweep decreasing a -> tangent (+sin(a), -cos(a))
  const seg2 = 22;
  for (let i = 1; i <= seg2; i++) {
    const a = a2Start + ((a2End - a2Start) * i) / seg2;
    pushPoint(c2x + R * Math.cos(a), c2z + R * Math.sin(a), Math.sin(a), -Math.cos(a));
  }

  // 4. Arc 3: Turn RIGHT 70 deg back to straight North (-Z)
  const c3x = c2x + 2 * R * Math.cos(a2End);
  const c3z = c2z + 2 * R * Math.sin(a2End);
  const a3Start = 110 * deg;  // opposite of -70 deg
  const a3End = 180 * deg;    // 70 deg sweep increasing a -> tangent (-sin(a), +cos(a))
  const seg3 = 12;
  for (let i = 1; i <= seg3; i++) {
    const a = a3Start + ((a3End - a3Start) * i) / seg3;
    pushPoint(c3x + R * Math.cos(a), c3z + R * Math.sin(a), -Math.sin(a), Math.cos(a));
  }

  // 5. Exit straight heading North (-Z)
  const endPt = centerline[centerline.length - 1];
  const straightEndZ = endPt.z - 6.5;
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    pushPoint(endPt.x, endPt.z + (straightEndZ - endPt.z) * t, 0, -1);
  }

  const lastPt = centerline[centerline.length - 1];

  return {
    centerline,
    leftEdge,
    rightEdge,
    laneHalfWidth,
    southStartGate: {
      id: 's-south-gate',
      x: startX,
      z: straightStartZ - 1.5,
      halfWidth: laneHalfWidth - 0.1,
      axis: 'x',
      direction: -1,
    },
    northEndGate: {
      id: 's-north-gate',
      x: lastPt.x,
      z: lastPt.z + 1.5,
      halfWidth: laneHalfWidth - 0.1,
      axis: 'x',
      direction: -1,
    },
  };
}

export const S_COURSE_GEOMETRY: SCurveGeometry = buildSCurveGeometry();

function buildCurbSegments(): CurbSegment[] {
  const segments: CurbSegment[] = [];
  const t = T_COURSE_LAYOUT;
  const curbRadius = 0.14;

  // T-Course curbs (5 continuous boundary walls forming '├')
  segments.push(
    // Left continuous wall of T-corridor
    {
      id: 't-left-wall',
      course: 't-course',
      ax: t.corridorLeftX,
      az: t.corridorStartZ,
      bx: t.corridorLeftX,
      bz: t.corridorEndZ,
      radius: curbRadius,
    },
    // Right wall south of bay
    {
      id: 't-right-south',
      course: 't-course',
      ax: t.corridorRightX,
      az: t.corridorStartZ,
      bx: t.corridorRightX,
      bz: t.bayMaxZ,
      radius: curbRadius,
    },
    // Right wall north of bay
    {
      id: 't-right-north',
      course: 't-course',
      ax: t.corridorRightX,
      az: t.bayMinZ,
      bx: t.corridorRightX,
      bz: t.corridorEndZ,
      radius: curbRadius,
    },
    // Parking bay south curb
    {
      id: 't-bay-south',
      course: 't-course',
      ax: t.corridorRightX,
      az: t.bayMaxZ,
      bx: t.bayBackX,
      bz: t.bayMaxZ,
      radius: curbRadius,
    },
    // Parking bay north curb
    {
      id: 't-bay-north',
      course: 't-course',
      ax: t.corridorRightX,
      az: t.bayMinZ,
      bx: t.bayBackX,
      bz: t.bayMinZ,
      radius: curbRadius,
    },
    // Parking bay rear curb
    {
      id: 't-bay-back',
      course: 't-course',
      ax: t.bayBackX,
      az: t.bayMaxZ,
      bx: t.bayBackX,
      bz: t.bayMinZ,
      radius: curbRadius,
    }
  );

  // S-Course curbs (left & right polyline edges)
  const { leftEdge, rightEdge } = S_COURSE_GEOMETRY;
  for (let i = 0; i < leftEdge.length - 1; i++) {
    segments.push({
      id: `s-left-${i}`,
      course: 's-course',
      ax: leftEdge[i].x,
      az: leftEdge[i].z,
      bx: leftEdge[i + 1].x,
      bz: leftEdge[i + 1].z,
      radius: curbRadius,
    });
    segments.push({
      id: `s-right-${i}`,
      course: 's-course',
      ax: rightEdge[i].x,
      az: rightEdge[i].z,
      bx: rightEdge[i + 1].x,
      bz: rightEdge[i + 1].z,
      radius: curbRadius,
    });
  }

  return segments;
}

export const CURB_SEGMENTS: CurbSegment[] = buildCurbSegments();

/**
 * Korean driving-school visual reference markers painted on the ground when Guide Mode is ON
 * (어깨 맞춤선, 핸들 1.5바퀴 기준점, 출차 기준선).
 */
export const GUIDE_MARKERS: GuideMarker[] = [
  {
    id: 't-shoulder-guide',
    label: '어깨 맞춤선 · 좌측 핸들 정지',
    x: -18.0,
    z: -4.2,
    width: 4.2,
    length: 0.28,
    rotationY: 0,
    color: '#38bdf8',
  },
  {
    id: 't-reverse-turn-guide',
    label: '후진 우측 1.5바퀴 시작',
    x: -18.0,
    z: -5.8,
    width: 4.2,
    length: 0.24,
    rotationY: 0,
    color: '#f59e0b',
  },
  {
    id: 't-exit-shoulder-guide',
    label: '출차 어깨선 · 우측 1.5바퀴',
    x: -15.2,
    z: 0.0,
    width: 0.26,
    length: 2.7,
    rotationY: 0,
    color: '#10b981',
  },
];

export const COURSES: Record<CourseId, CourseMetadata> = {
  't-course': {
    id: 't-course',
    title: 'T코스 · 직각주차',
    shortTitle: 'T코스',
    subtitle: '진입 → 후진 주차 → 확인선 정지(P/사이드) → 출차 (제한 2분)',
    spawn: { x: -18.0, z: 16.0, yaw: 0 },
    targetDesc: '우측 주차칸에 후진 진입 후 P기어 또는 주차브레이크로 확인음을 듣고 출차하세요.',
  },
  's-course': {
    id: 's-course',
    title: 'S코스 · 굴절곡선',
    shortTitle: 'S코스',
    subtitle: '연속 S자 곡선 구간 내륜차 제어 및 검지선 무접촉 통과',
    spawn: { x: 16.0, z: 18.0, yaw: 0 },
    targetDesc: '전륜·후륜이 노란색 검지선에 닿지 않도록 S자 곡선을 완주하세요.',
  },
  combined: {
    id: 'combined',
    title: '종합 기능코스 · T+S 연속',
    shortTitle: '종합코스',
    subtitle: 'T코스 직각주차 완료 후 북측 연결로(20km/h 이하)를 거쳐 S코스 완주',
    spawn: { x: -18.0, z: 16.0, yaw: 0 },
    targetDesc: 'T코스 직각주차를 통과한 뒤 북측 연결로를 따라 S코스까지 연속 완주하세요.',
  },
};

export const COURSE_LIST: CourseMetadata[] = [
  COURSES['t-course'],
  COURSES['s-course'],
  COURSES.combined,
];
