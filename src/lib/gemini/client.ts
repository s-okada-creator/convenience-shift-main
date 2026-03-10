import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { GeminiShiftRequest, GeminiShiftResponse } from "./types";

// Gemini APIクライアントのシングルトン
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

export function initializeGemini(apiKey: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2, // 安定した出力のため低めに設定
    },
  });
}

export function isGeminiInitialized(): boolean {
  return model !== null;
}

export function clearGemini(): void {
  genAI = null;
  model = null;
}

// シフト割り振りリクエストを送信
export async function requestShiftAssignment(
  request: GeminiShiftRequest
): Promise<GeminiShiftResponse> {
  if (!model) {
    throw new Error("Gemini APIが初期化されていません。APIキーを設定してください。");
  }

  const prompt = buildPrompt(request);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // JSONパース
    const parsed = JSON.parse(text) as GeminiShiftResponse;
    return validateResponse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Gemini APIからの応答をパースできませんでした。再度お試しください。");
    }
    throw error;
  }
}

// プロンプト構築
function buildPrompt(request: GeminiShiftRequest): string {
  const dayNames = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

  return `あなたはコンビニのシフト管理アシスタントです。以下の条件に基づいて、最適なシフト割り当てを提案してください。

## 対象日
${request.date}（${request.dayOfWeek}）

## 人員不足時間帯
${formatGaps(request.gaps)}

## 勤務可能なスタッフ
${formatAvailableStaff(request.availableStaff)}

## 既存シフト（重複不可）
${formatExistingShifts(request.existingShifts)}

## 制約条件（必須）
1. 1人あたりのシフトは最長8時間まで（労働基準法に準拠、絶対厳守）
2. スタッフの勤務可能時間内でのみ割り当て
3. 既存シフトと時間が重複するスタッフには割り当てない
4. 最低シフト時間は3時間以上

## 割り当て方針
- 社員とアルバイトをバランスよく配置（各時間帯に混在が望ましい）
- 複数のスタッフで時間帯を分担し、1人に負担を集中させない
- 全ての不足を埋められなくても、可能な範囲で提案する
- 朝・昼・夕・夜で異なるスタッフを配置し、シフトを分散させる

## 出力形式
以下のJSON形式で回答してください:
{
  "proposedShifts": [
    {
      "staffId": "スタッフID",
      "staffName": "スタッフ名",
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "reason": "割り当て理由（日本語で簡潔に）"
    }
  ],
  "unfilledSlots": [
    {
      "timeRange": "HH:mm-HH:mm",
      "reason": "充足できなかった理由（日本語で簡潔に）"
    }
  ],
  "summary": {
    "totalProposed": 提案シフト数,
    "coverageImprovement": カバー率改善（パーセント）
  }
}

もし勤務可能なスタッフがいない、または全ての不足を埋められない場合は、unfilledSlotsに理由を記載してください。`;
}

function formatGaps(gaps: GeminiShiftRequest["gaps"]): string {
  if (gaps.length === 0) {
    return "なし（全時間帯充足済み）";
  }

  return gaps
    .map(g => {
      const time = `${String(g.hour).padStart(2, "0")}:${String(g.minute).padStart(2, "0")}`;
      return `- ${time}: 必要${g.required}人、現在${g.current}人、不足${g.shortage}人`;
    })
    .join("\n");
}

function formatAvailableStaff(staff: GeminiShiftRequest["availableStaff"]): string {
  if (staff.length === 0) {
    return "なし";
  }

  return staff
    .map(s => {
      const type = s.employmentType === 'employee' ? '社員' : 'アルバイト';
      return `- ${s.name}（ID: ${s.id}、${type}）: ${s.availableFrom}〜${s.availableTo}`;
    })
    .join("\n");
}

function formatExistingShifts(shifts: GeminiShiftRequest["existingShifts"]): string {
  if (shifts.length === 0) {
    return "なし";
  }

  return shifts
    .map(s => `- ${s.staffName}: ${s.from}〜${s.to}`)
    .join("\n");
}

// レスポンスのバリデーション
function validateResponse(response: GeminiShiftResponse): GeminiShiftResponse {
  // 必須フィールドの確認
  if (!response.proposedShifts) {
    response.proposedShifts = [];
  }
  if (!response.unfilledSlots) {
    response.unfilledSlots = [];
  }
  if (!response.summary) {
    response.summary = {
      totalProposed: response.proposedShifts.length,
      coverageImprovement: 0,
    };
  }

  // 各シフトのバリデーション
  response.proposedShifts = response.proposedShifts.filter(shift => {
    return (
      shift.staffId &&
      shift.staffName &&
      isValidTimeFormat(shift.startTime) &&
      isValidTimeFormat(shift.endTime)
    );
  });

  return response;
}

function isValidTimeFormat(time: string): boolean {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

// APIキーの検証（簡易）
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const tempGenAI = new GoogleGenerativeAI(apiKey);
    const tempModel = tempGenAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    // 簡単なテストリクエスト
    const result = await tempModel.generateContent("Hello");
    return result.response.text().length > 0;
  } catch {
    return false;
  }
}
