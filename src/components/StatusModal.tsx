import React from 'react';
import { COURSES } from '../sim/courseData';
import type { CourseId, HudSnapshot } from '../sim/types';

interface PauseModalProps {
  courseId: CourseId;
  canReplay: boolean;
  onResume: () => void;
  onWatchReplay: () => void;
  onRestart: () => void;
  onGoTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  courseId,
  canReplay,
  onResume,
  onWatchReplay,
  onRestart,
  onGoTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0f1620] p-6 shadow-2xl">
        <div className="text-xs font-semibold text-amber-400">{COURSES[courseId].title}</div>
        <h2 id="pause-title" className="mt-1 font-display text-2xl font-extrabold text-white">
          일시정지
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          WASD / 방향키 주행 · R/D/P 기어 변속 · Space 주차브레이크 · V 시점 전환 · G 공식 가이드
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-400"
          >
            계속 연습하기
          </button>
          {canReplay && (
            <button
              type="button"
              onClick={onWatchReplay}
              className="w-full rounded-lg border border-sky-400/50 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-200 hover:bg-sky-500/25"
            >
              최근 30초 리플레이 보기
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="w-full rounded-lg border border-white/15 bg-[#182230] px-4 py-2.5 text-sm font-bold text-slate-100 hover:border-white/30"
          >
            현재 코스 다시 시작
          </button>
          <button
            type="button"
            onClick={onGoTitle}
            className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:text-white"
          >
            처음 화면으로
          </button>
        </div>
      </div>
    </div>
  );
};

interface ResultModalProps {
  snapshot: HudSnapshot;
  canReplay: boolean;
  onWatchReplay: () => void;
  onRetry: () => void;
  onNextCourse: (nextId: CourseId) => void;
  onGoTitle: () => void;
}

function getNextCourseId(current: CourseId): CourseId {
  if (current === 't-course') return 's-course';
  if (current === 's-course') return 'combined';
  return 't-course';
}

export const ResultModal: React.FC<ResultModalProps> = ({
  snapshot,
  canReplay,
  onWatchReplay,
  onRetry,
  onNextCourse,
  onGoTitle,
}) => {
  const nextId = getNextCourseId(snapshot.courseId);
  const passed = snapshot.passed;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0f1620] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">
            {COURSES[snapshot.courseId].title} 결과표
          </span>
          <span
            className={`font-mono-num text-xs font-extrabold ${
              passed ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {passed ? '합격 기준 충족 (80점 이상)' : snapshot.failReason ?? '불합격'}
          </span>
        </div>

        <h2
          id="result-title"
          className={`mt-2 font-display text-3xl font-extrabold ${
            passed ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {passed ? '합격 (PASS)' : '불합격 (FAIL)'}
        </h2>

        {/* 3 Frozen Run Metric Tiles */}
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-white/10 bg-[#152030] p-3 text-center">
            <div className="text-[11px] text-slate-400">최종 점수</div>
            <div className="mt-1 font-mono-num text-xl font-extrabold text-white">
              {Math.round(snapshot.score)}점
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#152030] p-3 text-center">
            <div className="text-[11px] text-slate-400">소요 시간</div>
            <div className="mt-1 font-mono-num text-xl font-extrabold text-white">
              {Math.round(snapshot.elapsedSec)}초
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#152030] p-3 text-center">
            <div className="text-[11px] text-slate-400">검지선 접촉</div>
            <div className="mt-1 font-mono-num text-xl font-extrabold text-white">
              {snapshot.curbHits}회
            </div>
          </div>
        </div>

        {/* Itemized Deductions */}
        <div className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-[#121b28] p-3">
          <div className="text-[11px] font-semibold text-slate-400">감점 내역</div>
          {snapshot.deductions.length === 0 ? (
            <p className="mt-1.5 text-xs font-medium text-emerald-300">
              무감점 완벽 주행입니다!
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {snapshot.deductions.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-200">{d.reason}</span>
                  <span className="font-mono-num font-bold text-red-400">-{d.points}점</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {canReplay && (
            <button
              type="button"
              onClick={onWatchReplay}
              className="w-full rounded-lg border border-sky-400/50 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-200 hover:bg-sky-500/25"
            >
              최근 30초 주행 리플레이 다시보기
            </button>
          )}
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              data-start="true"
              onClick={onRetry}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
            >
              다시 연습하기
            </button>
            <button
              type="button"
              onClick={() => onNextCourse(nextId)}
              className="flex-1 rounded-lg border border-white/15 bg-[#182230] px-4 py-3 text-sm font-bold text-white hover:border-amber-400 whitespace-nowrap"
            >
              {COURSES[nextId].shortTitle} 도전
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoTitle}
          className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-slate-400 hover:text-white"
        >
          처음 화면으로
        </button>
      </div>
    </div>
  );
};
