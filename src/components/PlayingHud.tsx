import React from 'react';
import { COURSE_LIST, COURSES } from '../sim/courseData';
import { T_COURSE_LIMIT_SEC } from '../sim/courseEvaluator';
import type { CameraMode, CourseId, Gear, HudSnapshot, TurnSignal, VehicleInput } from '../sim/types';
import { CourseMinimap } from './CourseMinimap';

interface PlayingHudProps {
  hud: HudSnapshot;
  cameraMode: CameraMode;
  showGuides: boolean;
  muted: boolean;
  dockCollapsed: boolean;
  onToggleDock: () => void;
  onSelectCourse: (id: CourseId) => void;
  onResetCourse: () => void;
  onSetGear: (gear: Gear) => void;
  onToggleHandbrake: () => void;
  onToggleTurnSignal: (sig: TurnSignal) => void;
  onCenterSteering: () => void;
  onSetCameraMode: (mode: CameraMode) => void;
  onToggleGuides: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenReplay: () => void;
  onTouchControl: (key: keyof VehicleInput, pressed: boolean) => void;
}

function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSteerTurns(turns: number): string {
  if (Math.abs(turns) < 0.08) return '직진';
  const dir = turns > 0 ? '좌' : '우';
  return `${dir} ${Math.abs(turns).toFixed(1)}바퀴`;
}

const CAMERA_OPTIONS: { id: CameraMode; label: string }[] = [
  { id: 'chase', label: '추적' },
  { id: 'cockpit', label: '운전석' },
  { id: 'top', label: '탑뷰' },
  { id: 'rear', label: '후방' },
];

export const PlayingHud: React.FC<PlayingHudProps> = ({
  hud,
  cameraMode,
  showGuides,
  muted,
  dockCollapsed,
  onToggleDock,
  onSelectCourse,
  onResetCourse,
  onSetGear,
  onToggleHandbrake,
  onToggleTurnSignal,
  onCenterSteering,
  onSetCameraMode,
  onToggleGuides,
  onToggleMute,
  onPause,
  onOpenReplay,
  onTouchControl,
}) => {
  const scoreColor =
    hud.score >= 90 ? 'text-emerald-400' : hud.score >= 80 ? 'text-amber-300' : 'text-red-400';
  const isOverSpeed = hud.speedKmh > 20;
  const showTTimer = hud.courseId === 't-course' || (hud.courseId === 'combined' && hud.tPhase !== 'done');
  const tRemaining = Math.max(0, T_COURSE_LIMIT_SEC - hud.tCourseTimerSec);

  const blurBtn = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    fn();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4">
      {/* Top Row: Left Score/Objective Cluster + Center Toast + Right Utility & Minimap */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Compact Status Cluster */}
        <div
          className="pointer-events-auto max-w-sm rounded-xl border border-white/12 bg-[#0e1520]/90 px-4 py-3 shadow-lg"
          data-testid="hud-score-panel"
        >
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400">점수</div>
              <div className={`font-mono-num text-3xl font-extrabold leading-none ${scoreColor}`} data-testid="hud-score">
                {Math.round(hud.score)}
                <span className="ml-0.5 text-sm font-semibold text-slate-400">점</span>
              </div>
            </div>

            <div className="h-8 w-px bg-white/10" aria-hidden="true" />

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400">
                {showTTimer ? 'T코스 남은시간' : '경과시간'}
              </div>
              <div
                className={`font-mono-num text-lg font-bold leading-tight ${
                  showTTimer && tRemaining < 25 ? 'text-red-400' : 'text-slate-100'
                }`}
              >
                {showTTimer ? formatClock(tRemaining) : formatClock(hud.elapsedSec)}
              </div>
            </div>

            <div className="h-8 w-px bg-white/10" aria-hidden="true" />

            <div>
              <div className="text-[10px] font-semibold tracking-wider text-slate-400">검지선 여유</div>
              <div
                className={`font-mono-num text-lg font-bold leading-tight ${
                  hud.nearestCurbDist < 0.25 ? 'text-red-400' : hud.nearestCurbDist < 0.5 ? 'text-amber-300' : 'text-slate-100'
                }`}
              >
                {hud.nearestCurbDist > 9 ? '여유' : `${Math.round(hud.nearestCurbDist * 100)}cm`}
              </div>
            </div>
          </div>

          <div className="mt-2.5 border-t border-white/10 pt-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-amber-300">{COURSES[hud.courseId].title}</span>
              <span className="font-mono-num">
                단계 {hud.stepIndex}/{hud.stepTotal}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-100" data-testid="hud-objective">
              {hud.objectiveText}
            </p>
            {hud.tPhase === 'park-inside' && !hud.tConfirmed && (
              <div className="mt-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-emerald-400 transition-transform duration-75"
                    style={{ width: `${Math.round(hud.parkHoldRatio * 100)}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-emerald-300">
                  확인선 정지 유지 중 ({Math.round(hud.parkHoldRatio * 100)}%)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Non-Blocking Examiner Toast */}
        <div className="flex flex-1 justify-center pt-1">
          {hud.toastMessage && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg border px-4 py-2 text-sm font-bold shadow-lg ${
                hud.toastTone === 'danger'
                  ? 'border-red-400/60 bg-red-950/92 text-red-100'
                  : hud.toastTone === 'warn'
                    ? 'border-amber-400/60 bg-amber-950/92 text-amber-100'
                    : hud.toastTone === 'success'
                      ? 'border-emerald-400/60 bg-emerald-950/92 text-emerald-100'
                      : 'border-sky-400/40 bg-[#0e1520]/92 text-slate-100'
              }`}
            >
              {hud.toastMessage}
            </div>
          )}
        </div>

        {/* Top-Right Compact Utility Buttons + Real-Geometry Minimap */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              disabled={hud.replayRecordedSec < 0.3}
              onClick={blurBtn(onOpenReplay)}
              aria-label={`최근 30초 리플레이 보기 (${Math.floor(hud.replayRecordedSec)}초 녹화됨)`}
              title="최근 30초 주행 리플레이 [B]"
              data-testid="hud-replay-btn"
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                hud.replayRecordedSec >= 0.3
                  ? 'border-amber-400/50 bg-[#0e1520]/90 text-amber-300 hover:border-amber-400 hover:bg-amber-500 hover:text-slate-950'
                  : 'cursor-not-allowed border-white/10 bg-[#0e1520]/70 text-slate-500'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
              </svg>
              <span>리플레이</span>
              {hud.replayRecordedSec >= 1 && (
                <span className="font-mono-num text-[10px] opacity-85">
                  {Math.min(30, Math.floor(hud.replayRecordedSec))}s
                </span>
              )}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurBtn(onResetCourse)}
              aria-label="코스 다시 시작 (Backspace)"
              title="코스 다시 시작 [Backspace]"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0e1520]/90 text-slate-200 hover:border-amber-400 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurBtn(onToggleMute)}
              aria-label={muted ? '소리 켜기 (M)' : '음소거 (M)'}
              title={muted ? '소리 켜기 [M]' : '음소거 [M]'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0e1520]/90 text-slate-200 hover:border-amber-400 hover:text-white"
            >
              {muted ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <path d="m22 9-6 6M16 9l6 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
                </svg>
              )}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={blurBtn(onPause)}
              aria-label="일시정지 (Esc / P)"
              title="일시정지 [Esc / P]"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0e1520]/90 text-slate-200 hover:border-amber-400 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          </div>

          <div className="hidden sm:block">
            <CourseMinimap
              vehicleX={hud.vehicleX}
              vehicleZ={hud.vehicleZ}
              vehicleYaw={hud.vehicleYaw}
              courseId={hud.courseId}
              tConfirmed={hud.tConfirmed}
            />
          </div>
        </div>
      </div>

      {/* Mobile Touch Pedals & Steer Pads (only on small touch screens) */}
      <div className="pointer-events-auto flex items-end justify-between sm:hidden">
        <div className="flex gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label="좌회전"
            onPointerDown={() => onTouchControl('steerLeft', true)}
            onPointerUp={() => onTouchControl('steerLeft', false)}
            onPointerLeave={() => onTouchControl('steerLeft', false)}
            className="flex h-12 w-14 items-center justify-center rounded-lg border border-white/20 bg-[#0e1520]/90 text-sm font-bold text-white active:bg-amber-500 active:text-slate-950"
          >
            ◀
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="우회전"
            onPointerDown={() => onTouchControl('steerRight', true)}
            onPointerUp={() => onTouchControl('steerRight', false)}
            onPointerLeave={() => onTouchControl('steerRight', false)}
            className="flex h-12 w-14 items-center justify-center rounded-lg border border-white/20 bg-[#0e1520]/90 text-sm font-bold text-white active:bg-amber-500 active:text-slate-950"
          >
            ▶
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label="브레이크 또는 후진"
            onPointerDown={() => onTouchControl('brake', true)}
            onPointerUp={() => onTouchControl('brake', false)}
            onPointerLeave={() => onTouchControl('brake', false)}
            className="flex h-12 w-16 items-center justify-center rounded-lg border border-red-400/40 bg-red-950/90 text-xs font-bold text-red-100 active:bg-red-500 active:text-white"
          >
            브레이크
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="가속"
            onPointerDown={() => onTouchControl('throttle', true)}
            onPointerUp={() => onTouchControl('throttle', false)}
            onPointerLeave={() => onTouchControl('throttle', false)}
            className="flex h-12 w-16 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-950/90 text-xs font-bold text-emerald-100 active:bg-emerald-500 active:text-slate-950"
          >
            가속
          </button>
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Mid-Screen Occlusion) */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          tabIndex={-1}
          onClick={blurBtn(onToggleDock)}
          aria-expanded={!dockCollapsed}
          aria-label={dockCollapsed ? '조작 패널 열기 (H)' : '조작 패널 접기 (H)'}
          className="pointer-events-auto mb-1 rounded-t-lg border border-b-0 border-white/15 bg-[#0e1520]/90 px-3 py-1 text-[11px] font-semibold text-slate-300 hover:text-white whitespace-nowrap"
        >
          {dockCollapsed ? '▴ 조작 패널 열기 [H]' : '▾ 조작 패널 숨기기 [H]'}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#0e1520]/92 px-4 py-2.5 shadow-2xl">
            {/* 1. Speedometer + Live Rotating Steering Wheel (1.5 Turns Readout) */}
            <div className="flex items-center gap-3.5">
              <div className="min-w-[66px] text-center">
                <div
                  className={`font-mono-num text-2xl font-extrabold leading-none ${
                    isOverSpeed ? 'text-red-400' : 'text-white'
                  }`}
                  data-testid="hud-speed"
                >
                  {Math.round(hud.speedKmh)}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  km/h · 한도20
                </div>
              </div>

              <div className="h-9 w-px bg-white/10" aria-hidden="true" />

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={blurBtn(onCenterSteering)}
                  title="핸들 중앙 정렬 [C]"
                  aria-label="핸들 중앙 정렬"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#152030] hover:border-amber-400"
                >
                  <svg
                    viewBox="0 0 36 36"
                    className="h-8 w-8"
                    style={{ transform: `rotate(${-hud.steerDegrees}deg)` }}
                    aria-hidden="true"
                  >
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3.2" />
                    <path d="M18 4v6" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
                    <path d="M6 19h24M18 19v13" stroke="#94a3b8" strokeWidth="2.8" strokeLinecap="round" />
                    <circle cx="18" cy="18" r="3.5" fill="#1e293b" stroke="#e2e8f0" strokeWidth="1.5" />
                  </svg>
                </button>
                <div className="min-w-[66px]">
                  <div className="text-[10px] text-slate-400">핸들 각도</div>
                  <div className="font-mono-num text-xs font-bold text-amber-300 whitespace-nowrap" data-testid="hud-steer">
                    {formatSteerTurns(hud.steerTurns)}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Authentic Gear Selector (P / R / D) + Parking Brake + Turn Signals */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-white/10 bg-[#152030] p-0.5" role="group" aria-label="변속 기어 선택">
                {(['P', 'R', 'D'] as Gear[]).map((g) => {
                  const active = hud.gear === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      tabIndex={-1}
                      onClick={blurBtn(() => onSetGear(g))}
                      aria-pressed={active}
                      aria-label={`기어 ${g}`}
                      className={`font-mono-num h-8 w-8 rounded-md text-xs font-extrabold transition-colors ${
                        active
                          ? g === 'R'
                            ? 'bg-red-500 text-white'
                            : g === 'P'
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                tabIndex={-1}
                onClick={blurBtn(onToggleHandbrake)}
                aria-pressed={hud.handbrake}
                className={`h-9 rounded-lg border px-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  hud.handbrake
                    ? 'border-red-400 bg-red-600 text-white'
                    : 'border-white/15 bg-[#152030] text-slate-300 hover:text-white'
                }`}
              >
                주차브레이크
              </button>

              <div className="hidden items-center gap-1 md:flex" role="group" aria-label="방향지시등">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={blurBtn(() => onToggleTurnSignal('left'))}
                  aria-pressed={hud.turnSignal === 'left'}
                  aria-label="좌측 방향지시등 (Z)"
                  title="좌측 깜빡이 [Z]"
                  className={`flex h-9 w-8 items-center justify-center rounded-lg border text-xs font-bold ${
                    hud.turnSignal === 'left'
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/10 bg-[#152030] text-slate-400 hover:text-white'
                  }`}
                >
                  ◀
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={blurBtn(() => onToggleTurnSignal('right'))}
                  aria-pressed={hud.turnSignal === 'right'}
                  aria-label="우측 방향지시등 (X)"
                  title="우측 깜빡이 [X]"
                  className={`flex h-9 w-8 items-center justify-center rounded-lg border text-xs font-bold ${
                    hud.turnSignal === 'right'
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/10 bg-[#152030] text-slate-400 hover:text-white'
                  }`}
                >
                  ▶
                </button>
              </div>
            </div>

            {/* 3. Course Switcher + Camera Views + Guide Toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-white/10 bg-[#152030] p-0.5" role="group" aria-label="연습 코스 전환">
                {COURSE_LIST.map((c) => {
                  const active = hud.courseId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      tabIndex={-1}
                      onClick={blurBtn(() => onSelectCourse(c.id))}
                      aria-pressed={active}
                      className={`h-8 rounded-md px-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                        active ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {c.shortTitle}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center rounded-lg border border-white/10 bg-[#152030] p-0.5" role="group" aria-label="카메라 시점 선택">
                {CAMERA_OPTIONS.map((cam) => {
                  const active = cameraMode === cam.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      tabIndex={-1}
                      onClick={blurBtn(() => onSetCameraMode(cam.id))}
                      aria-pressed={active}
                      className={`h-8 rounded-md px-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                        active ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {cam.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                tabIndex={-1}
                onClick={blurBtn(onToggleGuides)}
                aria-pressed={showGuides}
                className={`h-9 rounded-lg border px-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  showGuides
                    ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                    : 'border-white/15 bg-[#152030] text-slate-400 hover:text-white'
                }`}
              >
                가이드 {showGuides ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
