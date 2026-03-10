# Claude Code 設定

このファイルはClaude Code向けのプロジェクト固有ルールを定義します。

## デプロイ

### 標準手順

1. `git push origin main` でGitHubにプッシュ
2. GitHub ActionsのCIが自動実行される
3. CIが成功すればVercelが自動デプロイ

### フォールバック手順

CIが失敗した場合、以下の手順で手動デプロイ：

```bash
# ローカルでビルド確認
npm run build

# ビルド成功なら手動デプロイ
vercel --prod
```

### CI状態確認

```bash
# 最近のCI実行一覧
gh run list --limit 5

# 特定のCI詳細（失敗ログ）
gh run view <RUN_ID> --log-failed
```

## 開発ルール

### コミット

- コミットメッセージは日本語でOK
- Co-Authored-By を必ず含める

### ESLint

- `react-hooks/set-state-in-effect` は正当な理由がある場合のみ `eslint-disable` で抑制可
- 抑制する場合は理由をコメントで明記

## 環境変数

| 変数 | 用途 | 設定場所 |
|------|------|---------|
| DATABASE_URL | NeonDB接続 | .env.local, GitHub Secrets, Vercel |
| DISCORD_WEBHOOK_URL | Discord通知 | .env.local, Vercel |
