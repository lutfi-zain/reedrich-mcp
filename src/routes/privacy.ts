import { Hono } from "hono";
import { html } from "hono/html";

const privacy = new Hono();

privacy.get("/", (c) => {
  return c.html(
    html`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kebijakan Privasi & Ketentuan Layanan — Reedrich</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --heading: #f0f6fc;
      --primary: #238636;
      --primary-hover: #2ea043;
      --accent: #58a6ff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    h1, h2, h3 {
      color: var(--heading);
    }
    h1 {
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-top: 0;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: bold;
      background: #1f6feb;
      color: #ffffff;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    ul {
      padding-left: 24px;
    }
    li {
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
      font-size: 14px;
      color: #8b949e;
      text-align: center;
    }
    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">Legal & Privacy Policy</span>
    <h1>Kebijakan Privasi Reedrich</h1>
    <p><em>Terakhir diperbarui: 23 Agustus 2026</em></p>

    <p>Selamat datang di <strong>Reedrich</strong> (<em>Mathematical Intelligence & Financial Planning Engine</em>). Kami menghormati dan berkomitmen penuh untuk melindungi privasi serta keamanan data keuangan Anda. Dokumen ini menjelaskan bagaimana data Anda dikumpulkan, digunakan, dan dilindungi saat berinteraksi dengan layanan kami, baik melalui antarmuka MCP (Model Context Protocol) maupun ChatGPT Custom Actions.</p>

    <h2>1. Data yang Kami Kumpulkan</h2>
    <ul>
      <li><strong>Informasi Akun:</strong> Nama depan, nama belakang, alamat email, dan nomor WhatsApp saat pendaftaran.</li>
      <li><strong>Kunci Otentikasi:</strong> Hash SHA-256 dari API Key Anda (kunci plaintext tidak pernah disimpan di database kami).</li>
      <li><strong>Data Finansial:</strong> Nama dompet/rekening, jenis institusi (Bank, E-Wallet, Kas), saldo, catatan transaksi pemasukan/pengeluaran, kategori, batas anggaran bulanan, dan catatan hutang/piutang yang Anda catat secara sukarela.</li>
    </ul>

    <h2>2. Penggunaan Data</h2>
    <p>Data yang Anda masukkan digunakan secara eksklusif untuk:</p>
    <ul>
      <li>Menyediakan perhitungan finansial matematis (kekayaan bersih, arus kas, pemanfaatan anggaran, dan proyeksi tujuan keuangan).</li>
      <li>Menyajikan ringkasan dan analisis pengeluaran langsung kepada Anda melalui asisten AI yang Anda gunakan.</li>
      <li>Memverifikasi identitas Anda saat login atau saat otorisasi token sesi.</li>
    </ul>

    <h2>3. Keamanan & Isolasi Multi-Tenant</h2>
    <ul>
      <li><strong>Row-Level Security (RLS):</strong> Setiap data terikat secara ketat dengan ID Pengguna unik Anda. Pengguna lain atau asisten AI pengguna lain tidak memiliki akses apa pun ke catatan finansial Anda.</li>
      <li><strong>Enkripsi:</strong> Semua komunikasi data ditransmisikan melalui protokol aman HTTPS/TLS berstandar industri pada infrastruktur Cloudflare Edge.</li>
      <li><strong>Stateless JWT:</strong> Token otentikasi menggunakan tanda tangan kriptografis dengan waktu kedaluwarsa terbatas untuk mencegah penyalahgunaan token.</li>
    </ul>

    <h2>4. Tidak Ada Penjualan Data ke Pihak Ketiga</h2>
    <p>Kami <strong>TIDAK PERNAH</strong> menjual, menyewakan, atau membagikan data pribadi maupun data finansial Anda kepada pihak ketiga atau pengiklan mana pun.</p>

    <h2>5. Hak Anda atas Data</h2>
    <p>Anda memiliki hak penuh untuk mengakses, memperbarui, atau meminta penghapusan seluruh data akun dan transaksi Anda kapan saja melalui perintah asisten atau menghubungi kami.</p>

    <h2>6. Kontak Kami</h2>
    <p>Jika Anda memiliki pertanyaan seputar Kebijakan Privasi ini, silakan hubungi tim kami melalui repository resmi <a href="https://github.com/lutfi-zain/reedrich-mcp" target="_blank">GitHub Reedrich MCP</a> atau email <a href="mailto:lutfidmz@gmail.com">lutfidmz@gmail.com</a>.</p>

    <div class="footer">
      &copy; 2026 Reedrich Financial Planning Engine. All rights reserved.
    </div>
  </div>
</body>
</html>`
  );
});

export default privacy;
