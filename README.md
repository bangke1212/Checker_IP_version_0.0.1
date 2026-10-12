# IP/Sentinel DApp

IP/Sentinel adalah dashboard live untuk memeriksa reputasi publik IP yang terlihat oleh request ke aplikasi. Aplikasi ini menampilkan IP publik, ASN/provider, estimasi tipe jaringan, reverse DNS, pemeriksaan DNSBL publik, dan browser speed probe.

## Fitur

- Live polling setiap 30 detik.
- Health score 0–100 berbasis sinyal publik.
- Deteksi lokasi dan provider melalui IPWho.is.
- Estimasi tipe IP **Residential**, **Mobile**, **Datacenter**, atau **Unknown** beserta tingkat keyakinannya.
- Reverse DNS melalui resolver server.
- Pemeriksaan SpamCop dan DroneBL melalui DNSBL.
- Form IP lookup manual untuk memeriksa metadata IPv4 pilihan.
- Tes speed ringan dari browser melalui Cloudflare Speed endpoint.
- Navigasi **Overview**, **IP Intelligence**, **Tools**, **Reports**, dan **Privacy** dengan konten berbeda.
- Laporan hasil scan terkini dapat dicetak/disimpan sebagai PDF dari browser atau diunduh sebagai JSON; tidak ada arsip histori di server.
- Tidak meminta password, cookie, token, seed phrase, atau kredensial DAWN.

## Bagian dashboard

- **Overview** merangkum IP aktif, kesehatan, lokasi, organisasi, reputasi, reverse DNS, dan hasil tes browser.
- **IP Intelligence** menampilkan rincian metadata dan status tiap sumber reputasi untuk IP yang dipilih.
- **Tools** menyediakan lookup IPv4 manual dan tes koneksi browser.
- **Reports** membuat ekspor dari hasil scan saat ini; laporan tidak otomatis disimpan sebagai histori.
- **Privacy** menjelaskan pemrosesan IP oleh aplikasi serta lookup ke provider eksternal.

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Build produksi:

```bash
npm run build
npm run start
```

## Deploy ke Vercel

1. Buka [Vercel](https://vercel.com/).
2. Pilih **Add New Project**.
3. Import repository `bangke1212/Checker_IP_version_0.0.1`.
4. Framework akan terdeteksi sebagai Next.js.
5. Tidak ada environment variable wajib.
6. Klik **Deploy**.

Jika repository masih menggunakan nama lama atau project berada di GitHub lain, pilih repository yang sesuai dengan branch `main`.

## Cara membaca hasil

`IP/Sentinel` memeriksa IP client yang diteruskan oleh header `x-forwarded-for` atau `x-real-ip`. Pada Vercel, ini biasanya adalah IP pengunjung yang terlihat oleh edge proxy. Pemeriksaan reputasi DNSBL dan metadata IP dilakukan oleh serverless function Vercel.

Untuk memeriksa proxy, masukkan **IP publik IPv4 saja** pada form `Check a proxy IP`. Tool memeriksa metadata, reverse DNS, dan DNSBL untuk IP tersebut. Tool **tidak menghubungkan request melalui proxy**, tidak menguji username/password proxy, dan tidak menerima kredensial proxy.

IP yang masuk blacklist publik diberi status `REVIEW`. Hasil `HEALTHY` berarti sinyal publik yang diperiksa saat itu terlihat normal; hasil ini **bukan jaminan** bahwa IP diterima oleh sistem internal DAWN atau bahwa akun/reward DAWN akan memenuhi syarat.

## Privasi dan batasan

Demo ini tidak memiliki database dan tidak menyimpan IP di server aplikasi. Provider eksternal yang dipanggil dapat memiliki kebijakan log mereka sendiri. IP mentah tidak ditulis ke blockchain. Hasil publik juga tidak dapat mengetahui internal risk flag, histori akun, atau keterkaitan IP dengan kredensial DAWN.

DNSBL bukan sumber kebenaran tunggal. False positive, rate limit, resolver failure, dan perbedaan reputasi antar-provider tetap mungkin terjadi.

Tipe IP adalah estimasi dari metadata koneksi/provider yang tersedia. Nilai `Unknown` berarti sumber data belum memberi sinyal yang cukup; kategori tersebut bukan verifikasi pasti jenis koneksi fisik.

## Struktur

```text
app/
├── api/check/route.ts   # Serverless IP, DNSBL, dan metadata
├── dashboard-sections.tsx # Konten IP Intelligence, Tools, Reports, dan Privacy
├── globals.css          # Visual system
├── layout.tsx           # Metadata dan root layout
├── page.tsx             # Live dashboard dan navigasi bagian
└── types.ts             # Tipe data bersama untuk hasil pemeriksaan
public/
└── manus-routes.json

dawn-vps/                # Runner Chrome DAWN yang dibuat sebelumnya
```
