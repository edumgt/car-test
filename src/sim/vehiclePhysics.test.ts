import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePredictedArcs,
  createInitialVehicleState,
  getWheelPositions,
  setVehicleGear,
  steeringAngleToTurns,
  stepVehiclePhysics,
  VEHICLE_SPEC,
} from './vehiclePhysics';

test('idle vehicle remains completely stationary with zero drift', () => {
  const v = createInitialVehicleState(-18, 16, 0);
  for (let i = 0; i < 120; i++) {
    stepVehiclePhysics(v, { throttle: false, brake: false, steerLeft: false, steerRight: false }, 1 / 60);
  }
  assert.equal(v.x, -18);
  assert.equal(v.z, 16);
  assert.equal(v.yaw, 0);
  assert.equal(v.speed, 0);
});

test('forward throttle moves vehicle North (-Z) when yaw = 0 and steering turns left/right accurately', () => {
  const v = createInitialVehicleState(0, 0, 0);
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(v, { throttle: true, brake: false, steerLeft: false, steerRight: false }, 1 / 60);
  }
  assert.ok(v.z < -1.0, `Expected z < -1.0, got ${v.z}`);
  assert.ok(Math.abs(v.x) < 1e-6);

  // Steer left while moving forward -> yaw increases, x becomes negative (-X = left)
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(v, { throttle: true, brake: false, steerLeft: true, steerRight: false }, 1 / 60);
  }
  assert.ok(v.yaw > 0.2, `Expected positive yaw turning left, got ${v.yaw}`);
  assert.ok(v.x < -0.5, `Expected negative x turning left, got ${v.x}`);
});

test('reversing with right steering swings tail right (+X) for T-course right-side bay entry', () => {
  const v = createInitialVehicleState(-18, -5, 0);
  assert.equal(setVehicleGear(v, 'R'), true);
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(v, { throttle: false, brake: true, steerLeft: false, steerRight: true }, 1 / 60);
  }
  // Reversing with front wheels right swings rear toward +X (right) and increases yaw toward +PI/2 (nose faces -X)
  assert.ok(v.speed < -1.0, `Expected reverse speed < -1, got ${v.speed}`);
  assert.ok(v.yaw > 0.3, `Expected yaw to increase toward +PI/2, got ${v.yaw}`);
  assert.ok(v.x > -18.0, `Expected vehicle to back toward +X bay, got ${v.x}`);
});

test('parking gear P and handbrake prevent vehicle movement', () => {
  const v = createInitialVehicleState(0, 0, 0);
  setVehicleGear(v, 'P');
  for (let i = 0; i < 30; i++) {
    stepVehiclePhysics(v, { throttle: true, brake: false, steerLeft: false, steerRight: false }, 1 / 60);
  }
  assert.equal(v.speed, 0);
  assert.equal(v.z, 0);

  setVehicleGear(v, 'D');
  v.handbrake = true;
  for (let i = 0; i < 30; i++) {
    stepVehiclePhysics(v, { throttle: true, brake: false, steerLeft: false, steerRight: false }, 1 / 60);
  }
  assert.equal(v.speed, 0);
});

test('steeringAngleToTurns maps full lock to 1.5 turns (540 deg)', () => {
  const leftLock = steeringAngleToTurns(VEHICLE_SPEC.maxSteerAngle);
  assert.equal(leftLock.turns, 1.5);
  assert.equal(leftLock.degrees, 540);

  const rightLock = steeringAngleToTurns(-VEHICLE_SPEC.maxSteerAngle);
  assert.equal(rightLock.turns, -1.5);
  assert.equal(rightLock.degrees, -540);
});

test('wheel positions and predicted arcs return valid geometry', () => {
  const v = createInitialVehicleState(0, 0, 0);
  const [fl, fr, rl, rr] = getWheelPositions(v);
  assert.ok(fl.x < 0 && fr.x > 0);
  assert.ok(fl.z < 0 && rl.z > 0);
  assert.ok(Math.abs(fr.x - fl.x - VEHICLE_SPEC.trackWidth) < 1e-6);
  assert.ok(Math.abs(rr.z - fr.z - VEHICLE_SPEC.wheelbase) < 1e-6);

  const arcs = computePredictedArcs(v, 10, 0.5);
  assert.equal(arcs.left.length, 11);
  assert.equal(arcs.right.length, 11);
  assert.ok(arcs.left[10].z < arcs.left[0].z);
});
