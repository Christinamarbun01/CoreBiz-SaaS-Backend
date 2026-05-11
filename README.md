# CoreBiz SaaS Backend

Repositori ini berisi kode backend untuk layanan CoreBiz SaaS yang dibangun menggunakan Node.js dan Express. Backend ini dirancang untuk mendukung arsitektur SaaS dengan fitur autentikasi berbasis JWT, Role-Based Access Control (RBAC), dan proteksi infrastruktur seperti CORS dan rate limiting.

## 🎯 Tujuan Proyek

Backend ini menyediakan fondasi untuk aplikasi SaaS CoreBiz dengan fokus pada:
- **Autentikasi Aman**: Login dan register dengan hashing password dan JWT.
- **Otorisasi RBAC**: Kontrol akses berdasarkan peran pengguna (admin, user) dan tenant.
- **Proteksi Infrastruktur**: CORS whitelist, rate limiting, dan environment variables untuk secret keys.
- **Skalabilitas**: Struktur modular yang mudah dikembangkan untuk fitur tambahan.

## 🏗️ Arsitektur

### 1. Identity & Access (RBAC)
- **Stack**: JWT (jsonwebtoken) & Express Middleware.
- **Flow Authorization**:
  ```
  Request Masuk
     ↓
  Cek JWT Header (Authorization: Bearer <token>)
     ↓
  Valid? ──(No)──> 401 Unauthorized
     ↓ (Yes)
  Cek Role & Tenant ID dari User Data
     ↓
  Role Sesuai? ──(No)──> 403 Forbidden
     ↓ (Yes)
  Lanjut ke Controller (200 OK)
  ```

### 2. Infrastruktur Proteksi
- **Environment Variables**: Semua secret keys disimpan di `.env` dan tidak dikomit ke Git.
- **CORS**: Hanya domain yang diizinkan (localhost untuk dev, domain produksi) yang bisa akses.
- **Rate Limiting**: Mencegah spam dan DDoS pada endpoint publik.

## 📁 Struktur File

```
CoreBiz-SaaS-Backend/
├── index.js              # Entry point server Express
├── auth.js               # Helper autentikasi (register, login, JWT)
├── middleware/
│   └── auth.js           # Middleware JWT validation & RBAC
├── .env                  # Variabel lingkungan (jangan commit!)
├── .env.example          # Template .env
├── package.json          # Dependencies & scripts
├── README.md             # Dokumentasi ini
└── .gitignore            # File yang diabaikan Git
```

## 🛠️ Teknologi yang Digunakan

- **[Node.js](https://nodejs.org/)** - Runtime JavaScript
- **[Express.js](https://expressjs.com/)** - Web Framework untuk backend
- **[jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken)** - Untuk JWT authentication
- **[bcryptjs](https://www.npmjs.com/package/bcryptjs)** - Hashing password
- **[cors](https://www.npmjs.com/package/cors)** - Cross-Origin Resource Sharing
- **[express-rate-limit](https://www.npmjs.com/package/express-rate-limit)** - Rate limiting
- **[dotenv](https://www.npmjs.com/package/dotenv)** - Environment variables

## 📋 Prasyarat

Sebelum menjalankan proyek ini, pastikan Anda sudah menginstal:
- [Node.js](https://nodejs.org/) (Versi LTS disarankan, minimal v14)
- NPM (Otomatis terinstal bersama Node.js)

## 🚀 Cara Instalasi & Menjalankan

### 1. Clone Repositori
```bash
git clone https://github.com/Christinamarbun01/CoreBiz-SaaS-Backend.git
cd CoreBiz-SaaS-Backend
```

### 2. Instal Dependensi
```bash
npm install
```

### 3. Setup Environment Variables
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```

Edit file `.env` dengan nilai Anda:
```env
SUPABASE_JWT_SECRET=your-super-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000,https://kasir-umkm.com
PORT=5000
```

> **Penting**: Jangan commit file `.env` ke GitHub. File ini sudah ada di `.gitignore`.

### 4. Jalankan Server

#### Mode Development (Direkomendasikan)
Server akan auto-restart saat ada perubahan kode:
```bash
npm run dev
# atau
npx nodemon index.js
```

#### Mode Production
```bash
npm start
# atau
node index.js
```

Server akan berjalan di `http://localhost:5000` (atau port yang ditentukan di `.env`).

## 📡 API Endpoints

### Public Endpoints
- `GET /` - Health check server
- `POST /register` - Daftar user baru
- `POST /login` - Login dan dapatkan JWT
- `POST /webhook/whatsapp` - Webhook WhatsApp (dengan rate limiting)

### Private Endpoints (Butuh JWT)
- `GET /private` - Endpoint privat untuk role admin/user
- `GET /admin` - Endpoint khusus admin

## 🧪 Cara Testing

### 1. Register User Baru
```bash
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin1",
    "password": "password123",
    "role": "admin",
    "tenant_id": "tenant-01"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin1",
    "password": "password123"
  }'
```

Response akan berisi `access_token`. Salin token tersebut.

### 3. Akses Endpoint Privat
```bash
curl -H "Authorization: Bearer <token-dari-login>" \
  http://localhost:5000/private
```

### 4. Akses Endpoint Admin
```bash
curl -H "Authorization: Bearer <token-dari-login>" \
  http://localhost:5000/admin
```

### 5. Test Rate Limiting
Coba spam request ke `/webhook/whatsapp` untuk melihat rate limiting aktif.

## 🔧 Troubleshooting

### Error: "Missing SUPABASE_JWT_SECRET"
- Pastikan file `.env` ada dan berisi `SUPABASE_JWT_SECRET=your-key`

### Error: "CORS domain tidak diizinkan"
- Tambahkan domain Anda ke `ALLOWED_ORIGINS` di `.env`

### Server tidak start
- Cek apakah port 5000 sudah digunakan: `netstat -ano | findstr :5000`
- Ganti port di `.env` jika perlu

### JWT Expired
- Login ulang untuk dapatkan token baru (expires in 1 jam)

## 📝 Catatan Pengembangan

- **Database**: Saat ini user disimpan di memory array. Untuk produksi, ganti dengan database seperti PostgreSQL atau Supabase.
- **Security**: Gunakan HTTPS di produksi dan rotate JWT secret secara berkala.
- **Logging**: Tambahkan logging untuk monitoring request.
- **Testing**: Tambahkan unit test dengan Jest untuk endpoint dan middleware.

## 🤝 Kontribusi

1. Fork repositori
2. Buat branch fitur baru (`git checkout -b feature/AmazingFeature`)
3. Commit perubahan (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 📄 Lisensi

Proyek ini menggunakan lisensi ISC.
