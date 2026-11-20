import type { Gear, TurnSignal, Vec2, VehicleInput, VehicleState } from './types';

export const VEHICLE_SPEC = {
  length: 4.5,
  width: 1.78,
  halfL: 2.25,
  halfW: 0.89,
  wheelbase: 2.7,
  trackWidth: 1.54,
  frontAxleZ: -1.35, // local -Z is forward
  rearAxleZ: 1.35,   // local +Z is rear
  wheelRadius: 0.33,
  maxSteerAngle: (36 * Math.PI) / 180, // ~0.628 rad -> ~3.72m turning radius
  maxSteeringWheelDeg: 540, // 1.5 turns each side (한 바퀴 반)
  maxForwardSpeed: 7.2, // ~26 km/h (allows exceeding 20 km/h test limit if floored)
  maxReverseSpeed: 3.6, // ~13 km/h
  accelForward: 3.4,
  accelReverse: 2.4,
  brakeDecel: 8.5,
  coastDecel: 1.5,
  handbrakeDecel: 12.0,
  steerRate: 1.45, // rad/s front wheel angle (~0.43s center-to-lock, ~0.86s lock-to-lock)
  steerReturnRateMoving: 1.35, // self-centering when rolling
  steerReturnRateStopped: 0.0, // preserve dry-steering angle when stopped (정지 거치조향)
  speedLimitKmh: 20,
} as const;

export function createInitialVehicleState(x: number, z: number, yaw: number): VehicleState {
  return {
    x,
    z,
    yaw,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    gear: 'D',
    handbrake: false,
    turnSignal: 'none',
    isBraking: false,
    autoReverseHoldTime: 0,
  };
}

export function setVehicleGear(state: VehicleState, nextGear: Gear): boolean {
  if (state.gear === nextGear) return true;
  // Prevent shifting into P or reversing direction at high speed (> 3 km/h)
  if (Math.abs(state.speed) > 0.9 && (nextGear === 'P' || (nextGear === 'R' && state.speed > 0.9) || (nextGear === 'D' && state.speed < -0.9))) {
    return false;
  }
  state.gear = nextGear;
  state.autoReverseHoldTime = 0;
  if (nextGear === 'P') {
    state.speed = 0;
  }
  return true;
}

export function toggleVehicleTurnSignal(state: VehicleState, signal: TurnSignal): void {
  if (signal === 'none') {
    state.turnSignal = 'none';
    return;
  }
  state.turnSignal = state.turnSignal === signal ? 'none' : signal;
}

export function steeringAngleToTurns(steerAngle: number): { turns: number; degrees: number } {
  const ratio = steerAngle / VEHICLE_SPEC.maxSteerAngle;
  const clamped = Math.max(-1, Math.min(1, ratio));
  return {
    turns: clamped * 1.5,
    degrees: clamped * VEHICLE_SPEC.maxSteeringWheelDeg,
  };
}

/**
 * Steps Ackermann bicycle kinematics and longitudinal speed.
 * Convention: local forward is -Z, local right is +X.
 * World forward = (-sin(yaw), -cos(yaw)).
 * Positive steerAngle turns wheels LEFT (+yaw when moving forward).
 */
export function stepVehiclePhysics(
  state: VehicleState,
  input: VehicleInput,
  rawDt: number
): void {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  if (dt <= 0) return;

  // 1. Steering input (dry steering allowed when stopped, smooth self-centering when rolling)
  const steerDir = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
  if (steerDir !== 0) {
    state.steerAngle += steerDir * VEHICLE_SPEC.steerRate * dt;
    state.steerAngle = Math.max(
      -VEHICLE_SPEC.maxSteerAngle,
      Math.min(VEHICLE_SPEC.maxSteerAngle, state.steerAngle)
    );
  } else {
    const absSpeed = Math.abs(state.speed);
    if (absSpeed > 0.15) {
      const returnFactor = Math.min(1, absSpeed / 2.5);
      const returnStep = VEHICLE_SPEC.steerReturnRateMoving * returnFactor * dt;
      if (Math.abs(state.steerAngle) <= returnStep) {
        state.steerAngle = 0;
      } else {
        state.steerAngle -= Math.sign(state.steerAngle) * returnStep;
      }
    }
  }

  // 2. Intuitive gear auto-shift helper for keyboard convenience:
  // Holding brake (S/Down) while completely stopped in D for 0.30s shifts to R,
  // and holding throttle (W/Up) while stopped in P doesn't move until gear changed.
  const isStopped = Math.abs(state.speed) < 0.04;
  if (state.gear === 'D' && input.brake && !input.throttle && isStopped && !state.handbrake) {
    state.autoReverseHoldTime += dt;
    if (state.autoReverseHoldTime >= 0.30) {
      state.gear = 'R';
      state.autoReverseHoldTime = 0;
    }
  } else if (state.gear === 'R' && input.throttle && !input.brake && isStopped && !state.handbrake) {
    // In R, W/Up also reverses smoothly? Wait: let's be crystal clear!
    // In real driving: W/Up is ALWAYS gas pedal (forward in D, backward in R),
    // and S/Down is brake (and in D when stopped, holding S engages R and backs up!).
    state.autoReverseHoldTime = 0;
  } else {
    state.autoReverseHoldTime = 0;
  }

  // 3. Longitudinal speed integration
  state.isBraking = false;

  if (state.gear === 'P' || state.handbrake) {
    state.isBraking = input.brake || state.handbrake;
    const decel = VEHICLE_SPEC.handbrakeDecel * dt;
    if (Math.abs(state.speed) <= decel) {
      state.speed = 0;
    } else {
      state.speed -= Math.sign(state.speed) * decel;
    }
  } else if (state.gear === 'D') {
    if (input.brake) {
      state.isBraking = true;
      const decel = VEHICLE_SPEC.brakeDecel * dt;
      if (Math.abs(state.speed) <= decel) {
        state.speed = 0;
      } else {
        state.speed -= Math.sign(state.speed) * decel;
      }
    } else if (input.throttle) {
      if (state.speed < 0) {
        state.speed = Math.min(0, state.speed + VEHICLE_SPEC.brakeDecel * dt);
      } else {
        state.speed = Math.min(
          VEHICLE_SPEC.maxForwardSpeed,
          state.speed + VEHICLE_SPEC.accelForward * dt
        );
      }
    } else {
      const decel = VEHICLE_SPEC.coastDecel * dt;
      if (Math.abs(state.speed) <= decel) {
        state.speed = 0;
      } else {
        state.speed -= Math.sign(state.speed) * decel;
      }
    }
  } else if (state.gear === 'R') {
    // In R gear, BOTH S/Down (intuitive keyboard reverse) AND W/Up (real pedal in R)
    // Wait: if user uses S/Down to reverse in R, what brakes? W/Up brakes when moving backward,
    // OR let's make W/Up = gas in R AND S/Down = reverse throttle in R? No, then how to brake in R?
    // Cleanest, most universally intuitive rule:
    // - In R: pressing S/Down accelerates in reverse; pressing W/Up brakes (and if stopped for 0.30s shifts back to D)!
    // - Wait: what if someone shifts to R and presses W? If stopped in R and pressing W for 0.25s, shifting to D is super natural for WASD gamers,
    //   OR wait: in real cars you press gas (W) in R. Let's check: in Korean driving games (3D운전교실 / 운전면허 시뮬레이터),
    //   if you have explicit P/R/D gears, pressing W (가속) moves in the selected gear direction, and S (브레이크) ALWAYS brakes!
    //   Wait — what if a casual keyboard user just presses S to reverse without clicking R?
    //   Look how nicely both work together:
    //   - When gear === 'R':
    //     - If pressing `brake` (S/Down) AND `speed <= 0`: move in reverse (so holding S in D auto-shifts to R and keeps reversing smoothly!).
    //     - If pressing `throttle` (W/Up): if moving backward (`speed < -0.05`), brake to stop; once stopped (`>= 0.25s`), auto-shift to D and go forward!
    //   Let's verify:
    //     - W/↑ = Always forward (auto-shifts R→D if stopped, accelerates forward in D)
    //     - S/↓ = Brake when moving forward; once stopped, auto-shifts D→R and reverses smoothly!
    //     - Explicit R / D / P buttons & keys ALSO work immediately for authentic gear-shift practice (e.g., shifting to P in T-bay, or shifting to R before reversing)!
    if (input.throttle && !input.brake) {
      if (state.speed < -0.05) {
        state.isBraking = true;
        state.speed = Math.min(0, state.speed + VEHICLE_SPEC.brakeDecel * dt);
      } else {
        // Stopped in R and pressing W -> smoothly shift to D and accelerate forward
        state.gear = 'D';
        state.speed = Math.min(
          VEHICLE_SPEC.maxForwardSpeed,
          state.speed + VEHICLE_SPEC.accelForward * dt
        );
      }
    } else if (input.brake && !input.throttle) {
      if (state.speed > 0.05) {
        state.isBraking = true;
        state.speed = Math.max(0, state.speed - VEHICLE_SPEC.brakeDecel * dt);
      } else {
        state.speed = Math.max(
          -VEHICLE_SPEC.maxReverseSpeed,
          state.speed - VEHICLE_SPEC.accelReverse * dt
        );
      }
    } else if (input.brake && input.throttle) {
      state.isBraking = true;
      const decel = VEHICLE_SPEC.brakeDecel * dt;
      if (Math.abs(state.speed) <= decel) state.speed = 0;
      else state.speed -= Math.sign(state.speed) * decel;
    } else {
      const decel = VEHICLE_SPEC.coastDecel * dt;
      if (Math.abs(state.speed) <= decel) state.speed = 0;
      else state.speed -= Math.sign(state.speed) * decel;
    }
  }

  // 4. Ackermann bicycle kinematics integration (mid-point / RK2 for crisp low-speed turning)
  if (Math.abs(state.speed) > 1e-5) {
    const angularVel = (state.speed / VEHICLE_SPEC.wheelbase) * Math.tan(state.steerAngle);
    const midYaw = state.yaw + angularVel * dt * 0.5;
    const fwdX = -Math.sin(midYaw);
    const fwdZ = -Math.cos(midYaw);

    state.x += fwdX * state.speed * dt;
    state.z += fwdZ * state.speed * dt;
    state.yaw += angularVel * dt;

    // Normalize yaw to [-PI, PI]
    while (state.yaw > Math.PI) state.yaw -= Math.PI * 2;
    while (state.yaw < -Math.PI) state.yaw += Math.PI * 2;

    state.wheelSpin += (state.speed * dt) / VEHICLE_SPEC.wheelRadius;
  }

  // Keep inside overall test ground outer perimeter (-44..44, -36..36)
  state.x = Math.max(-40, Math.min(40, state.x));
  state.z = Math.max(-33, Math.min(33, state.z));
}

export function localToWorld(state: Pick<VehicleState, 'x' | 'z' | 'yaw'>, lx: number, lz: number): Vec2 {
  const c = Math.cos(state.yaw);
  const s = Math.sin(state.yaw);
  return {
    x: state.x + lx * c + lz * s,
    z: state.z - lx * s + lz * c,
  };
}

/**
 * Returns the 4 wheel ground contact centers in world coordinates: [FL, FR, RL, RR].
 */
export function getWheelPositions(state: Pick<VehicleState, 'x' | 'z' | 'yaw'>): [Vec2, Vec2, Vec2, Vec2] {
  const hw = VEHICLE_SPEC.trackWidth * 0.5;
  return [
    localToWorld(state, -hw, VEHICLE_SPEC.frontAxleZ), // Front-Left
    localToWorld(state, hw, VEHICLE_SPEC.frontAxleZ),  // Front-Right
    localToWorld(state, -hw, VEHICLE_SPEC.rearAxleZ),  // Rear-Left
    localToWorld(state, hw, VEHICLE_SPEC.rearAxleZ),   // Rear-Right
  ];
}

/**
 * Returns the 4 outer body bumper corners in world coordinates: [FL, FR, RR, RL].
 */
export function getVehicleCorners(state: Pick<VehicleState, 'x' | 'z' | 'yaw'>): [Vec2, Vec2, Vec2, Vec2] {
  const hw = VEHICLE_SPEC.halfW;
  const hl = VEHICLE_SPEC.halfL;
  return [
    localToWorld(state, -hw, -hl),
    localToWorld(state, hw, -hl),
    localToWorld(state, hw, hl),
    localToWorld(state, -hw, hl),
  ];
}

/**
 * Computes predicted left & right tire path points (in world coordinates) for the driving guide overlay.
 * Projects forward in D, backward in R.
 */
export function computePredictedArcs(
  state: VehicleState,
  steps = 14,
  stepDist = 0.45
): { left: Vec2[]; right: Vec2[] } {
  const dir = state.gear === 'R' ? -1 : 1;
  const hw = VEHICLE_SPEC.trackWidth * 0.5;
  const axleZ = dir > 0 ? VEHICLE_SPEC.frontAxleZ : VEHICLE_SPEC.rearAxleZ;
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  let simX = state.x;
  let simZ = state.z;
  let simYaw = state.yaw;
  const tanSteer = Math.tan(state.steerAngle);

  for (let i = 0; i <= steps; i++) {
    left.push(localToWorld({ x: simX, z: simZ, yaw: simYaw }, -hw, axleZ));
    right.push(localToWorld({ x: simX, z: simZ, yaw: simYaw }, hw, axleZ));

    const ds = dir * stepDist;
    const dYaw = (ds / VEHICLE_SPEC.wheelbase) * tanSteer;
    const midYaw = simYaw + dYaw * 0.5;
    simX += -Math.sin(midYaw) * ds;
    simZ += -Math.cos(midYaw) * ds;
    simYaw += dYaw;
  }

  return { left, right };
}
