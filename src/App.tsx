import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingHud } from './components/PlayingHud';
import { ReplayHud } from './components/ReplayHud';
import { PauseModal, ResultModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { DrivingViewport, type SimControllerHandle } from './scene/DrivingViewport';
import { COURSES } from './sim/courseData';
import type {
  CameraMode,
  CourseId,
  GameState,
  Gear,
  HudSnapshot,
  ReplayCameraMode,
  ReplayHudSnapshot,
  ReplaySpeed,
  TurnSignal,
  VehicleInput,
} from './sim/types';

function readInitialQueryParams(): { autostart: boolean; course: CourseId } {
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const rawCourse = params.get('course');
  const course: CourseId =
    rawCourse === 's-course' || rawCourse === 'combined' || rawCourse === 't-course'
      ? rawCourse
      : 't-course';
  return { autostart, course };
}

function createPlaceholderHud(courseId: CourseId): HudSnapshot {
  const spawn = COURSES[courseId].spawn;
  return {
    speedKmh: 0,
    gear: 'D',
    handbrake: false,
    turnSignal: 'none',
    steerTurns: 0,
    steerDegrees: 0,
    score: 100,
    elapsedSec: 0,
    tCourseTimerSec: 0,
    tPhase: 'approach',
    tConfirmed: false,
    parkHoldRatio: 0,
    curbHits: 0,
    objectiveText: COURSES[courseId].targetDesc,
    stepIndex: 1,
    stepTotal: courseId === 's-course' ? 2 : courseId === 't-course' ? 4 : 3,
    toastMessage: null,
    toastTone: 'info',
    vehicleX: spawn.x,
    vehicleZ: spawn.z,
    vehicleYaw: spawn.yaw,
    courseId,
    finished: false,
    passed: false,
    failReason: null,
    deductions: [],
    nearestCurbDist: 5,
    replayRecordedSec: 0,
  };
}

const CAMERA_CYCLE: CameraMode[] = ['chase', 'cockpit', 'top', 'rear'];
const REPLAY_CAMERA_CYCLE: ReplayCameraMode[] = [
  'chase',
  'top',
  'rear',
  'cockpit',
  'course-cam',
  'orbit',
];

export const App: React.FC = () => {
  const initParams = useRef(readInitialQueryParams());

  const [gameState, setGameState] = useState<GameState>(
    initParams.current.autostart ? 'playing' : 'title'
  );
  const [courseId, setCourseId] = useState<CourseId>(initParams.current.course);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [replayCameraMode, setReplayCameraMode] = useState<ReplayCameraMode>('chase');
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [hud, setHud] = useState<HudSnapshot>(() => createPlaceholderHud(initParams.current.course));
  const [resultSnapshot, setResultSnapshot] = useState<HudSnapshot | null>(null);
  const [replayHud, setReplayHud] = useState<ReplayHudSnapshot | null>(null);
  const replayReturnStateRef = useRef<'playing' | 'paused' | 'gameover'>('playing');

  const simRef = useRef<SimControllerHandle | null>(null);

  // Sync game state to document.body.dataset.state immediately
  useEffect(() => {
    document.body.dataset.state = gameState;
    document.body.dataset.course = courseId;
    document.body.dataset.camera = gameState === 'replay' ? replayCameraMode : cameraMode;
  }, [gameState, courseId, cameraMode, replayCameraMode]);

  const handleStart = useCallback(() => {
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    simRef.current?.unlockAudio();
    simRef.current?.resetCourse(courseId);
    setResultSnapshot(null);
    setGameState('playing');
  }, [courseId]);

  const handleSelectCourseTitle = useCallback((nextId: CourseId) => {
    setCourseId(nextId);
    simRef.current?.resetCourse(nextId);
  }, []);

  const handleSelectCoursePlaying = useCallback((nextId: CourseId) => {
    setCourseId(nextId);
    setResultSnapshot(null);
    simRef.current?.resetCourse(nextId);
    setGameState('playing');
  }, []);

  const handleResetCourse = useCallback(() => {
    setResultSnapshot(null);
    simRef.current?.resetCourse(courseId);
    setGameState('playing');
  }, [courseId]);

  const handleCourseFinished = useCallback((finalSnap: HudSnapshot) => {
    setResultSnapshot(finalSnap);
    setGameState('gameover');
  }, []);

  const handleControllerReady = useCallback((handle: SimControllerHandle) => {
    simRef.current = handle;
  }, []);

  const handleSetGear = useCallback((g: Gear) => simRef.current?.setGear(g), []);
  const handleToggleHandbrake = useCallback(() => simRef.current?.toggleHandbrake(), []);
  const handleToggleTurnSignal = useCallback((s: TurnSignal) => simRef.current?.toggleTurnSignal(s), []);
  const handleCenterSteering = useCallback(() => simRef.current?.centerSteering(), []);
  const handleTouchControl = useCallback((k: keyof VehicleInput, pressed: boolean) => {
    simRef.current?.setTouchControl(k, pressed);
  }, []);

  const handleOpenReplay = useCallback(
    (returnTo: 'playing' | 'paused' | 'gameover') => {
      const snap = simRef.current?.startReplay();
      if (!snap) return;
      replayReturnStateRef.current = returnTo;
      setReplayCameraMode(cameraMode);
      setReplayHud(snap);
      document.body.dataset.state = 'replay';
      setGameState('replay');
    },
    [cameraMode]
  );

  const handleExitReplay = useCallback(() => {
    simRef.current?.stopReplay();
    setReplayHud(null);
    const target = replayReturnStateRef.current;
    document.body.dataset.state = target;
    setGameState(target);
  }, []);

  const handleToggleReplayPlay = useCallback(() => simRef.current?.toggleReplayPlay(), []);
  const handleSeekReplay = useCallback((sec: number) => simRef.current?.seekReplay(sec), []);
  const handleStepReplay = useCallback((delta: number) => simRef.current?.stepReplay(delta), []);
  const handleSetReplaySpeed = useCallback((spd: ReplaySpeed) => simRef.current?.setReplaySpeed(spd), []);

  // Global keyboard shortcuts (Enter/Space on Title, Esc/P Pause, V Camera, G Guide, H Dock, M Mute, B Replay)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (gameState === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setGameState('paused');
        } else if (e.code === 'KeyB') {
          e.preventDefault();
          handleOpenReplay('playing');
        } else if (e.code === 'KeyV') {
          setCameraMode((prev) => CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(prev) + 1) % CAMERA_CYCLE.length]);
        } else if (e.code === 'KeyG') {
          setShowGuides((prev) => !prev);
        } else if (e.code === 'KeyH') {
          setDockCollapsed((prev) => !prev);
        } else if (e.code === 'KeyM') {
          setMuted((prev) => !prev);
        }
        return;
      }

      if (gameState === 'replay') {
        if (e.code === 'Escape') {
          e.preventDefault();
          handleExitReplay();
        } else if (e.code === 'Space') {
          e.preventDefault();
          handleToggleReplayPlay();
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          handleStepReplay(-2);
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          handleStepReplay(2);
        } else if (e.code === 'KeyV') {
          setReplayCameraMode(
            (prev) => REPLAY_CAMERA_CYCLE[(REPLAY_CAMERA_CYCLE.indexOf(prev) + 1) % REPLAY_CAMERA_CYCLE.length]
          );
        } else if (e.code === 'KeyG') {
          setShowGuides((prev) => !prev);
        }
        return;
      }

      if (gameState === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          setGameState('playing');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, handleStart, handleOpenReplay, handleExitReplay, handleToggleReplayPlay, handleStepReplay]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Isolated WebGL Viewport Container */}
      <DrivingViewport
        gameState={gameState}
        courseId={courseId}
        cameraMode={cameraMode}
        replayCameraMode={replayCameraMode}
        showGuides={showGuides}
        muted={muted}
        onHudUpdate={setHud}
        onReplayHudUpdate={setReplayHud}
        onCourseFinished={handleCourseFinished}
        onControllerReady={handleControllerReady}
      />

      {/* Title Screen */}
      {gameState === 'title' && (
        <TitleOverlay
          selectedCourse={courseId}
          onSelectCourse={handleSelectCourseTitle}
          onStart={handleStart}
        />
      )}

      {/* Playing HUD */}
      {gameState === 'playing' && (
        <PlayingHud
          hud={hud}
          cameraMode={cameraMode}
          showGuides={showGuides}
          muted={muted}
          dockCollapsed={dockCollapsed}
          onToggleDock={() => setDockCollapsed((v) => !v)}
          onSelectCourse={handleSelectCoursePlaying}
          onResetCourse={handleResetCourse}
          onSetGear={handleSetGear}
          onToggleHandbrake={handleToggleHandbrake}
          onToggleTurnSignal={handleToggleTurnSignal}
          onCenterSteering={handleCenterSteering}
          onSetCameraMode={setCameraMode}
          onToggleGuides={() => setShowGuides((v) => !v)}
          onToggleMute={() => setMuted((v) => !v)}
          onPause={() => setGameState('paused')}
          onOpenReplay={() => handleOpenReplay('playing')}
          onTouchControl={handleTouchControl}
        />
      )}

      {/* 30-Second Replay Playback HUD */}
      {gameState === 'replay' && replayHud && (
        <ReplayHud
          replay={replayHud}
          cameraMode={replayCameraMode}
          showGuides={showGuides}
          onTogglePlay={handleToggleReplayPlay}
          onSeek={handleSeekReplay}
          onStep={handleStepReplay}
          onSetSpeed={handleSetReplaySpeed}
          onSetCameraMode={setReplayCameraMode}
          onToggleGuides={() => setShowGuides((v) => !v)}
          onExit={handleExitReplay}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && (
        <PauseModal
          courseId={courseId}
          canReplay={hud.replayRecordedSec >= 0.3}
          onResume={() => setGameState('playing')}
          onWatchReplay={() => handleOpenReplay('paused')}
          onRestart={handleResetCourse}
          onGoTitle={() => setGameState('title')}
        />
      )}

      {/* Result Modal (Pass / Fail) */}
      {gameState === 'gameover' && resultSnapshot && (
        <ResultModal
          snapshot={resultSnapshot}
          canReplay={resultSnapshot.replayRecordedSec >= 0.3}
          onWatchReplay={() => handleOpenReplay('gameover')}
          onRetry={handleResetCourse}
          onNextCourse={handleSelectCoursePlaying}
          onGoTitle={() => {
            setResultSnapshot(null);
            setGameState('title');
          }}
        />
      )}
    </div>
  );
};

export default App;
