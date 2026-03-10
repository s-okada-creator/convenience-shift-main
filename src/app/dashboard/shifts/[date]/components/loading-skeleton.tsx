'use client';

import { memo } from 'react';

export const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-8 bg-[#E5E5EA] rounded-xl w-full" />
      {[...Array(10)].map((_, i) => (
        <div key={i} className="h-6 bg-[#E5E5EA] rounded-xl" />
      ))}
    </div>
  );
});
