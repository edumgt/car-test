export type CourseId = 't-course' | 's-course' | 'combined';

export type Gear = 'P' | 'R' | 'D';

export type CameraMode = 'chase' | 'cockpit' | 'top' | 'rear';

export type ReplayCameraMode = CameraMode | 'course-cam' | 'orbit';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'replay';

export type TurnSignal = 'none' | 'left' | 'right' | 'hazard';

export interface Vec2 {
  x: number;
  z: number;
}

export interface CurbSegment {
  id: string;
  course: 't-course' | 's-course' | 'connector';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  radius: number; // Curb half-thickness for wheel sensor contact
}

export interface RectZone {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface GateLine {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  axis: 'x' | 'z'; // 'x' means gate spans along X (crossed in Z)
  direction: 1 | -1; // expected travel direction along crossing axis
}

export interface GuideMarker {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  length: number;
  rotationY: number;
  color: string;
}

export interface VehicleInput {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface VehicleState {
  x: number;
  z: number;
  yaw: number; // 0 = facing North (-Z), +yaw = counter-clockwise (Left)
  speed: number; // signed longitudinal speed in m/s (+forward, -reverse)
  steerAngle: number; // front wheel angle in radians (+left, -right)
  wheelSpin: number; // accumulated wheel rotation angle in radians
  gear: Gear;
  handbrake: boolean;
  turnSignal: TurnSignal;
  isBraking: boolean;
  autoReverseHoldTime: number;
}

export interface DeductionRecord {
  id: string;
  timeSec: number;
  reason: string;
  points: number;
}

export type TCoursePhase =
  | 'approach'
  | 'park-inside'
  | 'confirmed'
  | 'exiting'
  | 'done';

export interface CourseRunState {
  courseId: CourseId;
  score: number;
  elapsedSec: number;
  tCourseTimerSec: number;
  tCourseOvertimePenalized: boolean;
  tPhase: TCoursePhase;
  parkHoldSec: number;
  tConfirmed: boolean;
  sEntered: boolean;
  sCompleted: boolean;
  curbHits: number;
  speedViolations: number;
  lastCurbHitTime: number;
  lastCurbSegmentId: string | null;
  lastSpeedHitTime: number;
  deductions: DeductionRecord[];
  finished: boolean;
  passed: boolean;
  failReason: string | null;
  toastMessage: string | null;
  toastTone: 'info' | 'success' | 'warn' | 'danger';
  toastExpirySec: number;
}

export interface CourseMetadata {
  id: CourseId;
  title: string;
  shortTitle: string;
  subtitle: string;
  spawn: { x: number; z: number; yaw: number };
  targetDesc: string;
}

export interface HudSnapshot {
  speedKmh: number;
  gear: Gear;
  handbrake: boolean;
  turnSignal: TurnSignal;
  steerTurns: number; // -1.5 (right) to +1.5 (left)
  steerDegrees: number; // -540 to +540
  score: number;
  elapsedSec: number;
  tCourseTimerSec: number;
  tPhase: TCoursePhase;
  tConfirmed: boolean;
  parkHoldRatio: number; // 0..1
  curbHits: number;
  objectiveText: string;
  stepIndex: number;
  stepTotal: number;
  toastMessage: string | null;
  toastTone: 'info' | 'success' | 'warn' | 'danger';
  vehicleX: number;
  vehicleZ: number;
  vehicleYaw: number;
  courseId: CourseId;
  finished: boolean;
  passed: boolean;
  failReason: string | null;
  deductions: DeductionRecord[];
  nearestCurbDist: number;
  replayRecordedSec: number;
}

export type ReplayEventType = 'curb-hit' | 'park-confirm' | 'speed-warn' | 'finish';

export interface ReplayEvent {
  t: number; // seconds from start of clip (or recording clock before buildClip)
  type: ReplayEventType;
  label: string;
  segmentId?: string;
}

export interface ReplayFrame {
  t: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steerAngle: number;
  wheelSpin: number;
  gear: Gear;
  handbrake: boolean;
  turnSignal: TurnSignal;
  isBraking: boolean;
  score: number;
  tConfirmed: boolean;
  curbHits: number;
}

export interface ReplayClip {
  courseId: CourseId;
  durationSec: number;
  frames: ReplayFrame[];
  events: ReplayEvent[];
}

export type ReplaySpeed = 0.5 | 1 | 2;

export interface ReplayHudSnapshot {
  courseId: CourseId;
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  speedKmh: number;
  gear: Gear;
  handbrake: boolean;
  steerTurns: number;
  steerDegrees: number;
  score: number;
  curbHits: number;
  tConfirmed: boolean;
  vehicleX: number;
  vehicleZ: number;
  vehicleYaw: number;
  events: ReplayEvent[];
  trailPoints: Vec2[];
}

