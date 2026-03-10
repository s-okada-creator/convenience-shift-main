"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, ExternalLink, Loader2, Eye, EyeOff, Trash2 } from "lucide-react";

interface ApiKeySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentApiKey: string | null;
  isValidating: boolean;
  onSave: (apiKey: string) => Promise<boolean>;
  onClear: () => void;
}

export function ApiKeySettingsDialog({
  open,
  onOpenChange,
  currentApiKey,
  isValidating,
  onSave,
  onClear,
}: ApiKeySettingsDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError("APIキーを入力してください");
      return;
    }

    setError(null);
    const success = await onSave(apiKey.trim());

    if (success) {
      setApiKey("");
      onOpenChange(false);
    } else {
      setError("APIキーの検証に失敗しました。正しいキーを入力してください。");
    }
  };

  const handleClear = () => {
    onClear();
    setApiKey("");
    setError(null);
  };

  const handleClose = () => {
    setApiKey("");
    setError(null);
    onOpenChange(false);
  };

  const maskedKey = currentApiKey
    ? `${currentApiKey.slice(0, 8)}...${currentApiKey.slice(-4)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Gemini API設定
          </DialogTitle>
          <DialogDescription>
            自動シフト割り振り機能を使用するには、Google AI StudioのAPIキーが必要です。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 現在のAPIキー表示 */}
          {currentApiKey && (
            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">設定済みのAPIキー</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {maskedKey}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* APIキー入力 */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {currentApiKey ? "新しいAPIキー" : "APIキー"}
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                placeholder="AIza..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Google AI Studioへのリンク */}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Google AI StudioでAPIキーを取得
          </a>

          {/* 注意事項 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">セキュリティについて</p>
            <p className="text-amber-700 mt-1">
              APIキーはお使いのブラウザのローカルストレージにのみ保存され、サーバーには送信されません。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isValidating || !apiKey.trim()}>
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                検証中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
