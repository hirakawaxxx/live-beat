# live-beat 向け追加オープン／再配布可能オーディオソース調査

Date: 2026-11-11  
Scope: Groovepad 型ループパッド PWA（現状: Pulse Open Loops + CueHarbor サブセット）向けに、追加で取り込めるオープン／再配布可能な音源を調査。SoundFont（`.sf2` / `.sf3`）、CC0／CC-BY ループ・ステム、ワンショットドラムキット、再配布禁止ソースの明示除外を含む。コード変更なし。

典拠の信頼性: 公式ライセンスページ・作者ドキュメントを優先し、二次まとめ（MIDI Field Guide など）は横断用の補助として扱う。

---

## 1. Executive summary

**結論: ライブラリは意味のある規模で増やせる。ただし「SoundFont をそのまま載せる」より「CC0／CC-BY のループ・ステムを束ねる」＋「ワンショットを短いループにシーケンスする」が live-beat の本線に合う。**

理由は次のとおりである。

1. **再配布可能なループ／ステムはまだ十分ある。** Pulse Open Loops・CueHarbor 以外にも、Colorosse（CC0／CC-BY、シームレスループ＋ステム）、Software-Entwicklungskit「Everything is Free」（全ステム CC0）、OpenGameArt の CC0 曲・ループ、ccMixter の CC0 ループ、VCSL／VSCO 由来のパーカッション素材などが確認できる。
2. **SoundFont は合成バンクであり、テンポ同期レイヤードループのパックではない。** 公開 Web アプリへの同梱自体は FluidR3／MuseScore_General（MIT）などで可能な場合があるが、Groovepad 型の「パッドに乗せる既製ループ」体験には直結しない。オフラインで MIDI をループ WAV に焼き出すか、ブラウザ合成エンジンを別系統で持つ必要がある。
3. **「無料・royalty-free」≠「アプリにサンプルを同梱できる」。** SampleRadar・Looperman・Philharmonia・Pianobook などは、楽曲への組み込みは許しても、生サンプルの再配布を禁じる。ここを誤ると法的リスクが最大になる。

**PWA バンドル観点の現実解:** 初期バンドルは軽い CC0 ステム／ループ（Colorosse の CC0 音楽、CueHarbor 追加ループ、自前シーケンスした短いドラムループ）を優先し、重いオーケストラ系（VSCO 2 CE 約 3 GB、VCSL 約 5 GB）はオンデマンド取得か生成パイプライン用に回す。

---

## 2. SoundFont セクション（live-beat 向け実務判断）

### 2.1 前提の正直な整理

SoundFont（SF2／SF3）は、**MIDI ノートを鳴らすための楽器サンプル＋エンベロープ等の合成バンク**である。  
ライブ・ビートのような「BPM タグ付きのレイヤード・ループをパッドに載せる」資産とは種類が違う。

| 用途 | SoundFont | ループ・ステムパック |
|------|-----------|----------------------|
| テンポ同期の完成ループ | そのままでは不可 | 本来の用途 |
| 楽器音色の即時演奏 | 本来の用途 | 不向き |
| PWA 同梱サイズ | 数 MB〜200 MB 級が多い | ループ単位で選べる |
| live-beat への適合 | 間接的（変換／別エンジンが必要） | 直接的 |

### 2.2 主要バンク比較

| 名称 | ライセンス | おおよそのサイズ | 公開 Web アプリへの再配布 | テンポ同期レイヤード・ループ向きか |
|------|------------|------------------|---------------------------|-----------------------------------|
| **FluidR3_GM** | MIT（Frank Wen） | SF2 約 148 MB（Debian `fluid-soundfont`） | **Yes**（著作権・許可通知の保持） | **No（そのままでは）**。楽器バンク |
| **GeneralUser GS** | カスタム許可型（完全体の利用・改変・ソフト同梱可）。サンプル由来に作者自身の不確実性注記あり | SF2 約 30–60 MB 帯（版により差）。作者は Web／モバイル向け SF3 圧縮を案内 | **Conditional Yes**（完全体としての同梱は作者が許可。個別サンプル抽出再配布は別問題。ホットリンク禁止、自前ホストまたは公式サイトへ誘導） | **No（そのままでは）** |
| **MuseScore_General** | MIT（FluidR3Mono 系＋置換楽器）。謝辞・著作権表示必須 | SF2 約 206 MB／SF3 約 38 MB | **Yes**（MIT＋表示義務） | **No（そのままでは）** |
| **Arachno** | フリーウェア。私的・非商用が主。商用は原作者の書面同意が必要。出所不明サンプルあり | 約 148 MB | **No（live-beat 向けには不推奨）** | 不適 |
| **VSCO 2 Community Edition（関連）** | CC0。公式は SFZ／WAV。第三者の SF2 変換も存在するが公式ではない | 約 3 GB | **Yes（原サンプルは CC0）**。公式は SF2 非互換を明記 | **No としてループ代替には不向き**。ワンショット／短いフレーズ焼き出しの素材には有用 |
| **TimGM6mb** | GPL-2 | 約 5.7 MB | **Conditional**（GPL。レンダリング結果への copyleft 解釈リスクが議論される） | 不適（品質も薄い） |
| **FreePats GM set** | GPL-3+ ＋作曲例外 | SF2 約 227 MB | **Conditional**（GPL＋例外。未完成 GM） | 不適（ループ代替ではない） |

**典拠（一次）**

- FluidR3 MIT / Debian 配置: [gsequencer README](https://gsequencer.com/download/README_fluid_soundfont_gm.txt)、[Debian fluid-soundfont](https://sources.debian.org/src/fluid-soundfont/3.1-5.3)
- MuseScore_General MIT: [MuseScore_General_License.md](https://download.musescore.com/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md)
- GeneralUser: [mrbumpy409/GeneralUser-GS](https://github.com/mrbumpy409/GeneralUser-GS)、[MIDI Field Guide 要約](https://midi.community/samples/sources/)
- Arachno 非商用注意: [arachnosoft documentation](https://arachnosoft.com/main/soundfont.php?documentation=)
- VSCO 2 CE CC0: [versilian-studios.com/vsco-community](https://versilian-studios.com/vsco-community/)、[sgossner/VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE)
- FreePats: [freepats.zenvoid.org](https://freepats.zenvoid.org/SoundSets/general-midi.html)

### 2.3 変換／ワークフロー選択肢（live-beat 適合）

| 方式 | 内容 | live-beat への適合 |
|------|------|-------------------|
| **A. オフライン事前レンダ** | FluidSynth 等で MIDI パターンを固定 BPM の WAV／OGG ループに焼く。ライセンスは元バンクに従い、生成物も MIT／CC0 元なら再配布しやすい | **最も適合**。既存のループパッド UX を壊さない |
| **B. WebAudioFont / midi-js-soundfonts** | SF2 由来の楽器をノート単位オーディオや JS データとして配信。WebAudioFont は GeneralUser／Fluid 系を利用 | **楽器パッド／キーボード向き**。テンポ同期レイヤー・ループ本体の代替にはならない |
| **C. ブラウザ SF2 シンセ（例: midiocre 系、sf2 パーサ＋Web Audio）** | 実行時に SF2 を読み MIDI を鳴らす | 技術的には可能だが、ループパッド製品としては別アプリ寄りの複雑さ・メモリ負荷 |
| **D. Tone.js** | スケジューラ・エフェクト・サンプラーとしては優秀。SF2 エンジンそのものではない | **既存ループ再生・ワンショットシーケンスの土台**向き。SoundFont 解決策ではない |
| **E. VSCO／VCSL からワンショット抽出→短いループ生成** | CC0 なので法的に最もきれい。オフラインで 1〜4 小節のキットを自作 | **中長期の音色多様化**に有効。初期バンドルには重い |

### 2.4 live-beat への実務推奨

1. **パッド用コンテンツの本線に SoundFont を置かない。** 「ループ庫を増やす」課題の主解ではない。
2. **どうしても音色幅を合成で取りたい場合だけ、A（オフライン事前レンダ）を限定採用する。** 候補バンクは **MuseScore_General.sf3（約 38 MB・MIT）** または **FluidR3（MIT）**。GeneralUser はサイズは魅力だが、サンプル来歴の注記と「完全体以外の抽出」に注意。
3. **Arachno・出所不明混在バンク・GPL 単体寄り（TimGM6mb）は避ける。**
4. **ブラウザ内 SF2 再生は、live-beat の第 1 優先機能にしない。** UX・キャッシュ・CPU のコストがループ同梱より大きい。

---

## 3. ループ／ステム短リスト（上位 5–8）

列「PWA bundle」の定義: 公開 Web アプリ／リポジトリにオーディオファイルを同梱して配信してよいか。

| # | ソース | ライセンス | BPM／長さの多様性 | PWA bundle | コメント |
|---|--------|------------|-------------------|------------|----------|
| 1 | **Colorosse Music**（Arcade／Vellum など CC0、他は CC-BY-4.0） | パック単位で CC0-1.0 または CC-BY-4.0。同梱・改変・再配布可と明記 | 例: Arcade 約 152 BPM・6.3 秒＋4 ステム、Vellum 約 128 BPM、Anvil 約 62 BPM など。シームレス＋ステム | **Yes**（CC0）／**Conditional**（CC-BY は帰属表示） | Pulse 系と並び、レイヤード・パッドに最も近い。まず CC0 曲から |
| 2 | **Software-Entwicklungskit — Everything is Free** | 全ステム・アート・歌詞が **CC0 1.0** | 7 曲、BPM 90–140、キー付き、ステム数 9–38／曲 | **Yes** | ジャンル横断のステム密度が高い。曲全体からの切り出しでループ化が必要 |
| 3 | **CueHarbor sound-library（Hugging Face）拡張** | CC0-1.0／PD。現状サブセット利用済み | テンポタグ付きループ約 34＋大量ワンショット。BPM 例 76–172 | **Yes** | 既存統合の延長でリスク最小。ドラム／パーカッション／メロディの隙間埋め |
| 4 | **Pulse Open Loops 追加キット**（未取り込み分） | オリジナル合成キットは **CC0**。個別 audition 素材は CC0／CC-BY 混在 | キット単位で 96／120／140 BPM、drums/bass/chords/percussion の 4 層 | **Yes**（キット CC0）／**Conditional**（CC-BY 個別） | すでに製品思想が一致。未取り込みキットの追加が最速 |
| 5 | **OpenGameArt 厳選 CC0**（例: Melodic EDM Loops、Music loop variations 100 BPM、Elevate ステム、Fat Groove Drums 120） | 各投稿のライセンスを個別確認（CC0 のみ採用） | 投稿ごとにバラバラ。100–140 BPM 帯が多い | **Yes**（CC0 のもの） | 品質・長さが不揃い。キュレーション必須 |
| 6 | **ccMixter CC0 ループ**（例: Andrew Wainwright 130–140 BPM パック、MarchMellow 96 BPM ステム） | 投稿ごとに表示。CC0 を選ぶ | BPM 表示あり。テクノ／トランス寄りが多い | **Yes**（CC0） | 電子系の穴埋め向き。アップロード品質はばらつく |
| 7 | **VCSL Percussion サブセット**（Hugging Face `schismaudio/vcsl-percussion` 等） | **CC0-1.0**（親ライブラリ VCSL も CC0） | ワンショット中心（約 1.5 GB パーカッション抽出） | **Conditional**（全文同梱は重い。選抜 Yes） | ループそのものではないが、短いループ生成の原料として優秀 |
| 8 | **University of Iowa MIS** | サイト文言: *any projects, without restrictions*（形式的 CC 表記なし） | 単音クロマチック。ループではない | **Conditional Yes**（文言は広いが、ループ化作業が必要。クレジット礼儀推奨） | 楽器ワンショット原料。Philharmonia より再配布向き |

**補足（リスト外だが有用）**

- **Karoryfer 無料ライブラリ群**（Big Rusty Drums、Virtuosity Drums など）: 作者サイト上で無料庫は CC0 と宣言（Marie Ork は例外）。ワンショット／キット原料。
- **Freesound**: ファイル単位で CC0／CC-BY／CC-BY-NC。NC と Sampling+ 旧稿を除外すれば使えるが、キュレーションコストが高い。

---

## 4. ワンショット・ドラムキット（短いループへシーケンス可能）

| キット／庫 | ライセンス | サイズ感 | 再配布 | live-beat での使い方 |
|------------|------------|----------|--------|----------------------|
| **CueHarbor one-shots**（既存系統） | CC0／PD | ライブラリ全体で多数 | Yes | 既存パイプラインで 1–2 小節ループを生成 |
| **Salamander Drumkit** | 作者サイトは 2022-04-03 以降 **public domain** と宣言。旧配布は CC-BY-SA 表記が残るミラーあり | 約 370 MB | **Conditional**（PD 宣言を一次で確認してから。旧 SA ミラーに注意） | アコースティック・キットのシーケンス |
| **Karoryfer Big Rusty Drums** | CC0 | 約 2.3 GB／4400+ samples | Yes | 選抜ワンショットのみバンドルし、残りは生成用 |
| **Virtuosity Drums**（Versilian × Karoryfer） | CC0 | 中〜大 | Yes | ジャズ寄りキット＋GM パーカッション |
| **DrumGizmo／FreePats MuldjordKit** | 多くが CC-BY-4.0 | SF2 約 53 MB など | Yes（帰属） | 帰属表示コストと引き換えに品質 |
| **AVL Drumkits** | CC-BY-SA-3.0 | キット依存 | Conditional（改変再配布は SA） | シェアアライクがアプリ配布ポリシーと合うか要判断 |
| **VCSL パーカッション** | CC0 | 選抜可 | Yes | ワールド／実験パーカッションの幅 |

**推奨ワークフロー:** ワンショットを DAW またはオフラインスクリプトで 90／100／120／140 BPM の 1–4 小節ループに焼き、メタデータ（BPM・キー・レイヤー役割）を付けてパッド庫へ入れる。ブラウザ上で本格ドラムマシン化する必要はない。

---

## 5. 明示除外（再配布禁止・不適合）

| ソース | 理由 |
|--------|------|
| **SampleRadar（MusicRadar／Future）** | royalty-free で楽曲利用可だが、**再配布禁止**が明記 |
| **Looperman（as-is）** | 楽曲への組み込みは可だが、ループの as-is 再配布（他サイト・アプリ・ソフトへの掲載）を禁止。サンプルパック化も不可。権利保証も弱い |
| **Philharmonia Orchestra sound samples** | 商用作品への利用は可。**samples / sampler instrument としての提供は禁止** → PWA 同梱不可 |
| **Pianobook** | 個人の楽曲利用向け。**パックの再配布・他サンプラー向け再フォーマット配布を禁止** |
| **Arachno SoundFont** | 非商用中心・第三者音源混在・商用は書面同意 |
| **Sonatina／Virtual Playing Orchestra 系の一部** | Sampling+ や混在ライセンスで「ライブラリ全体の自由再配布」が弱い |
| **Titanic 等の「PD 自称だが LICENSE が再配布禁止」系** | FreePats も非フリーと判断。信用しない |
| **「無料ダウンロード」商用パックのプロモ（Splice 無料枠、雑誌付録の多く）** | 多くは use-in-music only。個別 EULA なしでの同梱は不可 |
| **Freesound の CC-BY-NC／旧 Sampling+** | 商用 PWA・収益化と衝突しうる |

「ゲームやアプリでループを使ってよい」と FAQ が書いてあっても、**生ファイルをアプリ資産として再配布してよいか**は別問題である。Looperman はその典型である。

---

## 6. 推奨取得計画（法的リスク最小で多様性最大）

優先度は「legal clarity × pad UX 適合 × サイズ」で並べる。

### Phase 0（即時・ほぼゼロリスク）

1. **Pulse Open Loops の未取り込み CC0 キット**を追加する。  
2. **CueHarbor** の未使用テンポタグ付きループと、選抜ワンショットから生成した短ループを追加する。  
3. **Colorosse の CC0 音楽**（Arcade、Vellum など）をステム単位でパッド化。CC-BY 曲はクレジット画面を用意してから。

### Phase 1（最大の聴感バラエティ／低リスク）

4. **Software-Entwicklungskit** から、BPM 別に 4–8 小節相当のレイヤーを切り出して同梱（全 CC0）。  
5. **OpenGameArt／ccMixter** から CC0 のみ人手オーディション（10〜30 本）。電子・ドラム偏重の穴を埋める。  
6. **Karoryfer／Virtuosity／VCSL perc の選抜ワンショット**で、自前 90／120／140 BPM ドラム・パーカッション・ループを 20–40 本生成。

### Phase 2（任意・間接）

7. SoundFont は **採用しないか、オフライン事前レンダの音色ソースに限定**（MuseScore_General.sf3 または FluidR3）。ブラウザ SF2 エンジンは後回し。  
8. Iowa MIS／VSCO は「メロディック・ワンショット→アルペジオ短ループ」の原料として、需要が出てから。

### やらないこと

- SampleRadar／Looperman／Philharmonia／Pianobook の同梱。  
- Arachno や来歴不明 GM バンクの同梱。  
- 数 GB のオーケストラ庫を初期 PWA バンドルに丸ごと入れること。

---

## 7. 調査限界

- GeneralUser の「全サンプルの完全な系譜」は作者自身が 100% 保証していない（長年苦情なしとの注記はある）。商用アプリでは MIT の Fluid／MuseScore_General の方が説明しやすい。  
- Salamander Drumkit は PD 宣言と旧 CC-BY-SA 表記が流通に混在する。同梱前に作者一次ページと配布アーカイブ内 LICENSE を突合すること。  
- Colorosse／OpenGameArt／ccMixter はパック・投稿単位ライセンスのため、取り込み時に再確認が必要。  
- 本調査は法的助言ではない。最終判断は配布地域と収益モデルに応じて確認すること。

---

## 主要 URL 索引

| トピック | URL |
|----------|-----|
| 横断カタログ | https://midi.community/samples/sources/ |
| Pulse Open Loops | https://pulse.studiosphere.space/open-loops |
| CueHarbor HF | https://huggingface.co/datasets/cueharbor/sound-library |
| Colorosse license | https://www.colorosse.com/license |
| Colorosse music | https://www.colorosse.com/assets/audio/music |
| Software-Entwicklungskit | https://ev3.ichbinsoftware.com/ |
| MuseScore_General license | https://download.musescore.com/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md |
| GeneralUser GS | https://github.com/mrbumpy409/GeneralUser-GS |
| Arachno docs | https://arachnosoft.com/main/soundfont.php?documentation= |
| VSCO 2 CE | https://versilian-studios.com/vsco-community/ |
| VCSL | https://versilian-studios.com/vcsl/ |
| Iowa MIS | https://theremin.music.uiowa.edu/MIS.html |
| Philharmonia（除外） | https://philharmonia.co.uk/resources/sound-samples/ |
| SampleRadar hub（除外） | https://www.musicradar.com/news/tech/free-music-samples-royalty-free-loops-hits-and-multis-to-download-sampleradar |
| Looperman FAQ（除外） | https://www.looperman.com/help/faq/loops |
| Pianobook EULA（除外） | https://www.pianobook.co.uk/terms-conditions/ |
| Karoryfer free | https://shop.karoryfer.com/pages/free-samples |
| FreePats GM | https://freepats.zenvoid.org/SoundSets/general-midi.html |
| WebAudioFont | https://surikov.github.io/webaudiofont/ |
