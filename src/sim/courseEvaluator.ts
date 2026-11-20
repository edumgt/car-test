import { COURSES, CURB_SEGMENTS, S_COURSE_GEOMETRY, T_COURSE_LAYOUT } from './courseData';
import type { CourseId, CourseRunState, CurbSegment, RectZone, Vec2, VehicleState } from './types';
import { getWheelPositions, VEHICLE_SPEC } from './vehiclePhysics';

export const PASS_SCORE = 80;
export const T_COURSE_LIMIT_SEC = 120;
export const PARK_CONFIRM_HOLD_SEC = 1.0;
export const CURB_HIT_COOLDOWN_SEC = 2.0;
export const SPEED_HIT_COOLDOWN_SEC = 3.0;
export const WHEEL_SENSOR_RADIUS = 0.16;

export interface EvalEvents {
  curbHitSegmentId: string | null;
  parkConfirmedNow: boolean;
  speedWarningNow: boolean;
  courseFinishedNow: boolean;
  passed: boolean;
}

export function createCourseRunState(courseId: CourseId): CourseRunState {
  return {
    courseId,
    score: 100,
    elapsedSec: 0,
    tCourseTimerSec: 0,
    tCourseOvertimePenalized: false,
    tPhase: 'approach',
    parkHoldSec: 0,
    tConfirmed: false,
    sEntered: false,
    sCompleted: false,
    curbHits: 0,
    speedViolations: 0,
    lastCurbHitTime: -99,
    lastCurbSegmentId: null,
    lastSpeedHitTime: -99,
    deductions: [],
    finished: false,
    passed: false,
    failReason: null,
    toastMessage: `${COURSES[courseId].title} 시작! 안전하게 출발하세요.`,
    toastTone: 'info',
    toastExpirySec: 3.5,
  };
}

export function pointToSegmentDistance(px: number, pz: number, seg: CurbSegment): number {
  const vx = seg.bx - seg.ax;
  const vz = seg.bz - seg.az;
  const wx = px - seg.ax;
  const wz = pz - seg.az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  const cx = seg.ax + vx * t;
  const cz = seg.az + vz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function isPointInRect(p: Vec2, rect: RectZone): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}

export function findCurbContact(
  vehicle: Pick<VehicleState, 'x' | 'z' | 'yaw'>,
  courseId: CourseId
): { hit: CurbSegment | null; minClearance: number } {
  const wheels = getWheelPositions(vehicle);
  let minClearance = Infinity;
  let hit: CurbSegment | null = null;

  for (let s = 0; s < CURB_SEGMENTS.length; s++) {
    const seg = CURB_SEGMENTS[s];
    if (courseId === 't-course' && seg.course !== 't-course') continue;
    if (courseId === 's-course' && seg.course !== 's-course') continue;

    for (let w = 0; w < 4; w++) {
      const dist = pointToSegmentDistance(wheels[w].x, wheels[w].z, seg);
      const clearance = dist - (seg.radius + WHEEL_SENSOR_RADIUS);
      if (clearance < minClearance) {
        minClearance = clearance;
        if (clearance <= 0) {
          hit = seg;
        }
      }
    }
  }

  return { hit, minClearance: Math.max(0, minClearance) };
}

function addDeduction(
  run: CourseRunState,
  reason: string,
  points: number,
  toastTone: 'warn' | 'danger' = 'danger'
): void {
  run.score = Math.max(0, run.score - points);
  run.deductions.push({
    id: `ded-${run.deductions.length + 1}`,
    timeSec: run.elapsedSec,
    reason,
    points,
  });
  run.toastMessage = `${reason} (-${points}점)`;
  run.toastTone = toastTone;
  run.toastExpirySec = run.elapsedSec + 2.6;
}

export function getObjectiveSummary(run: CourseRunState): {
  text: string;
  stepIndex: number;
  stepTotal: number;
} {
  if (run.courseId === 't-course') {
    switch (run.tPhase) {
      case 'approach':
        return { text: '1단계 · T코스 진입 후 우측 주차칸으로 후진하세요', stepIndex: 1, stepTotal: 4 };
      case 'park-inside':
        return { text: '2단계 · 확인선 정지 후 P기어 또는 주차브레이크(Space) 체결', stepIndex: 2, stepTotal: 4 };
      case 'confirmed':
      case 'exiting':
        return { text: '3단계 · 확인 완료! D기어로 전진해 북쪽 출구로 나가세요', stepIndex: 3, stepTotal: 4 };
      case 'done':
        return { text: '4단계 · T코스 직각주차 완료', stepIndex: 4, stepTotal: 4 };
    }
  }

  if (run.courseId === 's-course') {
    if (run.sCompleted) {
      return { text: '2단계 · S코스 굴절곡선 완주', stepIndex: 2, stepTotal: 2 };
    }
    return {
      text: '1단계 · 노란 검지선 접촉 없이 S자 곡선을 통과하세요',
      stepIndex: 1,
      stepTotal: 2,
    };
  }

  // Combined course: T-course -> North connector -> S-course (North to South)
  if (!run.tConfirmed) {
    if (run.tPhase === 'park-inside') {
      return { text: '1/3 · T코스 확인선 정지 후 P 또는 주차브레이크(Space) 1초 유지', stepIndex: 1, stepTotal: 3 };
    }
    return { text: '1/3 · T코스 직각주차 진입 및 후진 주차', stepIndex: 1, stepTotal: 3 };
  }
  if (run.tPhase !== 'done') {
    return { text: '2/3 · T코스 출차 후 북측 연결로(20km/h 이하)로 S코스 이동', stepIndex: 2, stepTotal: 3 };
  }
  return { text: '3/3 · S코스 굴절곡선 통과 후 남측 종료선 통과', stepIndex: 3, stepTotal: 3 };
}

export function stepCourseEvaluation(
  run: CourseRunState,
  vehicle: VehicleState,
  rawDt: number
): { events: EvalEvents; nearestCurbDist: number } {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  const events: EvalEvents = {
    curbHitSegmentId: null,
    parkConfirmedNow: false,
    speedWarningNow: false,
    courseFinishedNow: false,
    passed: false,
  };

  if (run.finished) {
    return { events, nearestCurbDist: 99 };
  }

  run.elapsedSec += dt;
  if (run.toastMessage && run.elapsedSec >= run.toastExpirySec) {
    run.toastMessage = null;
  }

  // 1. Speed limit check (> 20 km/h)
  const speedKmh = Math.abs(vehicle.speed) * 3.6;
  if (speedKmh > VEHICLE_SPEC.speedLimitKmh + 0.8 && run.elapsedSec - run.lastSpeedHitTime >= SPEED_HIT_COOLDOWN_SEC) {
    run.lastSpeedHitTime = run.elapsedSec;
    run.speedViolations += 1;
    addDeduction(run, '제한속도 20km/h 초과', 5, 'warn');
    events.speedWarningNow = true;
  }

  // 2. Curb sensor check (검지선 접촉)
  const { hit, minClearance } = findCurbContact(vehicle, run.courseId);
  if (hit && run.elapsedSec - run.lastCurbHitTime >= CURB_HIT_COOLDOWN_SEC) {
    run.lastCurbHitTime = run.elapsedSec;
    run.lastCurbSegmentId = hit.id;
    run.curbHits += 1;
    addDeduction(run, '검지선(연석) 접촉', 10, 'danger');
    events.curbHitSegmentId = hit.id;
  }

  // 3. T-Course state machine (used in 't-course' and first half of 'combined')
  if (run.courseId === 't-course' || (run.courseId === 'combined' && run.tPhase !== 'done')) {
    const wheels = getWheelPositions(vehicle);
    const inCorridor =
      vehicle.x >= T_COURSE_LAYOUT.corridorLeftX - 0.5 &&
      vehicle.x <= T_COURSE_LAYOUT.bayBackX + 0.5 &&
      vehicle.z <= T_COURSE_LAYOUT.entryGate.z + 1.0 &&
      vehicle.z >= T_COURSE_LAYOUT.exitGate.z - 1.0;

    if (inCorridor && run.tPhase !== 'done') {
      run.tCourseTimerSec += dt;
      if (run.tCourseTimerSec > T_COURSE_LIMIT_SEC && !run.tCourseOvertimePenalized) {
        run.tCourseOvertimePenalized = true;
        addDeduction(run, '직각주차 제한시간(2분) 초과', 10, 'warn');
      }
    }

    const allWheelsInBay = wheels.every((w) => isPointInRect(w, T_COURSE_LAYOUT.bayInnerZone));
    // Rear wheels (indices 2, 3) on or past confirmation line
    const rearOnConfirm =
      isPointInRect(wheels[2], T_COURSE_LAYOUT.confirmLineZone) &&
      isPointInRect(wheels[3], T_COURSE_LAYOUT.confirmLineZone);

    if (!run.tConfirmed) {
      if (allWheelsInBay && rearOnConfirm) {
        run.tPhase = 'park-inside';
        const isStopped = Math.abs(vehicle.speed) < 0.08;
        const isSecured = vehicle.gear === 'P' || vehicle.handbrake;
        if (isStopped && isSecured) {
          run.parkHoldSec += dt;
          if (run.parkHoldSec >= PARK_CONFIRM_HOLD_SEC) {
            run.tConfirmed = true;
            run.tPhase = 'confirmed';
            run.toastMessage = '확인되었습니다! D기어로 전환해 출차하세요.';
            run.toastTone = 'success';
            run.toastExpirySec = run.elapsedSec + 4.0;
            events.parkConfirmedNow = true;
          }
        } else {
          run.parkHoldSec = Math.max(0, run.parkHoldSec - dt * 1.5);
        }
      } else {
        run.tPhase = 'approach';
        run.parkHoldSec = 0;
      }
    } else if (run.tPhase === 'confirmed' && !allWheelsInBay) {
      run.tPhase = 'exiting';
    }

    // Check exit gate crossing at North end of T-corridor
    const exitGate = T_COURSE_LAYOUT.exitGate;
    const crossedTExit =
      Math.abs(vehicle.x - exitGate.x) <= exitGate.halfWidth + 0.6 &&
      vehicle.z <= exitGate.z;

    if (crossedTExit) {
      if (!run.tConfirmed) {
        addDeduction(run, '직각주차 확인선 미접촉 출차', 10, 'danger');
      }
      run.tPhase = 'done';

      if (run.courseId === 't-course') {
        run.finished = true;
        run.passed = run.score >= PASS_SCORE && run.tConfirmed;
        run.failReason = run.passed
          ? null
          : !run.tConfirmed
            ? '주차 확인선 미완료'
            : `합격 기준(${PASS_SCORE}점) 미달`;
        events.courseFinishedNow = true;
        events.passed = run.passed;
      } else {
        run.toastMessage = 'T코스 통과! 북측 연결로를 따라 S코스로 진입하세요.';
        run.toastTone = 'success';
        run.toastExpirySec = run.elapsedSec + 4.0;
      }
    }
  }

  // 4. S-Course completion check
  if (run.courseId === 's-course') {
    const startGate = S_COURSE_GEOMETRY.southStartGate;
    const finishGate = S_COURSE_GEOMETRY.northEndGate;

    if (!run.sEntered && Math.abs(vehicle.x - startGate.x) <= startGate.halfWidth + 0.8 && vehicle.z <= startGate.z) {
      run.sEntered = true;
    }

    if (
      run.sEntered &&
      Math.abs(vehicle.x - finishGate.x) <= finishGate.halfWidth + 0.8 &&
      vehicle.z <= finishGate.z
    ) {
      run.sCompleted = true;
      run.finished = true;
      run.passed = run.score >= PASS_SCORE;
      run.failReason = run.passed ? null : `합격 기준(${PASS_SCORE}점) 미달`;
      events.courseFinishedNow = true;
      events.passed = run.passed;
    }
  } else if (run.courseId === 'combined' && run.tPhase === 'done') {
    // In Combined mode, enter S-course from North gate heading South, finish at South gate
    const northGate = S_COURSE_GEOMETRY.northEndGate;
    const southGate = S_COURSE_GEOMETRY.southStartGate;

    if (
      !run.sEntered &&
      Math.abs(vehicle.x - northGate.x) <= northGate.halfWidth + 1.0 &&
      vehicle.z >= northGate.z &&
      vehicle.z <= northGate.z + 6.0
    ) {
      run.sEntered = true;
      run.toastMessage = 'S코스 진입! 검지선을 피해 남쪽 종료선까지 주행하세요.';
      run.toastTone = 'info';
      run.toastExpirySec = run.elapsedSec + 3.5;
    }

    if (
      run.sEntered &&
      Math.abs(vehicle.x - southGate.x) <= southGate.halfWidth + 1.0 &&
      vehicle.z >= southGate.z
    ) {
      run.sCompleted = true;
      run.finished = true;
      run.passed = run.score >= PASS_SCORE && run.tConfirmed;
      run.failReason = run.passed
        ? null
        : !run.tConfirmed
          ? 'T코스 확인선 미완료'
          : `합격 기준(${PASS_SCORE}점) 미달`;
      events.courseFinishedNow = true;
      events.passed = run.passed;
    }
  }

  return { events, nearestCurbDist: minClearance };
}
