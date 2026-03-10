"use client";

import { useState, useCallback, useEffect } from "react";
import {
  initializeGemini,
  clearGemini,
  isGeminiInitialized,
  requestShiftAssignment,
  validateApiKey,
} from "@/lib/gemini/client";
import { useGeminiApiKey } from "./use-local-storage";
import type {
  GeminiShiftRequest,
  GeminiShiftResponse,
  AutoAssignPreview,
} from "@/lib/gemini/types";

export interface UseGeminiApiReturn {
  // APIキー管理
  apiKey: string | null;
  isApiKeySet: boolean;
  isValidating: boolean;
  setApiKey: (key: string) => Promise<boolean>;
  clearApiKey: () => void;

  // シフト割り振り
  isLoading: boolean;
  error: string | null;
  preview: AutoAssignPreview | null;
  requestAssignment: (request: GeminiShiftRequest) => Promise<GeminiShiftResponse | null>;
  clearPreview: () => void;
}

export function useGeminiApi(): UseGeminiApiReturn {
  const [storedApiKey, saveApiKey, removeApiKey, isLoaded] = useGeminiApiKey();
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AutoAssignPreview | null>(null);

  // 保存済みAPIキーでの初期化
  useEffect(() => {
    if (isLoaded && storedApiKey && !isGeminiInitialized()) {
      initializeGemini(storedApiKey);
    }
  }, [isLoaded, storedApiKey]);

  // APIキーを設定（検証付き）
  const setApiKey = useCallback(
    async (key: string): Promise<boolean> => {
      setIsValidating(true);
      setError(null);

      try {
        const isValid = await validateApiKey(key);
        if (isValid) {
          saveApiKey(key);
          initializeGemini(key);
          return true;
        } else {
          setError("無効なAPIキーです。Google AI StudioでAPIキーを確認してください。");
          return false;
        }
      } catch (err) {
        setError("APIキーの検証中にエラーが発生しました。");
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [saveApiKey]
  );

  // APIキーをクリア
  const clearApiKey = useCallback(() => {
    removeApiKey();
    clearGemini();
    setError(null);
    setPreview(null);
  }, [removeApiKey]);

  // シフト割り振りリクエスト
  const requestAssignment = useCallback(
    async (request: GeminiShiftRequest): Promise<GeminiShiftResponse | null> => {
      if (!isGeminiInitialized()) {
        setError("APIキーが設定されていません。");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await requestShiftAssignment(request);

        // プレビューデータを構築
        setPreview({
          date: request.date,
          beforeCoverage: calculateCoverage(request.gaps, false),
          afterCoverage: calculateCoverage(request.gaps, true, response),
          proposedShifts: response.proposedShifts,
          unfilledSlots: response.unfilledSlots,
          isLoading: false,
          error: null,
        });

        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "シフト割り振り中にエラーが発生しました。";
        setError(message);
        setPreview(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // プレビューをクリア
  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return {
    apiKey: storedApiKey,
    isApiKeySet: Boolean(storedApiKey),
    isValidating,
    setApiKey,
    clearApiKey,
    isLoading,
    error,
    preview,
    requestAssignment,
    clearPreview,
  };
}

// カバー率計算
function calculateCoverage(
  gaps: GeminiShiftRequest["gaps"],
  afterAssignment: boolean,
  response?: GeminiShiftResponse
): number {
  if (gaps.length === 0) return 100;

  const totalRequired = gaps.reduce((sum, g) => sum + g.required, 0);
  const totalCurrent = gaps.reduce((sum, g) => sum + g.current, 0);

  if (!afterAssignment) {
    // 適用前
    return Math.round((totalCurrent / totalRequired) * 100);
  }

  // 適用後（提案シフトを考慮）
  if (!response) return Math.round((totalCurrent / totalRequired) * 100);

  // 簡易計算: 提案シフト数に基づいて改善を推定
  const improvement = response.summary.coverageImprovement || 0;
  const beforeCoverage = Math.round((totalCurrent / totalRequired) * 100);
  return Math.min(100, beforeCoverage + improvement);
}
