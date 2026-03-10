'use client';

import { memo } from 'react';

export const ShiftLegend = memo(function ShiftLegend() {
  return (
    <div className="flex flex-wrap items-center gap-6 pt-4 mt-4 border-t border-[#E5E5EA]">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-[#007AFF] rounded" />
        <span className="text-sm text-[#86868B]">シフト（ドラッグで移動、端をドラッグでリサイズ）</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-[#FF9500] rounded" />
        <span className="text-sm text-[#86868B]">残業（8h超）</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-[#34C759]/20 border border-[#34C759]/30 rounded" />
        <span className="text-sm text-[#86868B]">勤務可能</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-[#F5F5F7] border border-[#E5E5EA] rounded" />
        <span className="text-sm text-[#86868B]">勤務不可</span>
      </div>
    </div>
  );
});
