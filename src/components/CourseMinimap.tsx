import React, { useEffect, useRef } from 'react';
import { CURB_SEGMENTS, S_COURSE_GEOMETRY, T_COURSE_LAYOUT } from '../sim/courseData';
import type { CourseId, Vec2 } from '../sim/types';

interface CourseMinimapProps {
  vehicleX: number;
  vehicleZ: number;
  vehicleYaw: number;
  courseId: CourseId;
  tConfirmed: boolean;
  trailPoints?: Vec2[];
}

export const CourseMinimap: React.FC<CourseMinimapProps> = ({
  vehicleX,
  vehicleZ,
  vehicleYaw,
  courseId,
  tConfirmed,
  trailPoints,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background asphalt
    ctx.fillStyle = '#141b24';
    ctx.fillRect(0, 0, w, h);

    // Map world [-32..+34] x [-28..+24] into minimap
    const mapX = (wx: number) => ((wx + 32) / 66) * (w - 16) + 8;
    const mapZ = (wz: number) => ((wz + 28) / 52) * (h - 16) + 8;

    // Draw T-course confirmation bay
    const pad = T_COURSE_LAYOUT.confirmLineZone;
    ctx.fillStyle = tConfirmed ? 'rgba(16, 185, 129, 0.45)' : 'rgba(56, 189, 248, 0.28)';
    ctx.fillRect(
      mapX(pad.minX),
      mapZ(pad.minZ),
      mapX(pad.maxX) - mapX(pad.minX),
      mapZ(pad.maxZ) - mapZ(pad.minZ)
    );

    // Draw S-course centerline subtly
    ctx.beginPath();
    ctx.strokeStyle = courseId === 's-course' || courseId === 'combined' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1.5;
    S_COURSE_GEOMETRY.centerline.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(mapX(pt.x), mapZ(pt.z));
      else ctx.lineTo(mapX(pt.x), mapZ(pt.z));
    });
    ctx.stroke();

    // Draw all curb sensor segments
    for (const seg of CURB_SEGMENTS) {
      const isActive =
        courseId === 'combined' ||
        (courseId === 't-course' && seg.course === 't-course') ||
        (courseId === 's-course' && seg.course === 's-course');
      ctx.beginPath();
      ctx.strokeStyle = isActive ? '#f5c418' : 'rgba(245, 196, 24, 0.25)';
      ctx.lineWidth = isActive ? 2.2 : 1.2;
      ctx.moveTo(mapX(seg.ax), mapZ(seg.az));
      ctx.lineTo(mapX(seg.bx), mapZ(seg.bz));
      ctx.stroke();
    }

    // Draw recorded replay trajectory trail if provided
    if (trailPoints && trailPoints.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      trailPoints.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(mapX(pt.x), mapZ(pt.z));
        else ctx.lineTo(mapX(pt.x), mapZ(pt.z));
      });
      ctx.stroke();
    }

    // Labels for T and S sectors
    ctx.font = '700 10px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('T', mapX(-18), mapZ(-19));
    ctx.fillText('S', mapX(16), mapZ(-23));

    // Draw vehicle icon oriented to vehicleYaw (0 = North = -Y on canvas)
    const vx = mapX(vehicleX);
    const vz = mapZ(vehicleZ);
    ctx.save();
    ctx.translate(vx, vz);
    ctx.rotate(-vehicleYaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.fillRect(-3.6, -6.4, 7.2, 12.8);
    ctx.strokeRect(-3.6, -6.4, 7.2, 12.8);
    // Front directional tip
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-2.6, -6.2, 5.2, 2.8);
    ctx.restore();
  }, [vehicleX, vehicleZ, vehicleYaw, courseId, tConfirmed, trailPoints]);

  return (
    <div
      className="rounded-lg border border-white/15 bg-[#0f1620]/90 p-1.5 shadow-lg"
      aria-label="연습장 코스 미니맵"
    >
      <canvas
        ref={canvasRef}
        width={156}
        height={120}
        className="block rounded"
        data-testid="course-minimap"
      />
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>T코스 (서)</span>
        <span>S코스 (동)</span>
      </div>
    </div>
  );
};
