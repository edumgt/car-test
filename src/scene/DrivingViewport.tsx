import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DrivingAudioEngine } from '../audio/drivingAudio';
import { COURSES } from '../sim/courseData';
import {
  createCourseRunState,
  getObjectiveSummary,
  PARK_CONFIRM_HOLD_SEC,
  stepCourseEvaluation,
} from '../sim/courseEvaluator';
import {
  advanceReplayPlayback,
  extractReplayTrail,
  ReplayRecorder,
  sampleReplayClip,
} from '../sim/replayBuffer';
import type {
  CameraMode,
  CourseId,
  CourseRunState,
  GameState,
  Gear,
  HudSnapshot,
  ReplayCameraMode,
  ReplayClip,
  ReplayEvent,
  ReplayHudSnapshot,
  ReplaySpeed,
  TurnSignal,
  Vec2,
  VehicleInput,
  VehicleState,
} from '../sim/types';
import {
  createInitialVehicleState,
  setVehicleGear,
  steeringAngleToTurns,
  stepVehiclePhysics,
  toggleVehicleTurnSignal,
} from '../sim/vehiclePhysics';
import { buildPracticeGroundWorld } from './practiceGroundScene';
import { createTestVehicleRig } from './testVehicleMesh';

export interface SimControllerHandle {
  resetCourse: (courseId?: CourseId) => void;
  setGear: (gear: Gear) => void;
  toggleHandbrake: () => void;
  toggleTurnSignal: (sig: TurnSignal) => void;
  centerSteering: () => void;
  setMuted: (muted: boolean) => void;
  unlockAudio: () => void;
  setTouchControl: (key: keyof VehicleInput, pressed: boolean) => void;
  startReplay: () => ReplayHudSnapshot | null;
  stopReplay: () => void;
  toggleReplayPlay: () => void;
  seekReplay: (timeSec: number) => void;
  stepReplay: (deltaSec: number) => void;
  setReplaySpeed: (speed: ReplaySpeed) => void;
}

interface DrivingViewportProps {
  gameState: GameState;
  courseId: CourseId;
  cameraMode: CameraMode;
  replayCameraMode: ReplayCameraMode;
  showGuides: boolean;
  muted: boolean;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onReplayHudUpdate: (snapshot: ReplayHudSnapshot) => void;
  onCourseFinished: (snapshot: HudSnapshot) => void;
  onControllerReady: (handle: SimControllerHandle) => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

// Pre-allocated scratch vectors (zero GC in render loop)
const _camDesired = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camCurrentLook = new THREE.Vector3();

export const DrivingViewport: React.FC<DrivingViewportProps> = ({
  gameState,
  courseId,
  cameraMode,
  replayCameraMode,
  showGuides,
  muted,
  onHudUpdate,
  onReplayHudUpdate,
  onCourseFinished,
  onControllerReady,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest props in refs so WebGLRenderer mounts ONCE and never resets on HUD state updates
  const propsRef = useRef({
    gameState,
    courseId,
    cameraMode,
    replayCameraMode,
    showGuides,
    muted,
    onHudUpdate,
    onReplayHudUpdate,
    onCourseFinished,
  });
  propsRef.current = {
    gameState,
    courseId,
    cameraMode,
    replayCameraMode,
    showGuides,
    muted,
    onHudUpdate,
    onReplayHudUpdate,
    onCourseFinished,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialW = container.clientWidth || window.innerWidth;
    const initialH = container.clientHeight || window.innerHeight;
    renderer.setSize(initialW, initialH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.dataset.testid = 'driving-canvas';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xbcd8f2);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(0xc6dcf0, 58, 175);

    // Studio IBL reflections via RoomEnvironment on all devices so car clearcoat & rims pop cleanly
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // Warm sunlight key + cool sky / warm asphalt hemisphere fill
    const hemiLight = new THREE.HemisphereLight(0xd9ecff, 0x8f8270, 1.05);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.25);
    sunLight.position.set(28, 46, 26);
    sunLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      sunLight.shadow.mapSize.set(1024, 1024);
      sunLight.shadow.camera.near = 6;
      sunLight.shadow.camera.far = 130;
      const d = 48;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.025;
    }
    scene.add(sunLight);

    const camera = new THREE.PerspectiveCamera(54, initialW / Math.max(1, initialH), 0.15, 320);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const world = buildPracticeGroundWorld(maxAnisotropy, !isSoftwareGl);
    scene.add(world.root);

    const vehicleRig = createTestVehicleRig(maxAnisotropy, !isSoftwareGl);
    scene.add(vehicleRig.root);
    scene.add(vehicleRig.guideGroup);

    const audio = new DrivingAudioEngine();

    // Simulation state
    const initialCourse = propsRef.current.courseId;
    const spawn = COURSES[initialCourse].spawn;
    let vehicle: VehicleState = createInitialVehicleState(spawn.x, spawn.z, spawn.yaw);
    let runState: CourseRunState = createCourseRunState(initialCourse);
    let cameraInitialized = false;
    let nearestCurbDist = 5.0;

    // Rolling 30-second Replay Recorder & active playback state
    const replayRecorder = new ReplayRecorder();
    let activeReplayClip: ReplayClip | null = null;
    let activeReplayTrail: Vec2[] = [];
    let replayTimeSec = 0;
    let replayPlaying = true;
    let replaySpeed: ReplaySpeed = 1;
    let replayOrbitAngle = 0.7;
    let lastReplayConfirmed = false;
    replayRecorder.record(0, vehicle, runState, undefined, true);

    const keyboardInput: VehicleInput = {
      throttle: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
    };
    const touchInput: VehicleInput = {
      throttle: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
    };
    const pressedCodes = new Set<string>();

    const syncKeyboardInput = () => {
      keyboardInput.throttle = pressedCodes.has('KeyW') || pressedCodes.has('ArrowUp');
      keyboardInput.brake = pressedCodes.has('KeyS') || pressedCodes.has('ArrowDown');
      keyboardInput.steerLeft = pressedCodes.has('KeyA') || pressedCodes.has('ArrowLeft');
      keyboardInput.steerRight = pressedCodes.has('KeyD') || pressedCodes.has('ArrowRight');
    };

    const clearInputs = () => {
      pressedCodes.clear();
      syncKeyboardInput();
      touchInput.throttle = false;
      touchInput.brake = false;
      touchInput.steerLeft = false;
      touchInput.steerRight = false;
    };

    const buildSnapshot = (): HudSnapshot => {
      const { turns, degrees } = steeringAngleToTurns(vehicle.steerAngle);
      const obj = getObjectiveSummary(runState);
      return {
        speedKmh: Math.abs(vehicle.speed) * 3.6,
        gear: vehicle.gear,
        handbrake: vehicle.handbrake,
        turnSignal: vehicle.turnSignal,
        steerTurns: turns,
        steerDegrees: degrees,
        score: runState.score,
        elapsedSec: runState.elapsedSec,
        tCourseTimerSec: runState.tCourseTimerSec,
        tPhase: runState.tPhase,
        tConfirmed: runState.tConfirmed,
        parkHoldRatio: Math.min(1, runState.parkHoldSec / PARK_CONFIRM_HOLD_SEC),
        curbHits: runState.curbHits,
        objectiveText: obj.text,
        stepIndex: obj.stepIndex,
        stepTotal: obj.stepTotal,
        toastMessage: runState.toastMessage,
        toastTone: runState.toastTone,
        vehicleX: vehicle.x,
        vehicleZ: vehicle.z,
        vehicleYaw: vehicle.yaw,
        courseId: runState.courseId,
        finished: runState.finished,
        passed: runState.passed,
        failReason: runState.failReason,
        deductions: [...runState.deductions],
        nearestCurbDist,
        replayRecordedSec: replayRecorder.getRecordedDuration(),
      };
    };

    const buildReplaySnapshot = (): ReplayHudSnapshot | null => {
      if (!activeReplayClip) return null;
      const sample = sampleReplayClip(activeReplayClip, replayTimeSec);
      const { turns, degrees } = steeringAngleToTurns(sample.vehicle.steerAngle);
      return {
        courseId: activeReplayClip.courseId,
        currentTimeSec: sample.t,
        durationSec: activeReplayClip.durationSec,
        isPlaying: replayPlaying,
        speed: replaySpeed,
        speedKmh: Math.abs(sample.vehicle.speed) * 3.6,
        gear: sample.vehicle.gear,
        handbrake: sample.vehicle.handbrake,
        steerTurns: turns,
        steerDegrees: degrees,
        score: sample.score,
        curbHits: sample.curbHits,
        tConfirmed: sample.tConfirmed,
        vehicleX: sample.vehicle.x,
        vehicleZ: sample.vehicle.z,
        vehicleYaw: sample.vehicle.yaw,
        events: activeReplayClip.events,
        trailPoints: activeReplayTrail,
      };
    };

    const applyReplayFrameVisuals = () => {
      if (!activeReplayClip) return;
      const sample = sampleReplayClip(activeReplayClip, replayTimeSec);
      vehicleRig.updateVisuals(sample.vehicle, sample.t, propsRef.current.showGuides);
      if (sample.tConfirmed !== lastReplayConfirmed) {
        lastReplayConfirmed = sample.tConfirmed;
        world.setParkingConfirmed(sample.tConfirmed);
      }
    };

    const resetCourse = (nextCourseId?: CourseId) => {
      const targetCourse = nextCourseId ?? propsRef.current.courseId;
      const sp = COURSES[targetCourse].spawn;
      vehicle = createInitialVehicleState(sp.x, sp.z, sp.yaw);
      runState = createCourseRunState(targetCourse);
      nearestCurbDist = 5.0;
      clearInputs();
      activeReplayClip = null;
      activeReplayTrail = [];
      replayRecorder.clear();
      replayRecorder.record(0, vehicle, runState, undefined, true);
      world.setParkingConfirmed(false);
      world.setActiveCourseHighlight(targetCourse);
      vehicleRig.updateVisuals(vehicle, 0, propsRef.current.showGuides);
      cameraInitialized = false;
      propsRef.current.onHudUpdate(buildSnapshot());
    };

    const controllerHandle: SimControllerHandle = {
      resetCourse,
      setGear: (gear) => {
        audio.unlock();
        if (setVehicleGear(vehicle, gear)) {
          audio.playGearClick();
          propsRef.current.onHudUpdate(buildSnapshot());
        }
      },
      toggleHandbrake: () => {
        audio.unlock();
        vehicle.handbrake = !vehicle.handbrake;
        audio.playGearClick();
        propsRef.current.onHudUpdate(buildSnapshot());
      },
      toggleTurnSignal: (sig) => {
        audio.unlock();
        toggleVehicleTurnSignal(vehicle, sig);
        propsRef.current.onHudUpdate(buildSnapshot());
      },
      centerSteering: () => {
        vehicle.steerAngle = 0;
        propsRef.current.onHudUpdate(buildSnapshot());
      },
      setMuted: (m) => audio.setMuted(m),
      unlockAudio: () => audio.unlock(),
      setTouchControl: (key, pressed) => {
        audio.unlock();
        touchInput[key] = pressed;
      },
      startReplay: () => {
        const clip = replayRecorder.buildClip(runState.courseId);
        if (!clip) return null;
        clearInputs();
        activeReplayClip = clip;
        activeReplayTrail = extractReplayTrail(clip, 72);
        replayTimeSec = 0;
        replayPlaying = true;
        replaySpeed = 1;
        replayOrbitAngle = 0.7;
        const firstSample = sampleReplayClip(clip, 0);
        lastReplayConfirmed = firstSample.tConfirmed;
        world.setParkingConfirmed(firstSample.tConfirmed);
        vehicleRig.updateVisuals(firstSample.vehicle, 0, propsRef.current.showGuides);
        cameraInitialized = false;
        const snap = buildReplaySnapshot();
        if (snap) propsRef.current.onReplayHudUpdate(snap);
        return snap;
      },
      stopReplay: () => {
        activeReplayClip = null;
        activeReplayTrail = [];
        world.setParkingConfirmed(runState.tConfirmed);
        vehicleRig.updateVisuals(vehicle, runState.elapsedSec, propsRef.current.showGuides);
        cameraInitialized = false;
        propsRef.current.onHudUpdate(buildSnapshot());
      },
      toggleReplayPlay: () => {
        if (!activeReplayClip) return;
        if (!replayPlaying && replayTimeSec >= activeReplayClip.durationSec - 0.05) {
          replayTimeSec = 0;
        }
        replayPlaying = !replayPlaying;
        applyReplayFrameVisuals();
        const snap = buildReplaySnapshot();
        if (snap) propsRef.current.onReplayHudUpdate(snap);
      },
      seekReplay: (timeSec) => {
        if (!activeReplayClip) return;
        replayTimeSec = Math.max(0, Math.min(activeReplayClip.durationSec, timeSec));
        applyReplayFrameVisuals();
        const snap = buildReplaySnapshot();
        if (snap) propsRef.current.onReplayHudUpdate(snap);
      },
      stepReplay: (deltaSec) => {
        if (!activeReplayClip) return;
        replayTimeSec = Math.max(
          0,
          Math.min(activeReplayClip.durationSec, replayTimeSec + deltaSec)
        );
        applyReplayFrameVisuals();
        const snap = buildReplaySnapshot();
        if (snap) propsRef.current.onReplayHudUpdate(snap);
      },
      setReplaySpeed: (spd) => {
        replaySpeed = spd;
        const snap = buildReplaySnapshot();
        if (snap) propsRef.current.onReplayHudUpdate(snap);
      },
    };
    onControllerReady(controllerHandle);

    // Keyboard listeners on window
    const onKeyDown = (e: KeyboardEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        audio.unlock();
        if (e.code === 'Space') {
          vehicle.handbrake = !vehicle.handbrake;
          audio.playGearClick();
        } else if (e.code === 'KeyR') {
          if (setVehicleGear(vehicle, 'R')) audio.playGearClick();
        } else if (e.code === 'KeyF' || e.code === 'Digit3') {
          if (setVehicleGear(vehicle, 'D')) audio.playGearClick();
        } else if (e.code === 'KeyT' || e.code === 'Digit1') {
          if (setVehicleGear(vehicle, 'P')) audio.playGearClick();
        } else if (e.code === 'Digit2') {
          if (setVehicleGear(vehicle, 'R')) audio.playGearClick();
        } else if (e.code === 'KeyZ' || e.code === 'BracketLeft') {
          toggleVehicleTurnSignal(vehicle, 'left');
        } else if (e.code === 'KeyX' || e.code === 'BracketRight') {
          toggleVehicleTurnSignal(vehicle, 'right');
        } else if (e.code === 'KeyC') {
          vehicle.steerAngle = 0;
        } else if (e.code === 'Backspace') {
          resetCourse();
        }
      }
      pressedCodes.add(e.code);
      syncKeyboardInput();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedCodes.delete(e.code);
      syncKeyboardInput();
    };

    const onBlur = () => clearInputs();
    const onVisibility = () => {
      if (document.hidden) clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Initial placement & initial HUD snapshot
    vehicleRig.updateVisuals(vehicle, 0, propsRef.current.showGuides);
    propsRef.current.onHudUpdate(buildSnapshot());

    let frameId = 0;
    let disposed = false;
    let prevTime = performance.now();
    let titleOrbitAngle = 0.55;
    let hudEmitAccumulator = 0;
    let lastGameState: GameState = propsRef.current.gameState;
    let lastActiveCam: ReplayCameraMode = propsRef.current.cameraMode;

    const updateCamera = (
      dt: number,
      state: GameState,
      mode: ReplayCameraMode,
      targetVehicle: VehicleState,
      activeCourse: CourseId
    ) => {
      if (state === 'title') {
        titleOrbitAngle += dt * 0.14;
        const radius = 33;
        const targetX = -1;
        const targetZ = -1;
        _camDesired.set(
          targetX + Math.sin(titleOrbitAngle) * radius,
          17.0 + Math.sin(titleOrbitAngle * 0.7) * 1.8,
          targetZ + Math.cos(titleOrbitAngle) * radius * 0.84
        );
        _camLook.set(targetX, 0.8, targetZ - 2);
        if (!cameraInitialized) {
          camera.position.copy(_camDesired);
          _camCurrentLook.copy(_camLook);
          cameraInitialized = true;
        } else {
          const alpha = 1 - Math.exp(-3.0 * dt);
          camera.position.lerp(_camDesired, alpha);
          _camCurrentLook.lerp(_camLook, alpha);
        }
        camera.lookAt(_camCurrentLook);
        return;
      }

      if (mode !== lastActiveCam) {
        lastActiveCam = mode;
        cameraInitialized = false;
      }

      const sinY = Math.sin(targetVehicle.yaw);
      const cosY = Math.cos(targetVehicle.yaw);
      const fwdX = -sinY;
      const fwdZ = -cosY;
      const rightX = cosY;
      const rightZ = -sinY;

      if (mode === 'cockpit') {
        // Authentic Korean left-hand-drive driver's eye view
        _camDesired.set(
          targetVehicle.x - rightX * 0.34 + fwdX * 0.14,
          1.24,
          targetVehicle.z - rightZ * 0.34 + fwdZ * 0.14
        );
        _camLook.set(
          _camDesired.x + fwdX * 14,
          1.02,
          _camDesired.z + fwdZ * 14
        );
        camera.position.copy(_camDesired);
        _camCurrentLook.copy(_camLook);
        camera.lookAt(_camCurrentLook);
        cameraInitialized = true;
        return;
      }

      if (mode === 'top') {
        // High precision overhead view keeping the car centered in the open viewport above the bottom dock
        _camDesired.set(targetVehicle.x, 19.0, targetVehicle.z + 2.4);
        _camLook.set(targetVehicle.x, 0, targetVehicle.z + 0.6);
      } else if (mode === 'rear') {
        // Low rear-quarter reverse parking angle looking down rear tires & curb lines
        _camDesired.set(
          targetVehicle.x - fwdX * 6.2 + rightX * 2.6,
          3.4,
          targetVehicle.z - fwdZ * 6.2 + rightZ * 2.6
        );
        _camLook.set(targetVehicle.x - fwdX * 1.4, 0.55, targetVehicle.z - fwdZ * 1.4);
      } else if (mode === 'course-cam') {
        // Elevated trackside examiner-tower camera tailored to T-Course or S-Course
        const isTSector =
          activeCourse === 't-course' || (activeCourse === 'combined' && targetVehicle.x < 0);
        if (isTSector) {
          _camDesired.set(-5.2, 12.8, 16.5);
          _camLook.set(
            targetVehicle.x * 0.72 + -14.8 * 0.28,
            0.75,
            targetVehicle.z * 0.72 + 1.5 * 0.28
          );
        } else {
          _camDesired.set(5.2, 13.0, 9.2);
          _camLook.set(
            targetVehicle.x * 0.72 + 18.0 * 0.28,
            0.75,
            targetVehicle.z * 0.72 + 0.0 * 0.28
          );
        }
      } else if (mode === 'orbit') {
        // 360-degree inspection orbit around the vehicle (keeps rotating gently even when paused)
        replayOrbitAngle += dt * 0.42;
        const radius = 8.8;
        _camDesired.set(
          targetVehicle.x + Math.sin(replayOrbitAngle) * radius,
          4.5,
          targetVehicle.z + Math.cos(replayOrbitAngle) * radius
        );
        _camLook.set(targetVehicle.x, 0.75, targetVehicle.z);
      } else {
        // Default Chase Cam (pulls slightly higher & wider when in R for T-course visibility)
        const isRev = targetVehicle.gear === 'R';
        const dist = isRev ? 8.8 : 7.6;
        const height = isRev ? 5.2 : 3.8;
        _camDesired.set(targetVehicle.x - fwdX * dist, height, targetVehicle.z - fwdZ * dist);
        _camLook.set(
          targetVehicle.x + fwdX * (isRev ? 0.4 : 2.6),
          0.9,
          targetVehicle.z + fwdZ * (isRev ? 0.4 : 2.6)
        );
      }

      if (!cameraInitialized) {
        camera.position.copy(_camDesired);
        _camCurrentLook.copy(_camLook);
        cameraInitialized = true;
      } else {
        const damp = 1 - Math.exp(-8.5 * dt);
        camera.position.lerp(_camDesired, damp);
        _camCurrentLook.lerp(_camLook, damp);
      }
      camera.lookAt(_camCurrentLook);
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;

      const {
        gameState: curState,
        cameraMode: curCam,
        replayCameraMode: curReplayCam,
        showGuides: curGuides,
        muted: curMuted,
      } = propsRef.current;

      audio.setMuted(curMuted);
      audio.setPaused(curState !== 'playing');

      if (curState === 'playing' && lastGameState !== 'playing') {
        clearInputs();
        if (lastGameState === 'title' || lastGameState === 'replay') {
          cameraInitialized = false;
        }
      }
      lastGameState = curState;

      world.setGuidesVisible(curGuides);

      if (curState === 'replay' && activeReplayClip) {
        const step = advanceReplayPlayback(
          activeReplayClip,
          replayTimeSec,
          dt,
          replaySpeed,
          replayPlaying
        );
        replayTimeSec = step.nextTimeSec;
        if (step.reachedEnd) {
          replayPlaying = false;
        }

        for (const ev of step.crossedEvents) {
          if (ev.type === 'curb-hit' && ev.segmentId) {
            world.flashCurb(ev.segmentId);
          }
        }

        const sample = sampleReplayClip(activeReplayClip, replayTimeSec);
        if (sample.tConfirmed !== lastReplayConfirmed) {
          lastReplayConfirmed = sample.tConfirmed;
          world.setParkingConfirmed(sample.tConfirmed);
        }

        world.updateEffects(dt);
        vehicleRig.updateVisuals(sample.vehicle, sample.t, curGuides);
        audio.update(dt, 0, 'P', false, false);
        updateCamera(dt, curState, curReplayCam, sample.vehicle, activeReplayClip.courseId);

        renderer.render(scene, camera);

        hudEmitAccumulator += dt;
        if (hudEmitAccumulator >= 0.08) {
          hudEmitAccumulator = 0;
          const rSnap = buildReplaySnapshot();
          if (rSnap) propsRef.current.onReplayHudUpdate(rSnap);
        }
      } else {
        if (curState === 'playing' && !runState.finished) {
          const combinedInput: VehicleInput = {
            throttle: keyboardInput.throttle || touchInput.throttle,
            brake: keyboardInput.brake || touchInput.brake,
            steerLeft: keyboardInput.steerLeft || touchInput.steerLeft,
            steerRight: keyboardInput.steerRight || touchInput.steerRight,
          };

          stepVehiclePhysics(vehicle, combinedInput, dt);
          const evalRes = stepCourseEvaluation(runState, vehicle, dt);
          nearestCurbDist = evalRes.nearestCurbDist;

          const newEvents: Omit<ReplayEvent, 't'>[] = [];
          if (evalRes.events.curbHitSegmentId) {
            world.flashCurb(evalRes.events.curbHitSegmentId);
            audio.playCurbWarning();
            newEvents.push({
              type: 'curb-hit',
              label: '검지선 접촉',
              segmentId: evalRes.events.curbHitSegmentId,
            });
          }
          if (evalRes.events.speedWarningNow) {
            audio.playSpeedWarning();
            newEvents.push({ type: 'speed-warn', label: '속도 초과' });
          }
          if (evalRes.events.parkConfirmedNow) {
            world.setParkingConfirmed(true);
            audio.playConfirmChime();
            newEvents.push({ type: 'park-confirm', label: '주차 확인' });
          }
          if (evalRes.events.courseFinishedNow) {
            newEvents.push({
              type: 'finish',
              label: evalRes.events.passed ? '코스 완주' : '실격 종료',
            });
          }

          replayRecorder.record(
            runState.elapsedSec,
            vehicle,
            runState,
            newEvents.length > 0 ? newEvents : undefined,
            evalRes.events.courseFinishedNow
          );

          if (evalRes.events.courseFinishedNow) {
            if (evalRes.events.passed) audio.playPassFanfare();
            else audio.playFailTone();
            const finalSnap = buildSnapshot();
            propsRef.current.onHudUpdate(finalSnap);
            propsRef.current.onCourseFinished(finalSnap);
          }
        }

        world.updateEffects(dt);
        vehicleRig.updateVisuals(vehicle, runState.elapsedSec, curGuides && curState === 'playing');
        audio.update(
          dt,
          vehicle.speed,
          vehicle.gear,
          vehicle.turnSignal !== 'none',
          curState === 'playing'
        );
        updateCamera(dt, curState, curCam, vehicle, runState.courseId);

        renderer.render(scene, camera);

        hudEmitAccumulator += dt;
        if (hudEmitAccumulator >= 0.1) {
          hudEmitAccumulator = 0;
          propsRef.current.onHudUpdate(buildSnapshot());
        }
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    // Kick off loop
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      audio.dispose();
      vehicleRig.dispose();
      world.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Mount WebGLRenderer exactly once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden"
      aria-label="한국 운전면허 기능시험 3D 주행 화면"
    />
  );
};
