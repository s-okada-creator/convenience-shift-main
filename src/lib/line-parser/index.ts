/**
 * LINEトーク履歴パーサー
 *
 * LINEグループのトーク履歴テキストから、指定期間のシフト希望を抽出する。
 * Gemini API不要 — 正規表現ベースで高速・無料・正確。
 */

// --- 型定義 ---

export interface ParsedEntry {
  day: number;
  available: boolean;
  startTime?: string; // "HH:mm"
  endTime?: string;   // "HH:mm"
  note?: string;      // 「週3で」等の補足
}

export interface ParsedStaff {
  name: string;
  lineName: string; // LINE表示名
  entries: ParsedEntry[];
  constraints?: string[]; // 「週3くらいで」等
  rawText: string; // 元テキスト（デバッグ用）
}

export interface ParseResult {
  period: { year: number; month: number; half: 'first' | 'second' };
  staff: ParsedStaff[];
  warnings: string[];
}

// --- 定型シフト名→時間変換 ---

const SHIFT_NAME_MAP: Record<string, { start: string; end: string }> = {
  '夕勤': { start: '17:00', end: '21:45' },
  '夜勤前半': { start: '21:45', end: '02:00' },
  '夜勤後半': { start: '02:00', end: '06:00' },
  '夜勤': { start: '21:45', end: '06:00' },
  '早朝': { start: '06:00', end: '09:00' },
  '日勤': { start: '09:00', end: '17:00' },
};

// --- ユーティリティ ---

/** ×系の文字をすべて判定 */
function isUnavailableMark(s: string): boolean {
  // invisible characters and various X marks
  const cleaned = s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u2060\u00AD]/g, '').trim();
  if (!cleaned) return false;
  return /^[×✕❌✗✘⨉⨯xX]+$/.test(cleaned);
}

/** ○系の文字をすべて判定 */
function isAvailableMark(s: string): boolean {
  const cleaned = s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u2060\u00AD]/g, '').trim();
  if (!cleaned) return false;
  return /^[○⚪︎〇⭕️◯⚪]+$/.test(cleaned);
}

/** "9" → "09:00", "17" → "17:00", "9:30" → "09:30", "2145" → "21:45" */
function normalizeTime(raw: string): string {
  let s = raw.replace(/[時：]/g, ':').replace(/分/g, '').trim();

  // "2145" → "21:45"
  if (/^\d{3,4}$/.test(s) && !s.includes(':')) {
    if (s.length === 3) s = '0' + s;
    return s.slice(0, 2) + ':' + s.slice(2);
  }

  // "9" → "09:00"
  if (/^\d{1,2}$/.test(s)) {
    return s.padStart(2, '0') + ':00';
  }

  // "9:00" → "09:00"
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return h.padStart(2, '0') + ':' + m;
  }

  return s;
}

/** 開始時刻のみの場合の終了時刻を推定 */
function inferEndTime(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10);
  if (hour >= 22 || (hour === 21 && parseInt(startTime.split(':')[1] || '0', 10) >= 45)) return '06:00'; // 夜勤
  if (hour >= 17) return '21:45'; // 夕勤
  if (hour >= 13) return '17:00';
  if (hour >= 9) return '17:00';
  if (hour >= 6) return '09:00';
  if (hour >= 0 && hour < 6) return '06:00';
  return '17:00';
}

// --- 日付ヘッダー解析 ---

/** "2026/3/18(水)" → { year: 2026, month: 3, day: 18 } */
function parseDateHeader(line: string): { year: number; month: number; day: number } | null {
  const m = line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[（(]/);
  if (!m) return null;
  return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
}

// --- 個人のシフト希望パース ---

/** 1行の日エントリをパース: "2（木）9-17" → ParsedEntry */
function parseDayEntry(line: string): ParsedEntry | null {
  // invisible characters除去
  const cleaned = line.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u2060\u00AD]/g, '');

  // 先頭の日番号を取得: "2（木）..." or "2日(木)..."
  const dayMatch = cleaned.match(/^\s*(\d{1,2})\s*[日]?\s*[（(]\s*[日月火水木金土祝]*\s*[）)]\s*(.*)/);
  if (!dayMatch) return null;

  const day = parseInt(dayMatch[1]);
  if (day < 1 || day > 31) return null;
  let rest = dayMatch[2].trim();

  // 不可マーク
  if (!rest || isUnavailableMark(rest)) {
    return { day, available: false };
  }

  // 定型シフト名
  for (const [name, times] of Object.entries(SHIFT_NAME_MAP)) {
    if (rest.includes(name)) {
      return { day, available: true, startTime: times.start, endTime: times.end };
    }
  }

  // ○マークのみ（時間なし）
  if (isAvailableMark(rest)) {
    return { day, available: true };
  }

  // ○マーク + 時間: "○17時～21時45分" or "○ 21時45分～"
  rest = rest.replace(/^[○⚪︎〇⭕️◯⚪]\s*/, '');

  // 時間範囲パース
  const timeEntry = parseTimeRange(rest);
  if (timeEntry) {
    return { day, available: true, ...timeEntry };
  }

  // パースできなかった場合
  if (rest.length > 0 && !isUnavailableMark(rest)) {
    return { day, available: true, note: rest };
  }

  return { day, available: false };
}

/** 時間範囲の文字列をパース */
function parseTimeRange(text: string): { startTime: string; endTime?: string } | null {
  let s = text.trim();

  // 全角→半角、各種ハイフン統一
  s = s.replace(/[〜～―ー−–—]/g, '-').replace(/[：]/g, ':');

  // "17時45分" → "17:45", "17時" → "17:00"
  s = s.replace(/(\d{1,2})時(\d{1,2})分/g, '$1:$2');
  s = s.replace(/(\d{1,2})時/g, '$1:00');

  // "17-2145" or "17:00-21:45" or "9-17"
  const rangeMatch = s.match(/(\d{1,2}(?::\d{2})?(?:\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?(?:\d{2})?)/);
  if (rangeMatch) {
    const start = normalizeTime(rangeMatch[1]);
    const end = normalizeTime(rangeMatch[2]);
    return { startTime: start, endTime: end };
  }

  // 開始時刻のみ: "17:00" or "17時〜" → 末尾の "-" はすでに除去済み
  const startOnly = s.match(/^(\d{1,2}(?::\d{2})?)\s*-?\s*$/);
  if (startOnly) {
    const start = normalizeTime(startOnly[1]);
    return { startTime: start, endTime: inferEndTime(start) };
  }

  return null;
}

/** 「不可日 1.5.8.12.15」パターン */
function parseUnavailableDays(text: string): number[] | null {
  const m = text.match(/不可日\s*[：:]?\s*([\d.,、 ]+)/);
  if (!m) return null;

  const days = m[1].split(/[.,、\s]+/).map(Number).filter(n => n > 0 && n <= 31);
  return days.length > 0 ? days : null;
}

/** 制約条件の抽出: 「週3くらいで」等 */
function extractConstraints(text: string): string[] {
  const constraints: string[] = [];

  if (/週\s*\d/.test(text)) {
    const m = text.match(/週\s*(\d)\s*[くぐ]?ら?い/);
    if (m) constraints.push(`週${m[1]}希望`);
  }

  if (/固定/.test(text)) {
    const m = text.match(/.{0,20}固定.{0,10}/);
    if (m) constraints.push(m[0].trim());
  }

  return constraints;
}

/** 名前として有効か判定 */
function isValidName(name: string): boolean {
  if (!name || name.length > 20) return false;
  // 挨拶や日付パターンは除外
  if (/^(お疲れ|おつかれ|すみません|よろしく|遅く|シフト|確認|期限|変更|訂正)/.test(name)) return false;
  if (/^\d+\s*[（(]/.test(name)) return false; // "16（水）" 等
  if (/^[\[「]/.test(name)) return false;
  if (/^(名前|【名前】)$/.test(name)) return false;
  return true;
}

// --- LINEメッセージ分割 ---

interface LineMessage {
  dateHeader: string | null;
  parsedDate: { year: number; month: number; day: number } | null;
  sender: string;
  body: string;
  lineIndex: number;
}

function splitMessages(text: string): LineMessage[] {
  const lines = text.split('\n');
  const messages: LineMessage[] = [];

  let currentDateHeader: string | null = null;
  let currentParsedDate: { year: number; month: number; day: number } | null = null;
  let currentSender = '';
  let currentBody = '';
  let currentLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 日付ヘッダー行
    const dateH = parseDateHeader(line);
    if (dateH) {
      if (currentBody.trim()) {
        messages.push({
          dateHeader: currentDateHeader,
          parsedDate: currentParsedDate,
          sender: currentSender,
          body: currentBody.trim(),
          lineIndex: currentLineIndex,
        });
        currentBody = '';
      }
      currentDateHeader = line.trim();
      currentParsedDate = dateH;
      continue;
    }

    // メッセージ行: "15:43\tryuto\t本文"
    const msgMatch = line.match(/^(\d{1,2}:\d{2})\t(.+?)\t(.*)/);
    if (msgMatch) {
      if (currentBody.trim()) {
        messages.push({
          dateHeader: currentDateHeader,
          parsedDate: currentParsedDate,
          sender: currentSender,
          body: currentBody.trim(),
          lineIndex: currentLineIndex,
        });
      }
      currentSender = msgMatch[2].trim();
      currentBody = msgMatch[3] || '';
      currentLineIndex = i;
      continue;
    }

    // 継続行
    currentBody += '\n' + line;
  }

  if (currentBody.trim()) {
    messages.push({
      dateHeader: currentDateHeader,
      parsedDate: currentParsedDate,
      sender: currentSender,
      body: currentBody.trim(),
      lineIndex: currentLineIndex,
    });
  }

  return messages;
}

// --- メインパーサー ---

/**
 * メインのパース関数
 * @param text LINEトーク全文
 * @param targetMonth 対象月（1-12）
 * @param targetHalf 'first' (1-15日) or 'second' (16-月末)
 * @param targetYear 対象年（省略時は最新年を自動検出）
 */
export function parseLineChat(
  text: string,
  targetMonth: number,
  targetHalf: 'first' | 'second',
  targetYear?: number
): ParseResult {
  const warnings: string[] = [];
  const messages = splitMessages(text);

  // 対象期間に一致する日付範囲
  const targetDayMin = targetHalf === 'first' ? 1 : 16;
  const targetDayMax = targetHalf === 'first' ? 15 : 31;

  // === ブロック検出: 2つの方法で探す ===

  let blockStart = -1;
  let blockEnd = messages.length;
  let detectedYear = targetYear || new Date().getFullYear();

  // 方法1: 「○月前半/後半のシフト」テキスト検索（最後のマッチを採用）
  for (let i = 0; i < messages.length; i++) {
    const body = messages[i].body;
    const m = body.match(/(\d{1,2})月\s*(前半|後半)/);
    if (m) {
      const month = parseInt(m[1]);
      const half = m[2] === '前半' ? 'first' : 'second';
      if (month === targetMonth && half === targetHalf) {
        blockStart = i;
        // 年はこのメッセージの日付ヘッダーから取得
        if (messages[i].parsedDate) {
          detectedYear = messages[i].parsedDate!.year;
          // テンプレが3月投稿で4月分 → 年は同じ
          // テンプレが12月投稿で1月分 → 年+1
          if (messages[i].parsedDate!.month === 12 && targetMonth === 1) {
            detectedYear += 1;
          }
        }
      }
    }
  }

  // 方法2: テンプレートの日付リスト（【名前】+ 1（水）〜15（水）のパターン）
  if (blockStart === -1) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const body = messages[i].body;
      if (!body.includes('【名前】')) continue;

      const dayNums = [...body.matchAll(/(\d{1,2})\s*[（(]\s*[日月火水木金土祝]/g)]
        .map(m => parseInt(m[1]));

      if (dayNums.length < 5) continue;

      const minDay = Math.min(...dayNums);
      const maxDay = Math.max(...dayNums);

      // 日付範囲が対象と一致するか
      const matchesHalf = (targetHalf === 'first' && minDay <= 3 && maxDay <= 15) ||
                           (targetHalf === 'second' && minDay >= 16 && maxDay >= 28);

      if (matchesHalf && messages[i].parsedDate) {
        const templateMonth = messages[i].parsedDate!.month;
        // テンプレ投稿月の翌月が対象月（前半の場合）
        const expectedMonth = targetHalf === 'first'
          ? (templateMonth % 12) + 1
          : templateMonth;

        if (expectedMonth === targetMonth || templateMonth === targetMonth) {
          blockStart = i;
          detectedYear = messages[i].parsedDate!.year;
          if (expectedMonth === 1 && templateMonth === 12) detectedYear += 1;
          break;
        }
      }
    }
  }

  if (blockStart === -1) {
    warnings.push(`${targetMonth}月${targetHalf === 'first' ? '前半' : '後半'}のテンプレートが見つかりませんでした`);
    return {
      period: { year: detectedYear, month: targetMonth, half: targetHalf },
      staff: [],
      warnings,
    };
  }

  // ブロック終了を検出: 次のテンプレート投稿 or 管理者の「シフト確認」投稿
  for (let i = blockStart + 1; i < messages.length; i++) {
    const body = messages[i].body;

    // 次の「○月前半/後半」テンプレート
    const periodMatch = body.match(/(\d{1,2})月\s*(前半|後半)/);
    if (periodMatch) {
      const m = parseInt(periodMatch[1]);
      const h = periodMatch[2] === '前半' ? 'first' : 'second';
      if (m !== targetMonth || h !== targetHalf) {
        blockEnd = i;
        break;
      }
    }

    // 次の【名前】テンプレート（管理者が投稿する日付リスト形式）
    if (body.includes('【名前】') && /\d+\s*[（(]/.test(body)) {
      const dayNums = [...body.matchAll(/(\d{1,2})\s*[（(]\s*[日月火水木金土祝]/g)]
        .map(m => parseInt(m[1]));
      if (dayNums.length >= 5) {
        const minDay = Math.min(...dayNums);
        // 新しいテンプレートの日付範囲が明らかに異なる場合
        if ((targetHalf === 'first' && minDay >= 16) ||
            (targetHalf === 'second' && minDay <= 5)) {
          blockEnd = i;
          break;
        }
      }
    }
  }

  // === ブロック内のメッセージから個人希望を抽出 ===
  const staffMap = new Map<string, ParsedStaff>();
  const relevantMessages = messages.slice(blockStart + 1, blockEnd);

  for (const msg of relevantMessages) {
    const body = msg.body.trim();
    if (!body) continue;

    // 写真・スタンプ等はスキップ
    if (body.startsWith('[') && body.endsWith(']')) continue;

    // 日エントリが含まれているか事前チェック
    const dayEntryLines = body.split('\n').filter(l => parseDayEntry(l.trim()) !== null);
    const hasUnavailDays = parseUnavailableDays(body) !== null;

    // 日エントリも不可日リストもない → シフト希望ではない（雑談・連絡）
    if (dayEntryLines.length < 2 && !hasUnavailDays) continue;

    // 名前を抽出
    let name = '';
    let entryText = body;

    const nameMatch = body.match(/【名前】\s*(.+)/);
    if (nameMatch) {
      name = nameMatch[1].split('\n')[0].trim();
      // 【名前】以降のテキストをエントリとして使う
      const nameLineEnd = body.indexOf('\n', body.indexOf('【名前】'));
      if (nameLineEnd >= 0) {
        entryText = body.slice(nameLineEnd + 1);
      }
    } else {
      // 最初の行が名前の可能性
      const firstLine = body.split('\n')[0].trim();
      if (isValidName(firstLine) && !parseDayEntry(firstLine)) {
        name = firstLine;
        entryText = body.slice(body.indexOf('\n') + 1);
      } else {
        // LINE送信者名をフォールバック
        name = msg.sender;
      }
    }

    if (!name || !isValidName(name)) continue;

    // 日エントリをパース
    const entries: ParsedEntry[] = [];
    const constraints = extractConstraints(body);

    // 「不可日」パターン
    const unavailDays = parseUnavailableDays(body);
    if (unavailDays) {
      for (let d = targetDayMin; d <= targetDayMax; d++) {
        entries.push({
          day: d,
          available: !unavailDays.includes(d),
        });
      }
    } else {
      // 行ごとにパース
      for (const line of entryText.split('\n')) {
        const entry = parseDayEntry(line.trim());
        if (entry && entry.day >= targetDayMin && entry.day <= targetDayMax) {
          entries.push(entry);
        }
      }
    }

    // 期間範囲パターン: "8（月）～15（月）✕"
    const rangeMatch = body.match(/(\d{1,2})\s*[（(][日月火水木金土祝]*[）)]\s*[〜～ー-]\s*(\d{1,2})\s*[（(][日月火水木金土祝]*[）)]\s*(.*)/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]);
      const to = parseInt(rangeMatch[2]);
      const rest = rangeMatch[3].trim();
      const isUnavail = rest ? isUnavailableMark(rest) : false;
      for (let d = from; d <= to; d++) {
        if (d >= targetDayMin && d <= targetDayMax) {
          if (!entries.find(e => e.day === d)) {
            entries.push({ day: d, available: !isUnavail });
          }
        }
      }
    }

    if (entries.length === 0) continue;

    // 同名の後勝ち（訂正対応）
    const key = name.replace(/\s+/g, '');
    const existing = staffMap.get(key);
    if (existing) {
      warnings.push(`${name}: 再提出を検出 → 最新を採用`);
    }

    staffMap.set(key, {
      name: name.replace(/\s+/g, ''), // 名前の空白除去
      lineName: msg.sender,
      entries,
      constraints: constraints.length > 0 ? constraints : undefined,
      rawText: body,
    });
  }

  return {
    period: { year: detectedYear, month: targetMonth, half: targetHalf },
    staff: Array.from(staffMap.values()),
    warnings,
  };
}

/**
 * パース結果からavailabilityデータに変換
 * （既存のAutoAssignInputに注入するため）
 */
export function toAvailabilityData(
  result: ParseResult,
  staffIdMap: Map<string, number>
): { staffId: number; date: string; startTime: string; endTime: string; available: boolean }[] {
  const data: { staffId: number; date: string; startTime: string; endTime: string; available: boolean }[] = [];
  const { year, month } = result.period;

  for (const staff of result.staff) {
    const staffId = staffIdMap.get(staff.name.replace(/\s+/g, ''));
    if (!staffId) continue;

    for (const entry of staff.entries) {
      const day = entry.day;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      data.push({
        staffId,
        date: dateStr,
        startTime: entry.startTime || '09:00',
        endTime: entry.endTime || '17:00',
        available: entry.available,
      });
    }
  }

  return data;
}
