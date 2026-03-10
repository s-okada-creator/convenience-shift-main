# スマートフォン対応 UI改善計画

## 要件サマリー

| 項目 | 内容 |
|------|------|
| 利用者 | 店長・スタッフ両方 |
| 必要機能 | シフト確認、休み希望入力、多店舗要請、休み希望承認 |
| ナビ形式 | ボトムナビゲーション（lg未満で表示） |
| 日次シフト | スマホではリスト形式 |
| カレンダー | コンパクトな月表示維持 |
| タブレット | 対応必須 |
| ブレークポイント | ~640px: スマホ / 641-1024px: タブレット / 1025px~: PC |
| 省略可能 | 統計ダッシュボード（スマホでは非表示OK） |

---

## 追加仕様（Q&A）

### ボトムナビゲーション

| 項目 | 仕様 |
|------|------|
| 「その他/メニュー」の動作 | ボトムシートで既存メニュー一覧を表示 |
| 「管理者のみ」の対象 | `owner` + `manager` |
| 「シフト」の遷移先 | `/dashboard/shifts`（月別カレンダー） |

### 日別シフト（モバイルカード）

| 項目 | 仕様 |
|------|------|
| 表示情報 | 名前、シフト時間、勤務可能時間帯 |
| 役職/雇用形態バッジ | 不要 |
| 未設定時 | グレーアウトで「未設定」と表示（リストに含める） |

### 休み希望 承認待ちカード

| 項目 | 仕様 |
|------|------|
| 必須情報 | スタッフ名、希望日一覧、理由、申請日（全て表示） |
| ボタン配置 | カード内下部に横並びで配置 |
| 希望日表示 | スタッフごとにグルーピングして複数日をまとめて表示 |

### 理由フィールド追加（スコープ内）

| 項目 | 内容 |
|------|------|
| 対応方針 | DB新規カラム追加 + API・フォーム改修 |
| テーブル | `time_off_requests` |
| カラム名 | `reason` (TEXT, nullable) |
| UI変更 | 休み希望申請フォームに理由入力欄追加 |
| 表示 | 承認待ちカードに理由を表示（未入力時は非表示） |

---

## Phase 1: ナビゲーション基盤 【最優先】

### 1.1 ボトムナビゲーション新規作成

**新規ファイル**: `/src/components/layout/bottom-navigation.tsx`

```
構成:
- fixed bottom-0 left-0 right-0
- h-16 + safe-area-inset-bottom対応
- bg-white/80 backdrop-blur-xl border-t
- lg:hidden でモバイル/タブレットのみ表示

ナビ項目:
- ダッシュボード (Home)
- シフト (Calendar)
- マイシフト (CalendarDays)
- 休み希望 (CalendarOff)
- その他/メニュー (Menu) ※管理者のみ追加機能へ
```

### 1.2 サイドバー修正

**ファイル**: `/src/components/layout/sidebar.tsx`

```
変更:
- モバイルハンバーガーメニュー削除（ボトムナビに置換）
- モバイルヘッダーはロゴのみに簡素化
- デスクトップサイドバー（lg以上）は維持
```

### 1.3 ダッシュボードレイアウト修正

**ファイル**: `/src/components/layout/dashboard-layout.tsx`

```
変更:
- メインコンテンツに pb-20 lg:pb-8 追加（ボトムナビ分の余白）
```

---

## Phase 2: 日次シフトページ 【高優先】

### 2.1 モバイル用リスト表示コンポーネント

**新規ファイル**: `/src/app/dashboard/shifts/[date]/components/mobile-shift-list.tsx`

```
構成:
- スタッフごとのカード形式
- 名前、役職、シフト時間、勤務可能時間帯を表示
- タップで編集ダイアログ起動
- シフト未設定者は薄いスタイル
```

### 2.2 日次シフトコンテンツ修正

**ファイル**: `/src/app/dashboard/shifts/[date]/daily-shift-content.tsx`

```
変更:
- sm未満: MobileShiftList表示
- sm以上: 既存テーブル表示
- テーブルの min-w 調整: sm:min-w-[800px] lg:min-w-[1200px]
```

### 2.3 DateNavigation修正

**ファイル**: `/src/app/dashboard/shifts/[date]/components/date-navigation.tsx`

```
変更:
- flex-col sm:flex-row でスマホ時縦積み
- 日付表示を中央に大きく
```

---

## Phase 3: カレンダー表示最適化 【中優先】

### 3.1 月別シフトカレンダー修正

**ファイル**: `/src/app/dashboard/shifts/shifts-content.tsx`

```
変更:
- セルサイズ: h-16 sm:h-20 lg:h-24
- バッジ短縮: スマホ "3/5"、タブレット以上 "3名/5名"
- 統計カード: hidden sm:grid でスマホ時非表示
```

### 3.2 休み希望カレンダー修正

**ファイル**: `/src/app/dashboard/time-off/time-off-content.tsx`

```
変更:
- セルサイズ: h-12 sm:h-16
- 承認待ちテーブル: スマホ時カード形式に切替
```

### 3.3 マイシフトカレンダー修正

**ファイル**: `/src/app/dashboard/my-shifts/my-shifts-content.tsx`

```
変更:
- セルサイズ: h-14 sm:h-20 lg:h-24
- シフト時間短縮: スマホ "9-17"、タブレット以上 "09:00-17:00"
```

---

## Phase 4: ダッシュボード最適化 【中優先】

### 4.1 ダッシュボードコンテンツ修正

**ファイル**: `/src/app/dashboard/dashboard-content.tsx`

```
変更:
- 週間シフト: スマホ時リスト表示に切替
- 統計カード: grid-cols-2 維持、パディング調整
```

---

## Phase 5: 共通調整 【低優先】

### 5.1 グローバルスタイル

**ファイル**: `/src/app/globals.css`

```
追加:
- safe-area-inset対応
- タッチターゲット最小44px確保
```

---

## ブレークポイント統一ルール

```
使用するブレークポイント:
- 無印: ~639px (スマホ)
- sm: 640px~ (タブレット)
- lg: 1024px~ (PC)

非推奨:
- md: 使用しない（混乱防止）
- xl/2xl: 今回は使用しない
```

---

## 修正対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `/src/components/layout/bottom-navigation.tsx` | 新規作成 |
| `/src/components/layout/sidebar.tsx` | モバイルメニュー削除・簡素化 |
| `/src/components/layout/dashboard-layout.tsx` | ボトムナビ分パディング追加 |
| `/src/app/dashboard/shifts/[date]/components/mobile-shift-list.tsx` | 新規作成 |
| `/src/app/dashboard/shifts/[date]/daily-shift-content.tsx` | レスポンシブ切替追加 |
| `/src/app/dashboard/shifts/[date]/components/date-navigation.tsx` | レイアウト調整 |
| `/src/app/dashboard/shifts/shifts-content.tsx` | カレンダーセル調整 |
| `/src/app/dashboard/time-off/time-off-content.tsx` | カレンダー・テーブル調整 |
| `/src/app/dashboard/my-shifts/my-shifts-content.tsx` | カレンダー調整 |
| `/src/app/dashboard/dashboard-content.tsx` | 週間表示調整 |

---

## 検証方法

### デバイス別チェック

**スマホ (iPhone SE - iPhone 14 Pro Max)**
- [ ] ボトムナビが表示され、各項目タップ可能
- [ ] 日次シフトがリスト形式で表示
- [ ] カレンダーセルがタップしやすい
- [ ] 横スクロール不要

**タブレット (iPad mini - iPad Pro)**
- [ ] ボトムナビ表示（1024px未満時）
- [ ] 日次シフトテーブルが適切サイズで表示
- [ ] 横向き/縦向き両対応

**PC (1025px以上)**
- [ ] サイドバー左固定表示
- [ ] ボトムナビ非表示
- [ ] 既存レイアウト維持

### 機能別チェック

- [ ] シフト確認（マイシフト表示）
- [ ] 休み希望入力（日付選択・申請）
- [ ] 多店舗要請（他店舗スタッフパネル操作）
- [ ] 休み希望承認（承認/却下ボタン操作）
