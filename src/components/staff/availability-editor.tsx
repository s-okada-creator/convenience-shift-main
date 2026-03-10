'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AvailabilityPattern {
  id?: number;
  staffId?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface AvailabilityEditorProps {
  staffId: number;
  initialPatterns: AvailabilityPattern[];
}

const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

// 30分単位の時間オプションを生成
const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      options.push(time);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

export function AvailabilityEditor({ staffId, initialPatterns }: AvailabilityEditorProps) {
  const [patterns, setPatterns] = useState<AvailabilityPattern[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // 初期パターンから各曜日の設定を構築
    const patternsByDay: { [key: number]: AvailabilityPattern } = {};
    initialPatterns.forEach((p) => {
      patternsByDay[p.dayOfWeek] = {
        ...p,
        startTime: p.startTime ? p.startTime.slice(0, 5) : '',
        endTime: p.endTime ? p.endTime.slice(0, 5) : '',
      };
    });

    // すべての曜日のパターンを作成（未設定の曜日は空のまま）
    const allPatterns: AvailabilityPattern[] = [];
    for (let day = 0; day < 7; day++) {
      if (patternsByDay[day]) {
        allPatterns.push({
          dayOfWeek: day,
          startTime: patternsByDay[day].startTime,
          endTime: patternsByDay[day].endTime,
        });
      } else {
        allPatterns.push({
          dayOfWeek: day,
          startTime: '',
          endTime: '',
        });
      }
    }
    setPatterns(allPatterns);
  }, [initialPatterns]);

  const handleTimeChange = (
    dayOfWeek: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    setPatterns(
      patterns.map((p) =>
        p.dayOfWeek === dayOfWeek ? { ...p, [field]: value } : p
      )
    );
    setSuccess(false);
  };

  const handleClear = (dayOfWeek: number) => {
    setPatterns(
      patterns.map((p) =>
        p.dayOfWeek === dayOfWeek ? { ...p, startTime: '', endTime: '' } : p
      )
    );
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // 空でないパターンのみ送信
      const validPatterns = patterns.filter((p) => p.startTime && p.endTime);

      const res = await fetch(`/api/staff/${staffId}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns: validPatterns }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const errorData = await res.json();
        setError(errorData.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToAll = (startTime: string, endTime: string) => {
    setPatterns(
      patterns.map((p) => ({
        ...p,
        startTime,
        endTime,
      }))
    );
    setSuccess(false);
  };

  const handleApplyToWeekdays = (startTime: string, endTime: string) => {
    setPatterns(
      patterns.map((p) =>
        p.dayOfWeek >= 1 && p.dayOfWeek <= 5
          ? { ...p, startTime, endTime }
          : p
      )
    );
    setSuccess(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#1D1D1F]">勤務可能時間</CardTitle>
        <CardDescription>
          曜日ごとの勤務可能な時間帯を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600">保存しました</p>
          </div>
        )}

        {/* クイック設定 */}
        <div className="flex flex-wrap gap-2 pb-4 border-b border-[#D2D2D7]">
          <span className="text-sm text-[#86868B] mr-2">クイック設定:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleApplyToAll('09:00', '22:00')}
            className="text-xs"
          >
            全日 9:00-22:00
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleApplyToWeekdays('09:00', '17:00')}
            className="text-xs"
          >
            平日 9:00-17:00
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleApplyToWeekdays('16:00', '22:00')}
            className="text-xs"
          >
            平日 16:00-22:00
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleApplyToAll('06:00', '23:00')}
            className="text-xs"
          >
            全日フル 6:00-23:00
          </Button>
        </div>

        {/* 曜日ごとの設定 */}
        <div className="space-y-3">
          {patterns.map((pattern) => (
            <div
              key={pattern.dayOfWeek}
              className={`flex items-center gap-4 p-3 rounded-lg ${
                pattern.dayOfWeek === 0 || pattern.dayOfWeek === 6
                  ? 'bg-blue-50'
                  : 'bg-[#F5F5F7]'
              }`}
            >
              <div className="w-12 text-center">
                <span
                  className={`font-medium ${
                    pattern.dayOfWeek === 0
                      ? 'text-red-500'
                      : pattern.dayOfWeek === 6
                      ? 'text-blue-500'
                      : 'text-[#1D1D1F]'
                  }`}
                >
                  {dayOfWeekLabels[pattern.dayOfWeek]}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-1">
                <Select
                  value={pattern.startTime || 'none'}
                  onValueChange={(value) =>
                    handleTimeChange(
                      pattern.dayOfWeek,
                      'startTime',
                      value === 'none' ? '' : value
                    )
                  }
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="開始時間" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">--:--</SelectItem>
                    {timeOptions.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-[#86868B]">〜</span>

                <Select
                  value={pattern.endTime || 'none'}
                  onValueChange={(value) =>
                    handleTimeChange(
                      pattern.dayOfWeek,
                      'endTime',
                      value === 'none' ? '' : value
                    )
                  }
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="終了時間" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">--:--</SelectItem>
                    {timeOptions.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClear(pattern.dayOfWeek)}
                className="text-[#86868B]"
                disabled={!pattern.startTime && !pattern.endTime}
              >
                クリア
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#007AFF] hover:bg-[#0056b3] text-white"
          >
            {saving ? '保存中...' : '勤務可能時間を保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
