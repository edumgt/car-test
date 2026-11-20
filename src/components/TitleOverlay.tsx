import React from 'react';
import { COURSE_LIST } from '../sim/courseData';
import type { CourseId } from '../sim/types';

interface TitleOverlayProps {
  selectedCourse: CourseId;
  onSelectCourse: (courseId: CourseId) => void;
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedCourse,
  onSelectCourse,
  onStart,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10">
      {/* Asymmetric Left-Third Editorial Lockup over sunlit 3D practice yard */}
      <div className="pointer-events-auto mt-4 max-w-md rounded-xl border border-white/12 bg-[#0e1520]/90 p-6 shadow-2xl">
        {/* Bespoke inline SVG Korean Driving Test Emblem + Title */}
        <div className="flex items-center gap-3.5">
          <svg
            viewBox="0 0 48 48"
            className="h-12 w-12 shrink-0"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="44" height="44" rx="10" fill="#13233b" stroke="#f59e0b" strokeWidth="2.5" />
            <path d="M12 15h24v4.5H26.5V35h-5V19.5H12V15Z" fill="#f8fafc" />
            <path d="M31 24.5c2.8 0 5 1.8 5 4.2 0 2.5-2.1 4.3-5.2 4.3h-1.8v-2.6h1.6c1.5 0 2.4-.7 2.4-1.7 0-1-.9-1.6-2.4-1.6H29v-2.6h2Z" fill="#f59e0b" />
          </svg>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white md:text-[26px] leading-tight">
              운전면허 장내기능 연습장
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-300">
              T코스 직각주차 · S코스 굴절곡선 집중 시뮬레이터
            </p>
          </div>
        </div>

        {/* Course Selection (Interactive Segmented Buttons) */}
        <div className="mt-6 space-y-2" role="radiogroup" aria-label="연습 코스 선택">
          {COURSE_LIST.map((course) => {
            const active = selectedCourse === course.id;
            return (
              <button
                key={course.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectCourse(course.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-amber-400 bg-amber-500/15 text-white'
                    : 'border-white/10 bg-[#16202e]/85 text-slate-300 hover:border-white/25 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold whitespace-nowrap">{course.title}</span>
                  <span className="font-mono-num text-[11px] font-semibold text-amber-300 whitespace-nowrap">
                    {course.id === 't-course' ? '제한 2분' : course.id === 's-course' ? '곡선 주행' : '연속 평가'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {course.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {/* Primary Start CTA */}
        <div className="mt-6">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full rounded-lg bg-amber-500 px-5 py-3.5 text-base font-extrabold text-slate-950 transition-transform hover:bg-amber-400 active:scale-[0.99] whitespace-nowrap"
          >
            연습 시작하기
          </button>
        </div>

        {/* Concise Rules Summary (unboxed typography) */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-slate-400">
          <span>합격 기준 80점 / 100점</span>
          <span aria-hidden="true">·</span>
          <span>검지선 접촉 -10점</span>
          <span aria-hidden="true">·</span>
          <span>20km/h 제한</span>
        </div>
      </div>

      {/* Bottom Safe Margin: Flat Single-Line Control Hint */}
      <div className="flex justify-center">
        <p className="hud-stroke text-center text-xs font-medium tracking-wide text-slate-100">
          WASD / 방향키 주행 · R / D / P 기어 · Space 주차브레이크 · V 시점전환 · G 가이드 · Enter 시작
        </p>
      </div>
    </div>
  );
};
