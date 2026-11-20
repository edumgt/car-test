import type {
  CourseId,
  CourseRunState,
  ReplayClip,
  ReplayEvent,
  ReplayFrame,
  ReplaySpeed,
  Vec2,
  VehicleState,
} from './types';

export const REPLAY_MAX_DURATION_SEC = 30;
export const REPLAY_SAMPLE_INTERVAL_SEC = 1 / 30; // ~30 Hz -> ~900 frames for 30s
export const REPLAY_MIN_PLAYABLE_SEC = 0.25;

/**
 * Shortest-arc angle interpolation (radians), safe across +/-PI seam.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export interface SampledReplayState {
  vehicle: VehicleState;
  score: number;
  tConfirmed: boolean;
  curbHits: number;
  t: number;
}

/**
 * Pure rolling 30-second driving recorder.
 * Stores time-stamped vehicle and scoring snapshots plus discrete course events.
 */
export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private events: ReplayEvent[] = [];
  private lastSampleTime = -Infinity;
  private maxDurationSec: number;
  private sampleIntervalSec: number;

  constructor(
    maxDurationSec: number = REPLAY_MAX_DURATION_SEC,
    sampleIntervalSec: number = REPLAY_SAMPLE_INTERVAL_SEC
  ) {
    this.maxDurationSec = maxDurationSec;
    this.sampleIntervalSec = sampleIntervalSec;
  }

  clear(): void {
    this.frames = [];
    this.events = [];
    this.lastSampleTime = -Infinity;
  }

  /**
   * Records a frame if at least sampleIntervalSec has passed since the last sample,
   * or if force=true (e.g. initial spawn frame or discrete event/finish frame).
   */
  record(
    timeSec: number,
    vehicle: VehicleState,
    runState: Pick<CourseRunState, 'score' | 'tConfirmed' | 'curbHits'>,
    newEvents?: Omit<ReplayEvent, 't'>[],
    force = false
  ): void {
    if (newEvents && newEvents.length > 0) {
      for (const ev of newEvents) {
        this.events.push({ ...ev, t: timeSec });
      }
      force = true;
    }

    const shouldCapture =
      force ||
      this.frames.length === 0 ||
      timeSec - this.lastSampleTime >= this.sampleIntervalSec - 1e-6;

    if (shouldCapture) {
      const frame: ReplayFrame = {
        t: timeSec,
        x: vehicle.x,
        z: vehicle.z,
        yaw: vehicle.yaw,
        speed: vehicle.speed,
        steerAngle: vehicle.steerAngle,
        wheelSpin: vehicle.wheelSpin,
        gear: vehicle.gear,
        handbrake: vehicle.handbrake,
        turnSignal: vehicle.turnSignal,
        isBraking: vehicle.isBraking,
        score: runState.score,
        tConfirmed: runState.tConfirmed,
        curbHits: runState.curbHits,
      };

      // Avoid duplicate timestamps if force-recorded on same tick
      const last = this.frames[this.frames.length - 1];
      if (last && Math.abs(last.t - timeSec) < 1e-6) {
        this.frames[this.frames.length - 1] = frame;
      } else {
        this.frames.push(frame);
      }
      this.lastSampleTime = timeSec;
    }

    this.prune(timeSec);
  }

  private prune(latestTimeSec: number): void {
    const cutoff = latestTimeSec - this.maxDurationSec;

    // Keep one anchor frame at or just before cutoff so playback covers the full 30s smoothly
    if (this.frames.length > 2) {
      let dropCount = 0;
      while (
        dropCount + 1 < this.frames.length &&
        this.frames[dropCount + 1].t <= cutoff
      ) {
        dropCount++;
      }
      if (dropCount > 0) {
        this.frames.splice(0, dropCount);
      }
    }

    if (this.events.length > 0) {
      let evDrop = 0;
      while (evDrop < this.events.length && this.events[evDrop].t < cutoff) {
        evDrop++;
      }
      if (evDrop > 0) {
        this.events.splice(0, evDrop);
      }
    }
  }

  getRecordedDuration(): number {
    if (this.frames.length < 2) return 0;
    const raw = this.frames[this.frames.length - 1].t - this.frames[0].t;
    return Math.min(this.maxDurationSec, Math.max(0, raw));
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Freezes an immutable ReplayClip normalized to t in [0, durationSec] (at most maxDurationSec).
   */
  buildClip(courseId: CourseId): ReplayClip | null {
    if (this.frames.length < 2) return null;

    const latestT = this.frames[this.frames.length - 1].t;
    const rawStart = this.frames[0].t;
    const windowStart = Math.max(rawStart, latestT - this.maxDurationSec);
    const durationSec = Math.max(0, latestT - windowStart);

    if (durationSec < REPLAY_MIN_PLAYABLE_SEC) {
      return null;
    }

    const normalizedFrames: ReplayFrame[] = [];

    // If the anchor frame precedes windowStart, synthesize an exact boundary frame at t = 0
    if (this.frames[0].t < windowStart - 1e-6) {
      const boundary = interpolateFrameList(this.frames, windowStart);
      normalizedFrames.push({ ...boundary, t: 0 });
    }

    for (const f of this.frames) {
      if (f.t < windowStart - 1e-6) continue;
      const relT = Math.max(0, f.t - windowStart);
      const prev = normalizedFrames[normalizedFrames.length - 1];
      if (prev && Math.abs(prev.t - relT) < 1e-6) {
        normalizedFrames[normalizedFrames.length - 1] = { ...f, t: relT };
      } else {
        normalizedFrames.push({ ...f, t: relT });
      }
    }

    const normalizedEvents: ReplayEvent[] = this.events
      .filter((ev) => ev.t >= windowStart - 1e-6 && ev.t <= latestT + 1e-6)
      .map((ev) => ({
        ...ev,
        t: Math.max(0, Math.min(durationSec, ev.t - windowStart)),
      }));

    return {
      courseId,
      durationSec,
      frames: normalizedFrames,
      events: normalizedEvents,
    };
  }
}

function interpolateFrameList(frames: ReplayFrame[], targetT: number): ReplayFrame {
  if (frames.length === 0) {
    throw new Error('Cannot interpolate empty replay frame list');
  }
  if (frames.length === 1 || targetT <= frames[0].t) {
    return frames[0];
  }
  const lastIdx = frames.length - 1;
  if (targetT >= frames[lastIdx].t) {
    return frames[lastIdx];
  }

  // Binary search for largest index lo where frames[lo].t <= targetT
  let lo = 0;
  let hi = lastIdx;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= targetT) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const f0 = frames[lo];
  const f1 = frames[hi];
  const span = f1.t - f0.t;
  const alpha = span > 1e-6 ? Math.max(0, Math.min(1, (targetT - f0.t) / span)) : 0;

  return {
    t: targetT,
    x: f0.x + (f1.x - f0.x) * alpha,
    z: f0.z + (f1.z - f0.z) * alpha,
    yaw: lerpAngle(f0.yaw, f1.yaw, alpha),
    speed: f0.speed + (f1.speed - f0.speed) * alpha,
    steerAngle: f0.steerAngle + (f1.steerAngle - f0.steerAngle) * alpha,
    wheelSpin: f0.wheelSpin + (f1.wheelSpin - f0.wheelSpin) * alpha,
    gear: alpha < 0.5 ? f0.gear : f1.gear,
    handbrake: alpha < 0.5 ? f0.handbrake : f1.handbrake,
    turnSignal: alpha < 0.5 ? f0.turnSignal : f1.turnSignal,
    isBraking: alpha < 0.5 ? f0.isBraking : f1.isBraking,
    score: f0.score,
    tConfirmed: f0.tConfirmed,
    curbHits: f0.curbHits,
  };
}

/**
 * Samples a ReplayClip at playbackTimeSec and returns an interpolated VehicleState + course metadata.
 */
export function sampleReplayClip(clip: ReplayClip, playbackTimeSec: number): SampledReplayState {
  const clampedT = Math.max(0, Math.min(clip.durationSec, playbackTimeSec));
  const f = interpolateFrameList(clip.frames, clampedT);

  return {
    t: clampedT,
    vehicle: {
      x: f.x,
      z: f.z,
      yaw: f.yaw,
      speed: f.speed,
      steerAngle: f.steerAngle,
      wheelSpin: f.wheelSpin,
      gear: f.gear,
      handbrake: f.handbrake,
      turnSignal: f.turnSignal,
      isBraking: f.isBraking,
      autoReverseHoldTime: 0,
    },
    score: f.score,
    tConfirmed: f.tConfirmed,
    curbHits: f.curbHits,
  };
}

export interface AdvancePlaybackResult {
  nextTimeSec: number;
  reachedEnd: boolean;
  crossedEvents: ReplayEvent[];
}

/**
 * Advances replay playback time and returns any events crossed in (prevTime, nextTime].
 */
export function advanceReplayPlayback(
  clip: ReplayClip,
  currentTimeSec: number,
  dtSec: number,
  speed: ReplaySpeed,
  isPlaying: boolean
): AdvancePlaybackResult {
  if (!isPlaying || dtSec <= 0) {
    return {
      nextTimeSec: Math.max(0, Math.min(clip.durationSec, currentTimeSec)),
      reachedEnd: currentTimeSec >= clip.durationSec,
      crossedEvents: [],
    };
  }

  const rawNext = currentTimeSec + dtSec * speed;
  const reachedEnd = rawNext >= clip.durationSec;
  const nextTimeSec = Math.min(clip.durationSec, rawNext);

  const crossedEvents = clip.events.filter(
    (ev) => ev.t > currentTimeSec && ev.t <= nextTimeSec
  );

  return {
    nextTimeSec,
    reachedEnd,
    crossedEvents,
  };
}

/**
 * Downsamples clip trajectory to ~60 points for clean 2D minimap path overlay.
 */
export function extractReplayTrail(clip: ReplayClip, maxPoints = 72): Vec2[] {
  const n = clip.frames.length;
  if (n === 0) return [];
  if (n <= maxPoints) {
    return clip.frames.map((f) => ({ x: f.x, z: f.z }));
  }
  const result: Vec2[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(n - 1, Math.round((i / (maxPoints - 1)) * (n - 1)));
    const f = clip.frames[idx];
    result.push({ x: f.x, z: f.z });
  }
  return result;
}
