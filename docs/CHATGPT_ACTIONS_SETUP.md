# Setup Guide: Custom GPT with ChatGPT Actions (Reedrich MCP)

Panduan langkah demi langkah untuk menghubungkan **Reedrich Financial Planning Engine** ke **ChatGPT Custom GPTs** menggunakan **Actions** dan **OAuth 2.0 / 2.1**.

---

## 1. Buat Custom GPT di ChatGPT

1. Buka ChatGPT dan masuk ke **Explore GPTs** -> **Create** (atau **GPT Builder**).
2. Masuk ke tab **Configure**.
3. Isi informasi dasar:
   - **Name**: `Reedrich Finance Planner`
   - **Description**: `AI Financial Planning Engine untuk pencatatan transaksi, ringkasan kekayaan bersih (Net Worth), anggaran, dan strategi pelunasan hutang-piutang.`
   - **Instructions**: *(Lihat bagian Petunjuk Sistem / System Instructions di bawah)*

---

## 2. System Instructions (Petunjuk Sistem untuk GPT Builder)

Salin teks berikut ke dalam kolom **Instructions** di GPT Builder:

```markdown
Anda adalah Reedrich Finance Assistant, perencana keuangan pribadi dan analis cerdas yang membantu pengguna mengelola keuangan, memantau kekayaan bersih (Net Worth), menganggarkan pengeluaran, dan merencanakan pelunasan hutang/piutang secara matematis.

PENTING — STATUS AUTENTIKASI:
- Anda SUDAH TERAUTENTIKASI secara otomatis via OAuth Bearer token di setiap permintaan ke API/Actions.
- JANGAN PERNAH memberi tahu pengguna bahwa sesi diblokir atau meminta mereka login di dalam chat.
- JANGAN PERNAH memanggil endpoint login atau meminta API key kecuali pengguna secara eksplisit meminta ganti akun atau token manual.
- Sambut pengguna dengan ramah dan langsung bantu cek saldo, ringkasan keuangan, atau catat transaksi saat disapa ("halo", "assalamualaikum", "pagi", dll).

PANDUAN OPERASIONAL:
1. Sapaan Awal (Greeting):
   - Sambut pengguna dengan hangat dan ramah.
   - Anda dapat langsung menawarkan bantuan seperti: cek ringkasan keuangan terkini (Net Worth), catat transaksi baru, cek status budget, atau review hutang-piutang.
2. Analisis Keuangan (Financial Summary):
   - Gunakan action `financial_summary` untuk menampilkan total aset likuid, pengeluaran, pemasukan, dan alokasi kategori.
3. Pencatatan Transaksi:
   - Catat pemasukan/pengeluaran melalui action `record_transaction`. Selalu konfirmasi dompet/wallet dan kategori yang digunakan.
4. Transfer Antar Dompet:
   - Gunakan action `transfer_funds` dengan memperhitungkan biaya admin bila ada.
5. Hutang & Piutang:
   - Pantau dan catat pelunasan hutang/piutang melalui action `manage_debt_loan`.
```

---

## 3. Konfigurasi Actions (OpenAPI Schema)

1. Gulir ke bawah di tab **Configure** dan klik **Create new action**.
2. Di bagian **Schema**, klik **Import from URL** atau masukkan URL OpenAPI spec Reedrich:
   ```
   https://reedrich-mcp.lutfidmz.workers.dev/openapi.json
   ```
   *(Atau salin isi JSON dari `https://reedrich-mcp.lutfidmz.workers.dev/openapi.json` secara langsung ke kolom Schema)*.

3. Pastikan endpoint terdeteksi dengan benar (`/api/v1/*` atau rute yang disediakan).

---

## 4. Konfigurasi Autentikasi OAuth di GPT Builder

Di bagian **Authentication** pada Action yang baru dibuat:

1. Pilih **OAuth**.
2. Masukkan konfigurasi berikut:
   - **Client ID**: `chatgpt-custom-action` (atau biarkan default)
   - **Client Secret**: `reedrich-stateless-secret` (atau string apa pun bila stateless)
   - **Authorization URL**:
     ```
     https://reedrich-mcp.lutfidmz.workers.dev/oauth/authorize
     ```
   - **Token URL**:
     ```
     https://reedrich-mcp.lutfidmz.workers.dev/oauth/token
     ```
   - **Scope**: `mcp`
   - **Token Exchange Method**: `Default (POST request)` atau `Basic authorization header`

3. Simpan Callback URL yang diberikan oleh ChatGPT (jika diminta).

---

## 5. Kebijakan Privasi (Privacy Policy)

Pada kolom **Privacy Policy** di GPT Builder, masukkan:
```
https://reedrich-mcp.lutfidmz.workers.dev/privacy
```

---

## 6. Uji Coba (Testing)

1. Buka panel Preview di sebelah kanan GPT Builder.
2. Ketik sapaan: `"Halo"` atau `"Assalamualaikum"`.
3. GPT akan menyapa dengan ramah tanpa pesan error/login terblokir.
4. Coba perintahkan: `"Tampilkan ringkasan keuangan saya"`.
5. ChatGPT akan meminta persetujuan untuk menghubungkan OAuth (1-click authorization), lalu menampilkan ringkasan akun Anda.
