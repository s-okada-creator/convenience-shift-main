"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Settings, Loader2 } from "lucide-react";

interface AutoAssignButtonProps {
  onAutoAssign: () => void;
  onOpenSettings: () => void;
  isLoading: boolean;
  isApiKeySet: boolean;
  disabled?: boolean;
}

export function AutoAssignButton({
  onAutoAssign,
  onOpenSettings,
  isLoading,
  isApiKeySet,
  disabled = false,
}: AutoAssignButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // APIキーが未設定の場合は設定を促す
  if (!isApiKeySet) {
    return (
      <Button
        variant="outline"
        onClick={onOpenSettings}
        disabled={disabled}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        自動割り振り設定
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="default"
        disabled={disabled || isLoading}
        onClick={() => setMenuOpen(true)}
        className="gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            処理中...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            自動割り振り
          </>
        )}
      </Button>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              自動割り振り
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Button
              variant="default"
              onClick={() => {
                setMenuOpen(false);
                onAutoAssign();
              }}
              disabled={isLoading}
              className="justify-start gap-3"
            >
              <Sparkles className="h-4 w-4" />
              シフトを自動提案
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings();
              }}
              className="justify-start gap-3"
            >
              <Settings className="h-4 w-4" />
              API設定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
