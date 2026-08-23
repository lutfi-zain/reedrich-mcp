# Panduan Publikasi & Setup ChatGPT Custom Actions (GPT Store)

Dokumen ini adalah panduan lengkap langkah-demi-langkah untuk mempublikasikan **Reedrich AI** ke **OpenAI GPT Store** menggunakan **ChatGPT Actions** dan **OAuth 2.0**, sehingga dapat digunakan oleh publik secara luas tanpa memerlukan Developer Mode.

---

## 1. Ikhtisar Parameter Integrasi

| Parameter | Nilai Resmi |
| :--- | :--- |
| **Worker Base URL** | `https://reedrich-mcp.lutfidmz.workers.dev` |
| **OpenAPI Schema URL** | `https://reedrich-mcp.lutfidmz.workers.dev/openapi.json` |
| **Privacy Policy URL** | `https://reedrich-mcp.lutfidmz.workers.dev/privacy` |
| **Authentication Type** | `OAuth` |
| **Client ID** | `chatgpt` (atau sesuai konfigurasi) |
| **Client Secret** | `chatgpt_secret` (atau secret apa saja yang Anda tentukan) |
| **Authorization URL** | `https://reedrich-mcp.lutfidmz.workers.dev/oauth/authorize` |
| **Token URL** | `https://reedrich-mcp.lutfidmz.workers.dev/oauth/token` |
| **Token Exchange Method** | `POST` (JSON / URL-encoded) |

---

## 2. Langkah-Langkah di ChatGPT GPT Builder

### Langkah 1: Buat Custom GPT Baru
1. Buka [ChatGPT GPT Editor](https://chatgpt.com/gpts/editor).
2. Di tab **Configure**, isi informasi profil:
   * **Name**: `Reedrich — AI Financial Manager`
   * **Description**: `Asisten keuangan pribadi cerdas: catat transaksi otomatis, pantau saldo multi-rekening, kelola hutang/piutang, dan hitung kekayaan bersih Anda secara matematis.`
   * **Profile Picture**: Gunakan ikon kalkulator, logo finansial, atau ikon modern.

### Langkah 2: Konfigurasi Instructions (System Prompt)
Salin instruksi berikut ke dalam kolom **Instructions**:

```markdown
Anda adalah Reedrich, asisten kecerdasan finansial pribadi dengan presisi matematis dan keramahan tinggi. Anda membantu pengguna mengelola uang, mencatat transaksi harian, memantau dompet/rekening, mengelola hutang/piutang, dan merencanakan kekayaan bersih.

Aturan Interaksi:
1. Format Mata Uang: Selalu format angka nominal dalam Rupiah yang mudah dibaca (misal: "Rp 50.000", "Rp 10.500.000").
2. Otomatisasi Cerdas:
   - Jika pengguna berkata "Beli kopi 25rb pakai QRIS BCA", otomatis cari dompet 'BCA', kategori 'Makanan & Minuman', dan panggil endpoint `recordTransaction`.
   - Jika pengguna belum memiliki dompet atau kategori, arahkan mereka untuk membuat dompet pertama menggunakan `createWallet` atau `createCategory`.
3. Validasi & Konfirmasi:
   - Minta konfirmasi sebelum mengubah nominal transaksi besar atau menghapus data.
4. Ringkasan & Visualisasi:
   - Sajikan laporan ringkasan kekayaan dalam tabel markdown yang rapi (Daftar Dompet, Pemasukan, Pengeluaran, Saldo Bersih, dan Total Hutang/Piutang).
```

### Langkah 3: Conversation Starters
Tambahkan 4 contoh pemicu percakapan di GPT Builder:
1. *"Berapa total kekayaan bersih dan saldo dompet saya saat ini?"*
2. *"Catat pengeluaran makan siang Rp 35.000 dari dompet BCA"*
3. *"Transfer Rp 150.000 dari BCA ke GoPay dengan biaya admin 1.000"*
4. *"Catat pinjaman ke Budi sebesar Rp 500.000 jatuh tempo akhir bulan"*

---

### Langkah 4: Tambahkan Action & Import OpenAPI Schema
1. Scroll ke bagian paling bawah tab **Configure**, klik **Create new action**.
2. Di bagian **Schema**, klik **Import from URL**, lalu masukkan:
   ```
   https://reedrich-mcp.lutfidmz.workers.dev/openapi.json
   ```
3. Klik **Import**. GPT Builder akan otomatis memuat seluruh 10 endpoint REST (`/api/v1/summary`, `/api/v1/wallets`, `/api/v1/transactions`, `/api/v1/transfers`, `/api/v1/debts-loans`, dll.).

---

### Langkah 5: Setup Autentikasi OAuth 2.0
1. Di bagian **Authentication**, pilih jenis **OAuth**.
2. Isi kolom konfigurasi sebagai berikut:
   * **Client ID**: `chatgpt`
   * **Client Secret**: `chatgpt_secret` (atau string pilihan Anda)
   * **Authorization URL**: `https://reedrich-mcp.lutfidmz.workers.dev/oauth/authorize`
   * **Token URL**: `https://reedrich-mcp.lutfidmz.workers.dev/oauth/token`
   * **Scope**: *(Kosongkan)*
   * **Token Exchange Method**: `Default (POST)`
3. Di kolom **Privacy Policy**, masukkan:
   ```
   https://reedrich-mcp.lutfidmz.workers.dev/privacy
   ```

---

### Langkah 6: Uji Coba & Publikasi ke GPT Store
1. Di panel pratinjau (kanan), ketik: *"Halo, cek saldo saya"*.
2. ChatGPT akan memunculkan tombol otorisasi: **"Log in to reedrich-mcp.lutfidmz.workers.dev"**.
3. Klik tombol tersebut untuk membuka halaman otorisasi web:
   * Pengguna lama bisa memasukkan API Key `rd_live_...`.
   * Pengguna baru bisa mengisi Nama, Email, dan No. WhatsApp untuk registrasi instan.
4. Setelah login berhasil, browser otomatis kembali ke ChatGPT dan Action langsung mengeksekusi request!
5. Jika semua berjalan lancar, klik tombol **Save** / **Publish** di pojok kanan atas, lalu pilih **Everyone (Public in GPT Store)**.

---

## 3. Kompatibilitas Lintas Platform

Akun yang dibuat atau digunakan di ChatGPT ini **100% interoperable**:
* **Claude Code, Cursor, Pi, OpenCode**: Pengguna bisa menggunakan API Key yang sama (`rd_live_...`) di client MCP mana pun.
* **ChatGPT Custom GPT**: Pengguna awam cukup login sekali via web browser tanpa perlu Developer Mode.
