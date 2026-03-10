'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Save, Trash2, Clock, AlertCircle } from 'lucide-react';
import { TIME_SLOTS } from '@/lib/time-constants';
import type { Staff, Shift, AvailabilityPattern } from '../types';

interface ShiftEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStaff?: Staff;
  editingAvailability: AvailabilityPattern | null;
  editStartTime: string;
  setEditStartTime: (time: string) => void;
  editEndTime: string;
  setEditEndTime: (time: string) => void;
  saving: boolean;
  existingShift: Shift | undefined;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export const ShiftEditDialog = memo(function ShiftEditDialog({
  open,
  onOpenChange,
  editingStaff,
  editingAvailability,
  editStartTime,
  setEditStartTime,
  editEndTime,
  setEditEndTime,
  saving,
  existingShift,
  onSave,
  onDelete,
}: ShiftEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#007AFF]" />
            {editingStaff?.name}さんのシフト
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {editingAvailability ? (
            <div className="p-3 bg-[#34C759]/10 rounded-xl">
              <p className="text-sm text-[#34C759]">
                勤務可能時間: {editingAvailability.startTime} 〜 {editingAvailability.endTime}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-[#FF3B30]/10 rounded-xl">
              <p className="text-sm text-[#FF3B30] flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                この曜日は勤務可能時間が設定されていません
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[#1D1D1F] mb-2 block">開始時間</label>
              <Select value={editStartTime} onValueChange={setEditStartTime}>
                <SelectTrigger className="border-[#E5E5EA]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#1D1D1F] mb-2 block">終了時間</label>
              <Select value={editEndTime} onValueChange={setEditEndTime}>
                <SelectTrigger className="border-[#E5E5EA]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {existingShift && (
            <Button
              variant="outline"
              onClick={onDelete}
              disabled={saving}
              className="text-[#FF3B30] hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] border-[#E5E5EA]"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              削除
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#E5E5EA]"
            >
              キャンセル
            </Button>
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-[#007AFF] hover:bg-[#0056b3] text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
