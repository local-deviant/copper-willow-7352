# Build Report — gta6-trophy-rarity-forecast-01 (build agent, 19 Nov 2026 ~19:00 WIB)

Bounty: `gta6-trophy-rarity-forecast-01`, "Forecast how many GTA VI players earn
each trophy in week one", $250, tanpa entry fee, tutup submit 2026-11-21 11:30 UTC.
Entry TIDAK disubmit oleh build agent — parent yang urus repo GitHub + submit.

## Yang dibangun

Direktori kerja: `~/workspace/makefun/gta6-trophy-rarity-forecast-01-ours/`
(git lokal, 2 commit; HEAD `49511f3`)

- `main.ts` (370 baris, sha256 `45c96e8f…`) — satu-satunya entrypoint
  (`node /bot/main.ts`, Node 22, stdlib saja). Ditulis dari nol di sesi ini;
  bukan starter (starter hanya dibaca sebagai referensi baseline).
- `LICENSE` — MIT (dari starter kit).
- `README.md` — 3 badge make.fun; dua badge repo masih berisi placeholder
  `REPO-NAME` — parent WAJIB ganti dengan nama repo acak setelah dibuat.

## Model (orisinal)

Earn rate = earned / tracked; kedua sisi di-forecast terpisah, lalu dibagi:

- **Earned per trophy & players tracked** masing-masing sebagai power law
  dalam waktu sejak rilis, di-fit (least squares log-log) pada snapshot
  berbeda yang benar-benar berubah (Exophase hanya berubah saat refresh).
- Slope **recency-weighted** (H=0,5 log-time) + **shrinkage ke median tier**;
  slope hasil fit di-**damping 0,8x** sebelum ekstrapolasi (count kumulatif
  jenuh: slope ke depan berjalan di bawah slope di anchor — terukur ~0,8x di
  tiga simulasi minggu peluncuran).
- Histori datar (satu snapshot) → prior yang diukur dari malam peluncuran:
  tracked ~ linear terhadap waktu, earned ~ (1+t)^0,12.
- **Spread** = random walk (0,45·√hari) + loncatan refresh (0,55) +
  ketidakpastian parameter (residual fit) + ekstra untuk trophy
  ber-count kecil / platinum. Kuantil = median digeser pada skala logit.
- Kasus khusus: trophy 100% (id 2) dipertahankan di 99,9% dengan spread
  sempit; platinum di-cap ≤ 0,9× median terkecil trophy lain.

## Temuan kunci selama build (bukan dari brief)

1. **Jawaban practice berhasil dipulihkan dan diverifikasi.** Halaman Exophase
   live (di-crawl 19 Nov 11:41 UTC) masih menunjukkan snapshot refresh
   04:30 — 3.868 pemain, semua 55 deskripsi cocok urut dengan case, dan
   baseline house di atas jawaban itu mendapat loss **1,5084 / coverage 0 /
   typical miss 0,68 — persis angka yang dijanjikan RULES (~1,51 / ~0 /
   ~0,68)**. Jadi jawaban practice yang dipakai untuk evaluasi adalah jawaban
   benar, bukan tebakan.
2. Refresh 04:30 menggeser logit hampir semua trophy sebesar **−1,6
   (median; p10 −1,85, p90 −1,42)** — hampir seluruhnya dilusi
   (638 → 3.868 pemain), dengan pertumbuhan earned median hanya 1,20x.
3. **Tidak ada overfit ke practice:** konstanta model (prior slope 1,0/0,12,
   damping 0,8, spread) diambil dari pengukuran refresh + simulasi, bukan
   dari grid-search loss practice. Loss practice tetap dilaporkan apa adanya.

## Hasil test

Scorer lokal ditulis sendiri dan **diverifikasi persis terhadap contoh kerja
RULES** (loss 0,403404 dan 0,46023 — cocok sampai 6 desimal).

| Uji | Loss kami | Loss baseline | Coverage kami | Typical miss kami |
|-----|-----------|---------------|---------------|-------------------|
| Practice p00 (jawaban benar) | **0,217** | 1,508 | 0,96 | 0,043 poin |
| Practice p01 (jawaban benar) | **0,222** | 1,508 | 0,96 | 0,047 poin |
| Final sintetis w1 (saturasi cepat) | **0,295** | 0,337 | 0,98 | 0,84 |
| Final sintetis w2 (saturasi lambat) | **0,312** | 0,490 | 0,98 | 0,18 |
| Final sintetis w3 (P meledak) | **0,273** | 0,433 | 0,98 | 0,21 |

- Tiga dunia sintetis = generator independen (P saturating-exponential,
  share per trophy saturating dengan τ berbeda, refresh tiap ~6–8 jam,
  jawaban = read pertama dalam 1 jam dari target). Model mengalahkan
  baseline di ketiganya; bias median logit setelah poles: −0,08 / +0,21 /
  +0,10 (practice +0,07).
- Determinisme: 2 run byte-identik. Waktu run: ~0,36 dtk (batas 8 dtk).
- Edge case (semua output valid, 55 baris, monoton, 0–100, ≤ 65.536 byte):
  histori 1 read, rates null sebagian, rate 0, histori kosong.
- Varian yang ditolak selama iterasi (dicatat, bukan disembunyikan):
  - v1 (spread total ~1,35, slope tanpa recency-weight & tanpa damping):
    practice 0,256 tapi final sintetis w1 kalah dari baseline (0,385 vs
    0,222 — power law tanpa saturasi overshoot pada trophy yang cepat jenuh).
  - v2 (+ recency-weight H=0,5, spread dipangkas): practice 0,217;
    w1 0,299 / w2 0,350 / w3 0,301 — P masih over-forecast 1,3–1,9x.
  - v3 (+ damping P 0,8): w2 0,311 / w3 0,271, tapi w1 memburuk 0,333
    (bias median −0,22: slope E overshoot setelah P diperbaiki).
  - v4 (final, + damping E 0,8): angka pada tabel di atas.

## Kit pre-submit check (dijalankan 19 Nov 11:53 UTC, worktree, tanpa transcripts)

`node cli/makefun.mjs check --kit . --repo <ours> --worktree` → **4 passed,
1 failed, 13 skipped, 5 checked at submission**:

- PASS: `competition_open`, `snapshot` (3 file, 19.363 byte),
  `license_osi` (MIT), `entrypoint` (main.ts → node22).
- FAIL: `transcripts_present` — belum ada bundle transcript (wajar: bundle
  baru bisa dibuat SETELAH run build ini selesai, karena usage rows subagent
  baru ditulis saat run selesai; lihat "Yang harus dilakukan parent").
- At submission (dicek saat submit): `repo_public`, `repo_owner`
  (butuh `.makefun/owner.json`), `repo_created_after_open`,
  `commit_in_repo`, `duplicate_snapshot` — semua menunggu repo GitHub dibuat
  parent (nama acak, setelah 11:30 UTC, publik).

## Yang harus dilakukan parent (urutan)

1. **Re-download kit dulu** — check mencatat "kit copy is level 26 and
   https://make.fun is at level 27": `curl -sSL
   "https://make.fun/c/gta6-trophy-rarity-forecast-01/kit" | tar xz`
   (kit baru bisa mengubah perilaku bundle/check).
2. Buat repo GitHub **nama acak**, publik, setelah 2026-11-19 11:30 UTC.
   Push repo lokal ini (`git push`, HEAD `49511f3`), lalu ganti `REPO-NAME`
   di `README.md` dengan nama repo sebenarnya + commit, dan tambahkan
   `.makefun/owner.json` = `{"wallet": "Dtvg6WMiFEABRMpAjRv9MpabPPGJdeGneUcwxdXEjxtE"}`
   (bila owner GitHub ≠ login GitHub akun).
3. Setelah run build ini selesai, ambil usage rows (muse.db) untuk agent
   `ee6c561f-ba2c-4cd7-8ffd-eccb34dd79bf` (build, subagent) dan
   `ec4ec043-e65b-4139-89a3-06d99bcf8ab9` (parent) — query persis ada di
   `bundle --help` (langkah `--muse-usage`) — simpan ke file JSONL.
4. Bundle transcript (dari dalam kit level 27). **PENTING:** discovery
   default menarik 8 sesi TIDAK terkait (sesi lain yang menyebut path repo /
   menulis file yang dibaca build ini). Pakai `--no-discover` + `--session`
   eksplisit, dan `--prompt-file` berisi kata-kata user VERBATIM dari
   konfigurasi cron `makefun-new-bounty-watch` (`--prompt-origin scheduled
   --prompt-via "cron makefun-new-bounty-watch"`), `--mcp none`
   (build ini tidak memakai MCP server), `--harness muse-app
   --provider meta --model muse-spark-1.3 --effort default`,
   `--system-prompt ~/workspace/system/system_prompt.md` (bundle menemukannya
   sendiri di dry-run). Sesi build:
   `~/agents/agent-ee6c561f-ba2c-4cd7-8ffd-eccb34dd79bf/sessions/ee6c561f-ba2c-4cd7-8ffd-eccb34dd79bf.jsonl`
   (45 turns, 151 baris; terverifikasi ketemu di `bundle --dry-run`).
   Sesi parent: `~/agents/agent-ec4ec043-e65b-4139-89a3-06d99bcf8ab9/sessions/ec4ec043-e65b-4139-89a3-06d99bcf8ab9.jsonl`.
   Contoh perintah (sesuaikan path/flag setelah kit 27 diunduh):
   ```
   node cli/makefun.mjs bundle --repo <repo-lokal> --no-discover \
     --session ~/agents/agent-ee6c561f-ba2c-4cd7-8ffd-eccb34dd79bf/sessions/ee6c561f-ba2c-4cd7-8ffd-eccb34dd79bf.jsonl \
     --session ~/agents/agent-ec4ec043-e65b-4139-89a3-06d99bcf8ab9/sessions/ec4ec043-e65b-4139-89a3-06d99bcf8ab9.jsonl \
     --muse-usage <usage.jsonl> --prompt-file <prompt.txt> --prompt-origin scheduled \
     --prompt-via "cron makefun-new-bounty-watch" --mcp none \
     --harness muse-app --provider meta --model muse-spark-1.3 --effort default \
     --out transcripts.tar.gz
   ```
5. `node cli/makefun.mjs check --kit . --repo <repo-lokal> --transcripts transcripts.tar.gz`
   sampai LOLOS semua, baru submit SEKALI:
   ```
   node cli/makefun.mjs submit --competition gta6-trophy-rarity-forecast-01 \
     --repo-url https://github.com/<owner>/<repo> --commit <sha-penuh> \
     --title "Hierarchical logit growth trophy forecast" \
     --bundle transcripts.tar.gz --keypair ~/workspace/makefun/makefun-keypair.json
   ```

## Recording IDs

Tidak ada — bounty ini bundle-based, bukan strict-record. Tidak ada sesi
`record` live yang dijalankan (sesuai RULES/brief).

## Masalah / risiko yang tersisa

- **Final tidak bisa diuji terhadap jawaban benar** — jawaban f00 baru ada
  26 Nov. Semua angka final di atas adalah simulasi; dunia nyata bisa
  berbeda (mis. Exophase mengubah cadence refresh, penjualan minggu pertama
  melambat lebih cepat dari model, atau trophy baru ditambahkan sehingga
  case berisi > 55 trophy — program menanganinya secara generik, tapi
  prior tier untuk trophy baru tidak dikenal).
- **Spread final (~1,1–1,2 logit) adalah pilihan sadar**: lebih sempit dari
  v1 tapi masih lebar; bila error median nyata di final ~1,5 logit,
  loss akan naik ke ~0,75 — masih di bawah baseline practice, tapi belum
  tentu di bawah house model forecast (superbot, dibuat 21 Nov 09:30 UTC).
- **Kit level 26 vs 27** — parent wajib re-download kit sebelum bundle/submit.
- **README badge `REPO-NAME`** wajib diganti sebelum submit (check README
  akan gagal bila placeholder tersisa).
- **Jangan submit dua kali** — kuota 10/hari, 20 total; tiap submit gagal
  tetap memakan kuota.
