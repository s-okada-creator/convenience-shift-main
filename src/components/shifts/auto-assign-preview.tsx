"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  User,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Check,
  Loader2,
  TrendingUp,
  Clock,
} from "lucide-react";
import type { ProposedShift, UnfilledSlot } from "@/lib/gemini/types";

// シフト時間が8時間を超えているかチェック
function isOvertimeShift(startTime: string, endTime: string): boolean {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = endMinutes - startMinutes;
  return duration > 8 * 60;
}

// シフト時間を計算（時間単位）
function getShiftDuration(startTime: string, endTime: string): string {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes = endMinutes - startMinutes;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
}

interface AutoAssignPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  beforeCoverage: number;
  afterCoverage: number;
  proposedShifts: ProposedShift[];
  unfilledSlots: UnfilledSlot[];
  isLoading: boolean;
  isApplying: boolean;
  onRecalculate: () => void;
  onApply: () => void;
}

export function AutoAssignPreviewDialog({
  open,
  onOpenChange,
  date,
  beforeCoverage,
  afterCoverage,
  proposedShifts,
  unfilledSlots,
  isLoading,
  isApplying,
  onRecalculate,
  onApply,
}: AutoAssignPreviewDialogProps) {
  const coverageImprovement = afterCoverage - beforeCoverage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            自動シフト割り振りプレビュー
          </DialogTitle>
          <DialogDescription>
            {date} のシフト提案
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              AIがシフトを分析中...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* カバー率サマリー */}
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">カバー率</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{beforeCoverage}%</span>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-lg font-bold text-green-600">
                    {afterCoverage}%
                  </span>
                  {coverageImprovement > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      +{coverageImprovement}%
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* 提案シフト一覧 */}
            {proposedShifts.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">提案されたシフト</h4>
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {proposedShifts.map((shift, index) => {
                    const isOvertime = isOvertimeShift(shift.startTime, shift.endTime);
                    const duration = getShiftDuration(shift.startTime, shift.endTime);

                    return (
                      <div
                        key={index}
                        className={`rounded-lg border p-3 space-y-1 ${
                          isOvertime ? "border-orange-300 bg-orange-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{shift.staffName}</span>
                          <div className="ml-auto flex items-center gap-2">
                            {isOvertime && (
                              <Badge variant="outline" className="border-orange-400 bg-orange-100 text-orange-700 text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                残業
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={isOvertime ? "border-orange-400 text-orange-700" : ""}
                            >
                              {shift.startTime}〜{shift.endTime}（{duration}）
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{shift.reason}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                提案できるシフトがありません
              </div>
            )}

            {/* 未充足スロット */}
            {unfilledSlots.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  充足できなかった時間帯
                </h4>
                <div className="space-y-1">
                  {unfilledSlots.map((slot, index) => (
                    <div
                      key={index}
                      className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-sm"
                    >
                      <span className="font-medium text-amber-800">
                        {slot.timeRange}
                      </span>
                      <span className="text-amber-700 ml-2">
                        - {slot.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onRecalculate}
            disabled={isLoading || isApplying}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            再計算
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            キャンセル
          </Button>
          <Button
            onClick={onApply}
            disabled={
              isLoading || isApplying || proposedShifts.length === 0
            }
          >
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                適用中...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                適用
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
