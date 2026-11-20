import React from 'react';
import { COURSES } from '../sim/courseData';
import type { ReplayCameraMode, ReplayHudSnapshot, ReplaySpeed } from '../sim/types';
import { CourseMinimap } from './CourseMinimap';

interface ReplayHudProps {
  replay: ReplayHudSnapshot;
  cameraMode: ReplayCameraMode;
  showGuides: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onStep: (deltaSec: number) => void;
  onSetSpeed: (speed: ReplaySpeed) => void;
  onSetCameraMode: (mode: ReplayCameraMode) => void;
  onToggleGuides: () => void;
  onExit: () => void;
}

const REPLAY_CAMERAS: { id: ReplayCameraMode; label: string }[] = [
  { id: 'chase', label: '추적' },
  { id: 'top', label: '탑뷰' },
  { id: 'rear', label: '후방·바퀴' },
  { id: 'cockpit', label: '운전석' },
  { id: 'course-cam', label: '코스 고정' },
  { id: 'orbit', label: '360° 회전' },
];

const REPLAY_SPEEDS: ReplaySpeed[] = [0.5, 1, 2];

function formatReplayClock(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatSteerTurns(turns: number): string {
  if (Math.abs(turns) < 0.08) return '직진';
  const dir = turns > 0 ? '좌' : '우';
  return `${dir} ${Math.abs(turns).toFixed(1)}바퀴`;
}

export const ReplayHud: React.FC<ReplayHudProps> = ({
  replay,
  cameraMode,
  showGuides,
  onTogglePlay,
  onSeek,
  onStep,
  onSetSpeed,
  onSetCameraMode,
  onToggleGuides,
  onExit,
}) => {
  const duration = Math.max(0.1, replay.durationSec);
  const progressPct = Math.min(100, Math.max(0, (replay.currentTimeSec / duration) * 100));
  const scoreColor =
    replay.score >= 90 ? 'text-emerald-400' : replay.score >= 80 ? 'text-amber-300' : 'text-red-400';

  const blurBtn = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    fn();
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4"
      data-testid="replay-hud"
    >
      {/* Top Row: Left Replay Telemetry + Right Exit & Path Minimap */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Replay Status & Telemetry */}
        <div className="pointer-events-auto rounded-xl border border-amber-400/40 bg-[#0e1520]/92 px-4 py-3 shadow-xl">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />
              REPLAY
            </span>
            <span className="text-xs font-bold text-amber-300">
              {COURSES[replay.courseId].title}
            </span>
            <span className="font-mono-num text-[11px] text-slate-400">
              최근 {Math.min(30, Math.round(replay.durationSec))}초 녹화
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-4 border-t border-white/10 pt-2">
            <div>
              <div className="text-[10px] font-semibold text-slate-400">속도</div>
              <div className="font-mono-num text-lg font-extrabold leading-tight text-white">
                {Math.round(replay.speedKmh)}
                <span className="ml-0.5 text-[11px] font-medium text-slate-400">km/h</span>
              </div>
            </div>

            <div className="h-7 w-px bg-white/10" aria-hidden="true" />

            <div>
              <div className="text-[10px] font-semibold text-slate-400">기어</div>
              <div
                className={`font-mono-num text-lg font-extrabold leading-tight ${
                  replay.gear === 'R'
                    ? 'text-red-400'
                    : replay.gear === 'P'
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
                data-testid="replay-gear"
              >
                {replay.gear}
                {replay.handbrake && (
                  <span className="ml-1 text-[10px] font-bold text-red-300">(사이드)</span>
                )}
              </div>
            </div>

            <div className="h-7 w-px bg-white/10" aria-hidden="true" />

            <div>
              <div className="text-[10px] font-semibold text-slate-400">핸들</div>
              <div className="font-mono-num text-xs font-bold text-amber-300 whitespace-nowrap">
                {formatSteerTurns(replay.steerTurns)}
              </div>
            </div>

            <div className="h-7 w-px bg-white/10" aria-hidden="true" />

            <div>
              <div className="text-[10px] font-semibold text-slate-400">당시 점수</div>
              <div className={`font-mono-num text-lg font-extrabold leading-tight ${scoreColor}`}>
                {Math.round(replay.score)}점
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Exit Action + Recorded Path Minimap */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={blurBtn(onExit)}
            className="flex h-10 items-center gap-2 rounded-lg border border-amber-400/50 bg-[#0e1520]/94 px-4 text-xs font-extrabold text-amber-300 shadow-lg hover:bg-amber-500 hover:text-slate-950 whitespace-nowrap transition-colors"
            data-testid="replay-exit-btn"
          >
            <span>리플레이 종료</span>
            <span className="font-mono-num text-[10px] opacity-80">[Esc]</span>
          </button>

          <div className="hidden sm:block">
            <CourseMinimap
              vehicleX={replay.vehicleX}
              vehicleZ={replay.vehicleZ}
              vehicleYaw={replay.vehicleYaw}
              courseId={replay.courseId}
              tConfirmed={replay.tConfirmed}
              trailPoints={replay.trailPoints}
            />
          </div>
        </div>
      </div>

      {/* Bottom Unified Replay Playback & Multi-Camera Dock */}
      <div className="flex justify-center">
        <div className="pointer-events-auto w-full max-w-[960px] rounded-xl border border-white/15 bg-[#0e1520]/94 px-4 py-3 shadow-2xl">
          {/* Timeline Scrubber with Event Markers */}
          <div className="flex items-center gap-3">
            <span
              className="font-mono-num min-w-[56px] text-xs font-bold text-white"
              data-testid="replay-time"
            >
              {formatReplayClock(replay.currentTimeSec)}
            </span>

            <div className="relative flex flex-1 items-center py-1">
              {/* Track visual background */}
              <div className="pointer-events-none relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Playhead thumb dot */}
              <div
                aria-hidden="true"
                style={{ left: `${progressPct}%` }}
                className="pointer-events-none absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-white shadow"
              />

              {/* Event markers overlaid on the timeline */}
              {replay.events.map((ev, idx) => {
                const leftPct = Math.min(100, Math.max(0, (ev.t / duration) * 100));
                const colorClass =
                  ev.type === 'curb-hit'
                    ? 'bg-red-500'
                    : ev.type === 'park-confirm'
                      ? 'bg-emerald-400'
                      : 'bg-amber-300';
                return (
                  <button
                    key={`${ev.type}-${ev.t}-${idx}`}
                    type="button"
                    tabIndex={-1}
                    onClick={blurBtn(() => onSeek(ev.t))}
                    title={`${ev.label} (${formatReplayClock(ev.t)})`}
                    aria-label={`${ev.label} 시점으로 이동 (${formatReplayClock(ev.t)})`}
                    style={{ left: `${leftPct}%` }}
                    className={`absolute top-1/2 z-10 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-slate-950 ${colorClass} hover:scale-125`}
                  />
                );
              })}

              {/* Accessible native range scrubber */}
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={replay.currentTimeSec}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="리플레이 타임라인 탐색"
                data-testid="replay-scrubber"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            <span className="font-mono-num min-w-[56px] text-right text-xs font-semibold text-slate-400">
              {formatReplayClock(replay.durationSec)}
            </span>
          </div>

          {/* Controls Row: Transport + Speed + Multi-Angle Camera Selector + Guide */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
            {/* Transport & Speed */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={blurBtn(() => onStep(-3))}
                aria-label="3초 뒤로"
                title="3초 뒤로 [←]"
                className="font-mono-num h-9 rounded-lg border border-white/15 bg-[#152030] px-2.5 text-xs font-bold text-slate-200 hover:border-amber-400 hover:text-white whitespace-nowrap"
              >
                -3초
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={blurBtn(onTogglePlay)}
                aria-label={replay.isPlaying ? '리플레이 일시정지 (Space)' : '리플레이 재생 (Space)'}
                data-testid="replay-play-toggle"
                className="flex h-9 min-w-[82px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-extrabold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
              >
                {replay.isPlaying ? '일시정지' : '재생'}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={blurBtn(() => onStep(3))}
                aria-label="3초 앞으로"
                title="3초 앞으로 [→]"
                className="font-mono-num h-9 rounded-lg border border-white/15 bg-[#152030] px-2.5 text-xs font-bold text-slate-200 hover:border-amber-400 hover:text-white whitespace-nowrap"
              >
                +3초
              </button>

              <div
                className="ml-1 flex items-center rounded-lg border border-white/10 bg-[#152030] p-0.5"
                role="group"
                aria-label="재생 배속"
              >
                {REPLAY_SPEEDS.map((spd) => {
                  const active = replay.speed === spd;
                  return (
                    <button
                      key={spd}
                      type="button"
                      tabIndex={-1}
                      onClick={blurBtn(() => onSetSpeed(spd))}
                      aria-pressed={active}
                      className={`font-mono-num h-8 rounded-md px-2 text-xs font-bold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Multi-Angle Camera Switcher + Guide Overlay Toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex flex-wrap items-center rounded-lg border border-white/10 bg-[#152030] p-0.5"
                role="group"
                aria-label="리플레이 카메라 시점 선택"
              >
                {REPLAY_CAMERAS.map((cam) => {
                  const active = cameraMode === cam.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      tabIndex={-1}
                      onClick={blurBtn(() => onSetCameraMode(cam.id))}
                      aria-pressed={active}
                      className={`h-8 rounded-md px-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
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
        </div>
      </div>
    </div>
  );
};
