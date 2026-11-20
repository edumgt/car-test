import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, S_COURSE_GEOMETRY, T_COURSE_LAYOUT } from './courseData';
import {
  createCourseRunState,
  findCurbContact,
  PARK_CONFIRM_HOLD_SEC,
  PASS_SCORE,
  stepCourseEvaluation,
} from './courseEvaluator';
import { createInitialVehicleState, setVehicleGear } from './vehiclePhysics';

test('T-course spawn has clean curb clearance with zero initial contact', () => {
  const spawn = COURSES['t-course'].spawn;
  const v = createInitialVehicleState(spawn.x, spawn.z, spawn.yaw);
  const { hit, minClearance } = findCurbContact(v, 't-course');
  assert.equal(hit, null);
  assert.ok(minClearance > 1.0, `Expected >1m clearance at T-course spawn, got ${minClearance}`);
});

test('S-course spawn has clean curb clearance and smooth centerline', () => {
  const spawn = COURSES['s-course'].spawn;
  const v = createInitialVehicleState(spawn.x, spawn.z, spawn.yaw);
  const { hit, minClearance } = findCurbContact(v, 's-course');
  assert.equal(hit, null);
  assert.ok(minClearance > 0.7, `Expected >0.7m clearance at S-course spawn, got ${minClearance}`);
  assert.ok(S_COURSE_GEOMETRY.centerline.length >= 40);
});

test('curb touch deducts 10 points with cooldown protection', () => {
  const run = createCourseRunState('t-course');
  // Place vehicle wheel directly onto T-course left wall (x = -20.4)
  const v = createInitialVehicleState(T_COURSE_LAYOUT.corridorLeftX + 0.77, 8.0, 0);

  const first = stepCourseEvaluation(run, v, 0.05);
  assert.ok(first.events.curbHitSegmentId !== null);
  assert.equal(run.score, 90);
  assert.equal(run.curbHits, 1);

  // Immediately next frame should NOT double-deduct due to cooldown
  const second = stepCourseEvaluation(run, v, 0.05);
  assert.equal(second.events.curbHitSegmentId, null);
  assert.equal(run.score, 90);
});

test('T-course parking confirmation flow: inside bay + P gear for 1s -> confirmed -> exit -> pass', () => {
  const run = createCourseRunState('t-course');
  // Parked cleanly inside the right-hand T-bay facing West (-X -> yaw = +PI/2)
  // Rear axle at x = -12.0 + 1.35 = -10.65 (inside confirmLineZone [-11.9, -9.3]),
  // Front axle at x = -12.0 - 1.35 = -13.35 (inside bayInnerZone [-15.5, -9.2]).
  const v = createInitialVehicleState(-12.0, 0.0, Math.PI / 2);
  setVehicleGear(v, 'P');

  let confirmed = false;
  for (let i = 0; i < Math.ceil((PARK_CONFIRM_HOLD_SEC + 0.1) / 0.05); i++) {
    const res = stepCourseEvaluation(run, v, 0.05);
    if (res.events.parkConfirmedNow) confirmed = true;
  }
  assert.equal(confirmed, true);
  assert.equal(run.tConfirmed, true);
  assert.equal(run.tPhase, 'confirmed');

  // Now move vehicle out through T-course North exit gate
  v.x = T_COURSE_LAYOUT.exitGate.x;
  v.z = T_COURSE_LAYOUT.exitGate.z - 0.5;
  v.yaw = 0;
  setVehicleGear(v, 'D');

  const finishRes = stepCourseEvaluation(run, v, 0.05);
  assert.equal(finishRes.events.courseFinishedNow, true);
  assert.equal(finishRes.events.passed, true);
  assert.equal(run.finished, true);
  assert.equal(run.passed, true);
  assert.ok(run.score >= PASS_SCORE);
});

test('T-course exit without parking confirmation deducts 10 points and fails course', () => {
  const run = createCourseRunState('t-course');
  const v = createInitialVehicleState(T_COURSE_LAYOUT.exitGate.x, T_COURSE_LAYOUT.exitGate.z - 0.5, 0);
  const res = stepCourseEvaluation(run, v, 0.05);
  assert.equal(res.events.courseFinishedNow, true);
  assert.equal(run.passed, false);
  assert.equal(run.score, 90);
});

test('exceeding 20 km/h deducts 5 points', () => {
  const run = createCourseRunState('s-course');
  const spawn = COURSES['s-course'].spawn;
  const v = createInitialVehicleState(spawn.x, spawn.z, spawn.yaw);
  v.speed = 6.5; // 23.4 km/h > 20 km/h
  const res = stepCourseEvaluation(run, v, 0.05);
  assert.equal(res.events.speedWarningNow, true);
  assert.equal(run.score, 95);
});
