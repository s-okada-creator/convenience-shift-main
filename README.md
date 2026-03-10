# Convenience Shift

コンビニエンスストア向けのシフト管理アプリケーションです。スタッフの勤務可能時間、シフト要件、AIによる自動シフト割り振り機能を提供します。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router)
- **言語**: TypeScript (strict mode)
- **UI**: React 19, Tailwind CSS 4, Radix UI
- **データベース**: PostgreSQL (Neon Serverless)
- **ORM**: Drizzle ORM
- **AI**: Google Gemini API
- **ドラッグ&ドロップ**: dnd-kit
- **テスト**: Vitest, Testing Library
- **デプロイ**: Vercel

## 機能

- 月別/日別シフト管理
- スタッフ管理（社員/アルバイト）
- 勤務可能時間パターンの設定
- 休暇希望の管理
- 時間帯別の必要人数設定
- AIによるシフト自動割り振り
- シフトのドラッグ&ドロップ編集
- 残業（8時間超過）の視覚的表示

## セットアップ

### 前提条件

- Node.js 20以上
- npm
- PostgreSQL データベース（Neon推奨）
- Google Gemini API キー（自動割り振り機能に必要）

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-username/convenience_shift.git
cd convenience_shift

# 依存パッケージをインストール
npm install

# 環境変数を設定
cp .env.example .env.local
# .env.local を編集して必要な値を設定
```

### 環境変数

`.env.local` に以下の環境変数を設定してください：

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL接続URL | Yes |
| `GEMINI_API_KEY` | Google Gemini API キー | No* |

*自動シフト割り振り機能を使用する場合は必要

### データベースセットアップ

```bash
# スキーマをデータベースにプッシュ
npx drizzle-kit push

# (オプション) シードデータを投入
npx tsx src/lib/db/seed.ts
```

## 開発

```bash
# 開発サーバーを起動
npm run dev

# リントを実行
npm run lint

# テストを実行
npm run test

# テストを一度だけ実行
npm run test:run

# カバレッジ付きでテストを実行
npm run test:coverage

# 本番ビルド
npm run build

# 本番サーバーを起動
npm run start
```

## プロジェクト構成

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # APIルート
│   │   ├── auth/          # 認証関連
│   │   ├── shifts/        # シフト管理
│   │   ├── staff/         # スタッフ管理
│   │   └── stores/        # 店舗管理
│   ├── dashboard/         # ダッシュボード画面
│   │   ├── shifts/        # シフト管理画面
│   │   │   └── [date]/    # 日別シフト編集
│   │   ├── staff/         # スタッフ管理画面
│   │   └── settings/      # 設定画面
│   └── login/             # ログイン画面
├── components/            # 共通コンポーネント
│   ├── layout/           # レイアウト
│   ├── shifts/           # シフト関連
│   ├── staff/            # スタッフ関連
│   └── ui/               # UIプリミティブ
├── hooks/                 # カスタムフック
├── lib/                   # ユーティリティ
│   ├── auto-assign/      # 自動割り振りロジック
│   ├── db/               # データベース
│   │   └── schema.ts     # Drizzleスキーマ
│   └── gemini/           # Gemini API連携
└── types/                 # 型定義
```

## ユーザーロール

| ロール | 権限 |
|--------|------|
| `owner` | 全店舗のデータにアクセス可能 |
| `manager` | 所属店舗のデータにアクセス可能 |

## API仕様

主要なAPIエンドポイント：

- `GET/POST /api/shifts` - シフト一覧取得/作成
- `GET/PUT/DELETE /api/shifts/[id]` - シフト個別操作
- `GET/POST /api/staff` - スタッフ一覧取得/作成
- `GET/PUT/DELETE /api/staff/[id]` - スタッフ個別操作
- `GET/POST /api/staff/[id]/availability` - 勤務可能時間パターン
- `GET/POST /api/time-off-requests` - 休暇希望
- `GET/POST /api/shift-requirements` - シフト要件

## テスト

```bash
# 全テストを実行
npm run test

# 特定のファイルをテスト
npm run test -- src/__tests__/time-constants.test.ts

# ウォッチモード
npm run test -- --watch
```

## デプロイ

Vercelへのデプロイ：

1. Vercelにリポジトリを接続
2. 環境変数を設定（`DATABASE_URL`）
3. デプロイを実行

## ライセンス

MIT
