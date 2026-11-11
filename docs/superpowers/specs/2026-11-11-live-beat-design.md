# live-beat 設計書

> **この文書は古い内容を含みます。** 音源・パッド構成・同期ルール・BPM の現行仕様は `docs/superpowers/specs/2026-11-11-self-made-packs-design.md` を正とします。

日付: 2026-11-11  
状態: レビュー待ち（対話で合意済みの内容を文書化）

## 1. 目的

`live-beat` は、ブラウザ（およびホーム画面追加の PWA）で、既製ループをパッドに載せて重ね演奏し、その演奏を録音できる公開 Web アプリである。

参照する操作モデルは Easybrain の Groovepad（ライブ・ループ・パッド）である。見た目と配信形態は姉妹アプリ `adhd-bgm`（Soft Mint デザイン、Cloudflare Workers 静的アセット）を踏襲する。

対象ユーザーは不特定の公開利用者である。アカウントや課金は持たない。

## 2. 非目標（最初の公開版）

次は最初の公開版に含めない。

- ランダムなビート自動生成
- FX（フィルタ、ディレイ、リバーブなど）
- レッスン／チュートリアル
- アカウント、クラウド保存、SNS 連携
- ユーザーによる音源アップロード
- ステップシーケンサーやキック／スネア個別ワンショット編集
- Groovepad の UI 画像・音源・ブランドの複製

## 3. 技術方針

推奨案（合意済み）: **`adhd-bgm` と同型のバニラ静的 PWA**。

| 項目 | 選択 |
|------|------|
| 実装 | HTML / CSS / JavaScript（ES modules）。フレームワークなし |
| 音声 | Web Audio API |
| 録音 | `MediaRecorder`（`MediaStreamAudioDestinationNode` 経由） |
| デザイン | Soft Mint（`adhd-bgm` のトークン・コンポーネントを流用） |
| 配信 | Cloudflare Workers の静的アセット（`wrangler.jsonc` の `assets.directory`） |
| テスト | Node.js の `node:test`（純ロジック）。ブラウザ操作は手動 |

Tone.js や Vite などのビルド付きフロントは、最初の公開版では採用しない。

## 4. 全体構成

```
live-beat/
├── wrangler.jsonc
├── docs/superpowers/specs/   # 本設計書など
├── public/                   # 配信ルート
│   ├── index.html            # ライブラリ画面
│   ├── play.html             # 演奏画面（または同等の画面遷移）
│   ├── tokens.css
│   ├── components.css
│   ├── fonts.css
│   ├── style.css
│   ├── app 用 ES modules
│   ├── packs/                # WAV + パック定義 JSON
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── _headers
│   ├── fonts/
│   └── icons/
└── test/
```

画面は次の 2 つとする。

1. **ライブラリ** — パック一覧から選択する
2. **演奏** — 約 12 パッド、STOP、A/B、録音

デスクトップでは `adhd-bgm` と同様、中央寄せの表面パネルを使ってよい。モバイルは全幅の単一カラムを基本とする。

## 5. デザイン

- システム名: Soft Mint（クレイ調、枠線より影とハイライト）
- フォント: Zen Maru Gothic（セルフホスト）
- ライト／ダーク: `prefers-color-scheme`
- 色・立体・タイポ・モーションの値は `adhd-bgm` の `tokens.css` / `components.css` をコピーして開始する
- Groovepad の黒背景・ネオンパッド見た目はコピーしない
- パート種別（drums / bass / chords / percussion）は Soft Mint 上で識別できる色分けにする（コントラストとタップ領域 44px 以上を守る）
- CSP 前提: インライン `style` / インラインスクリプトを使わない（`adhd-bgm` の `_headers` 方針に合わせる）

## 6. 音源とライセンス

### 6.1 採用音源

最初の音源は [Pulse Open Loops](https://pulse.studiosphere.space/open-loops/kits) とする。

確認済みの事実:

- キット数: 24（おおよそ 8 スタイル × 3 BPM: 96 / 120 / 140）
- 各キット: 4 小節 WAV × 4（drums / bass / chords / percussion）
- ライセンス: CC0（帰属義務なし）
- 同梱: 公開 PWA への再配布に適合

SampleRadar や Looperman など「曲への利用は可・再配布は不可」の素材は同梱しない。

### 6.2 アプリ内でのクレジット

法的義務は CC0 のため必須ではないが、アプリ内（ライブラリのフッターまたは「About」相当）に Pulse Open Loops と CC0 である旨を短く示す。リポジトリには各キットの `LICENSE` / 出典メモを残す。

## 7. パックとパッドのデータモデル

### 7.1 用語

| 用語 | 意味 |
|------|------|
| キット | Pulse の 1 ZIP 相当。4 ループ（drums / bass / chords / percussion） |
| パック | アプリが Library に出す単位。同じ BPM のキットを 3 つ束ね、12 パッドにする |
| パッド | 演奏画面の 1 ボタン。1 本のループに対応する |
| A 面 / B 面 | 同一パック内の 2 セットのパッド配列。テンポは共通 |

### 7.2 パッキング規則

- 同じ BPM のキットを 3 つ選び、A 面の 12 パッドとする（キットごとに 4 パッド）
- 同じ BPM の別キット 3 つを B 面に割り当てる
- テンポ違いのキットを同一面に混在させない
- 利用可能なキット数の関係で端数が出る場合は、最初の公開では完全に埋まるパックだけを出し、余りキットは次の版で扱うか、ドキュメントに明示する

例（120 BPM の A 面のイメージ）:

| パッド | キット | パート |
|--------|--------|--------|
| 1–4 | Copper Step | drums / bass / chords / percussion |
| 5–8 | Ember Weave | 同上 |
| 9–12 | Glass Orbit | 同上 |

### 7.3 メタデータ

パック定義は JSON で持つ。必須フィールドの意図は次のとおり。

- `id`, `title`, `bpm`
- `sides.A` / `sides.B`: パッド配列
- 各パッド: `id`, `label`, `part`（drums | bass | chords | percussion）, `kitName`, `src`（WAV パス）, `colorRole`
- `license`: 表示用文字列（例: Pulse Open Loops / CC0）

## 8. インタラクション

### 8.1 ライブラリ

- パックをカードまたはリストで表示（タイトル、BPM、短い説明）
- タップで演奏画面へ遷移（クエリまたはパスでパック ID を渡す）

### 8.2 演奏画面

- 約 12 パッドの格子
- 各パッドはトグル（ON でループ参加、OFF で離脱）
- STOP: すべてのループを止め、パッド選択をリセット
- A/B: 面を切り替える
- 録音: 開始／停止。停止後に再生とダウンロード

### 8.3 同期（量子化）

- マスターテンポはパックの BPM に固定する（ユーザー BPM 変更は最初の版では持たない）
- パッド ON / OFF は次の**小節境界**で反映し、途中のブツ切りを避ける（1 小節 = 4 拍、パック BPM から秒長を算出）
- STOP は即時停止してよい

### 8.4 A/B 切替

- 切替時は、鳴っているループを境界で止め、選択状態はクリアする（最初の版の単純ルール）
- 録音中に面を切り替えた場合は、その時点の出力がそのまま録れる（サーバー側のマルチトラック合成はしない）

### 8.5 録音

- ミックスバスを `MediaStreamDestination` に繋ぎ `MediaRecorder` で記録する
- コンテナはブラウザがサポートするもの（多くは WebM）
- 保存先は端末ローカル（Blob URL での再生・ダウンロード）のみ
- 非対応環境では録音 UI を無効化し、理由を短く示す

### 8.6 オーディオ開始

- ユーザーの最初のジェスチャで `AudioContext` を resume する
- 対応環境では `navigator.audioSession.type = 'playback'` を設定してよい（`adhd-bgm` と同様）

## 9. PWA と配信

- `manifest.webmanifest`: `display: standalone`、名前・アイコン・テーマ色（Soft Mint に合わせる）
- Service Worker: アプリシェルと、少なくとも直近または選択中パックの WAV をキャッシュし、オフライン再訪で演奏できるようにする
- `wrangler.jsonc`: `assets.directory` を `./public` にする（`adhd-bgm` と同じパターン）
- `public/_headers`: CSP と `sw.js` の `Cache-Control: no-cache` を設定する

本番ホスト名は実装時に決める（例: `beat.app.hirakawaxxx.com`）。本設計では「Cloudflare 上の独自サブドメインで公開する」ことだけを固定する。

## 10. エラーとアクセシビリティ

- WAV 読み込み失敗: 該当パッドを無効化し、status 領域に通知する
- 録音非対応: 録音コントロールを無効化または非表示にし、理由を示す
- 無音・未開始: status で操作を促す
- フォーカス可視化、色だけに依存しない ON/OFF 状態、タップ領域 44px 以上
- `prefers-reduced-motion: reduce` で装飾モーションを止める

## 11. テスト方針

自動化（`node:test`）の対象例:

- パック JSON のスキーマ／必須フィールド
- BPM から小節長（秒）および量子化時刻の計算
- A/B 面のパッド数整合（各面 12、同一 BPM）

手動確認:

- ライブラリ → 演奏 → パッド重ね → STOP
- A/B 切替
- 録音してダウンロード
- ホーム画面追加とオフライン再訪
- ライト／ダークと狭い画面幅

## 12. 成功の目安

次を満たせば最初の公開版として成功とする。

1. 公開 URL から、パックを選んでパッドを重ね演奏できる
2. A/B と録音（端末内再生・ダウンロード）ができる
3. Soft Mint の見た目で、姉妹アプリ `adhd-bgm` と並べても違和感が少ない
4. 主要フローが PWA としてオフライン再訪できる
5. 音源ライセンス（Pulse / CC0）が表示またはリポジトリで追跡できる

## 13. 実装への引き継ぎ

次の工程は `writing-plans` に従い、本設計をタスク分割した実装計画を作ること。実装計画では少なくとも次を具体化すること。

- Soft Mint 資産のコピー範囲（fonts / tokens / components）
- Pulse キットの取得・配置手順と、24 キットから A/B パックへの具体的な割当表
- 画面を `index.html` + `play.html` の 2 ファイルにするか、単一 HTML で切り替えるか
- Service Worker の precache リスト更新手順（`adhd-bgm` の revision スクリプト踏襲の可否）
