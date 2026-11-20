import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceReplayPlayback,
  extractReplayTrail,
  lerpAngle,
  REPLAY_MAX_DURATION_SEC,
  ReplayRecorder,
  sampleReplayClip,
} from './replayBuffer';
import { createInitialVehicleState } from './vehiclePhysics';

test('ReplayRecorder enforces rolling 30-second window and normalizes timestamps to 0..30s', () => {
  const recorder = new ReplayRecorder(REPLAY_MAX_DURATION_SEC, 0.1);
  const v = createInitialVehicleState(-18, 16, 0);

  // Record 45 seconds of driving at 10Hz
  for (let i = 0; i <= 450; i++) {
    const t = i * 0.1;
    v.z = 16 - t * 0.5;
    v.speed = 0.5;
    recorder.record(t, v, { score: 100, tConfirmed: false, curbHits: 0 });
  }

  assert.equal(recorder.getRecordedDuration(), 30);

  const clip = recorder.buildClip('t-course');
  assert.ok(clip, 'Clip should be built when >= 0.25s recorded');
  assert.equal(clip.courseId, 't-course');
  assert.ok(Math.abs(clip.durationSec - 30) < 0.01, `Expected 30s duration, got ${clip.durationSec}`);
  assert.equal(clip.frames[0].t, 0);
  assert.ok(Math.abs(clip.frames[clip.frames.length - 1].t - 30) < 0.01);

  // At t=0 of clip (which corresponds to recording t=15s), z should be 16 - 15*0.5 = 8.5
  const startSample = sampleReplayClip(clip, 0);
  assert.ok(Math.abs(startSample.vehicle.z - 8.5) < 0.05, `Expected z ~8.5, got ${startSample.vehicle.z}`);

  // At t=30 of clip (recording t=45s), z should be 16 - 45*0.5 = -6.5
  const endSample = sampleReplayClip(clip, 30);
  assert.ok(Math.abs(endSample.vehicle.z - -6.5) < 0.05, `Expected z ~-6.5, got ${endSample.vehicle.z}`);
});

test('ReplayRecorder prunes old events outside 30s window and shifts kept events relative to clip start', () => {
  const recorder = new ReplayRecorder(30, 0.2);
  const v = createInitialVehicleState(16, 18, 0);

  for (let i = 0; i <= 200; i++) {
    const t = i * 0.2; // 0..40s
    const events =
      i === 25 // t = 5s (outside final 10..40s window -> pruned)
        ? [{ type: 'curb-hit' as const, label: '검지선 접촉', segmentId: 's-left-2' }]
        : i === 125 // t = 25s (inside 10..40s window -> shifted to 15s)
          ? [{ type: 'curb-hit' as const, label: '검지선 접촉', segmentId: 's-right-8' }]
          : undefined;
    recorder.record(t, v, { score: i >= 125 ? 80 : 90, tConfirmed: false, curbHits: i >= 125 ? 2 : 1 }, events);
  }

  const clip = recorder.buildClip('s-course');
  assert.ok(clip);
  assert.equal(clip.events.length, 1);
  assert.equal(clip.events[0].segmentId, 's-right-8');
  assert.ok(Math.abs(clip.events[0].t - 15.0) < 0.02, `Expected shifted event at 15s, got ${clip.events[0].t}`);
});

test('lerpAngle and sampleReplayClip interpolate shortest yaw arc across +/-PI seam', () => {
  const a = Math.PI - 0.1;
  const b = -Math.PI + 0.1;
  const mid = lerpAngle(a, b, 0.5);
  // Halfway across PI seam should be ~PI (or -PI), never 0
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.02, `Expected near +/-PI, got ${mid}`);

  const recorder = new ReplayRecorder(30, 0.5);
  const v = createInitialVehicleState(0, 0, a);
  recorder.record(0, v, { score: 100, tConfirmed: false, curbHits: 0 }, undefined, true);
  v.x = 10;
  v.yaw = b;
  v.gear = 'R';
  v.steerAngle = -0.5;
  recorder.record(1, v, { score: 90, tConfirmed: true, curbHits: 1 }, undefined, true);

  const clip = recorder.buildClip('t-course');
  assert.ok(clip);
  const half = sampleReplayClip(clip, 0.5);
  assert.ok(Math.abs(half.vehicle.x - 5) < 1e-6);
  assert.ok(Math.abs(Math.abs(half.vehicle.yaw) - Math.PI) < 0.02);
  assert.ok(Math.abs(half.vehicle.steerAngle - -0.25) < 1e-6);
});

test('advanceReplayPlayback respects playback speed, end clamping, and crossed event detection', () => {
  const recorder = new ReplayRecorder(30, 0.5);
  const v = createInitialVehicleState(-18, 16, 0);
  recorder.record(0, v, { score: 100, tConfirmed: false, curbHits: 0 }, undefined, true);
  recorder.record(
    2,
    v,
    { score: 100, tConfirmed: true, curbHits: 0 },
    [{ type: 'park-confirm', label: '주차 확인' }],
    true
  );
  recorder.record(4, v, { score: 100, tConfirmed: true, curbHits: 0 }, undefined, true);

  const clip = recorder.buildClip('t-course');
  assert.ok(clip);

  // Step from 1.5s at 2x speed for 0.5s -> 2.5s, crossing the 2.0s park-confirm event
  const step1 = advanceReplayPlayback(clip, 1.5, 0.5, 2, true);
  assert.equal(step1.nextTimeSec, 2.5);
  assert.equal(step1.reachedEnd, false);
  assert.equal(step1.crossedEvents.length, 1);
  assert.equal(step1.crossedEvents[0].type, 'park-confirm');

  // Step past end -> clamps to 4.0s and sets reachedEnd=true
  const step2 = advanceReplayPlayback(clip, 3.8, 0.5, 1, true);
  assert.equal(step2.nextTimeSec, 4.0);
  assert.equal(step2.reachedEnd, true);

  // When paused, time does not advance
  const pausedStep = advanceReplayPlayback(clip, 1.0, 1.0, 1, false);
  assert.equal(pausedStep.nextTimeSec, 1.0);
  assert.equal(pausedStep.crossedEvents.length, 0);

  // Trail extraction downsamples cleanly
  const trail = extractReplayTrail(clip, 10);
  assert.equal(trail.length, clip.frames.length);
});

test('ReplayRecorder returns null clip if recorded span is below minimum playable duration', () => {
  const recorder = new ReplayRecorder(30, 0.05);
  const v = createInitialVehicleState(0, 0, 0);
  recorder.record(0, v, { score: 100, tConfirmed: false, curbHits: 0 }, undefined, true);
  recorder.record(0.1, v, { score: 100, tConfirmed: false, curbHits: 0 }, undefined, true);
  assert.equal(recorder.buildClip('t-course'), null);
});
