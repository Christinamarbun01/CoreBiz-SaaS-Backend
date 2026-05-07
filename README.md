# CoreBiz SaaS Backend

Repositori ini berisi kode backend untuk layanan CoreBiz SaaS yang dibangun menggunakan Node.js dan Express.

## Prasyarat

Sebelum menjalankan proyek ini, pastikan Anda sudah menginstal:
- [Node.js](https://nodejs.org/) (Versi LTS disarankan)
- NPM (Otomatis terinstal bersama Node.js)

## Cara Instalasi

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com/Christinamarbun01/CoreBiz-SaaS-Backend.git
   ```

2. **Masuk ke direktori proyek:**
   ```bash
   cd CoreBiz-SaaS-Backend
   ```

3. **Instal semua dependensi:**
   ```bash
   npm install
   ```

## Cara Menjalankan Server

Anda dapat menjalankan server ini dalam beberapa mode.

### Mode Development (Direkomendasikan saat coding)
Untuk menjalankan server dengan fitur *auto-restart* (server otomatis me-restart jika ada perubahan kode), Anda bisa menggunakan `npx nodemon`:

```bash
npx nodemon index.js
```
*(Catatan: Perintah di atas akan mengunduh dan menjalankan nodemon secara otomatis tanpa perlu menginstalnya secara permanen. Anda juga bisa menggunakan `npm run dev` karena sudah disiapkan di `package.json`.)*

### Mode Production
Untuk menjalankan server tanpa fitur *auto-restart* (cocok saat sudah dideploy):

```bash
npm start
```
*(Atau dengan perintah dasar: `node index.js`)*

## Teknologi yang Digunakan
- **[Node.js](https://nodejs.org/)** - Runtime JavaScript
- **[Express.js](https://expressjs.com/)** - Web Framework untuk backend