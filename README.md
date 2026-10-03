# cbt-skoll

## Deskripsi Proyek
Backend **Sistem CBT (Computer-Based Test)** menggunakan TypeScript, Express.js, PostgreSQL, dan Drizzle ORM.

Fitur MVP:
- **Autentikasi JWT** dengan refresh token (role: `admin`, `guru`, `siswa`)
- **Manajemen user**: admin/guru dapat menambah siswa
- **Kelas**: guru/admin mengatur kelas dan anggota (sesi) siswa
- **Bank soal**: tiga tipe soal — pilihan ganda, benar/salah, isian singkat
- **Ujian**: durasi, jadwal, token akses, publikasi
- **Pengerjaan siswa**:
  - Masuk ujian dengan **token**
  - **Timer server-side** (batas waktu tersimpan di sesi, tahan terhadap refresh)
  - Jawaban **dikirim satu per satu** — aman jika koneksi/browser terputus, sesi bisa dilanjutkan
  - Penilaian otomatis saat selesai / waktu habis
- **Hasil ujian**: rekap nilai per kelas untuk guru/admin, detail jawaban per soal

## Dependensi
- **TypeScript**, **Express.js 5**, **PostgreSQL**, **Drizzle ORM**, **jsonwebtoken**, **bcrypt**, **zod**, **helmet**, **cors**, **express-rate-limit**

## Langkah-Langkah Instalasi
1. **Clone Repository**
    ```bash
    git clone https://github.com/username/cbt-skoll.git
    cd cbt-skoll
    ```

2. **Instalasi Dependensi**
    ```bash
    npm install
    ```

3. **Konfigurasi Environment**
    Salin `.env-example` menjadi `.env` lalu isi kredensial database dan JWT secret (min. 32 karakter).

4. **Menjalankan Migrasi**
    ```bash
    npm run db:migrate
    ```

5. **Seed Data Demo (opsional)**
    ```bash
    npm run db:seed
    ```
    Akun demo (password semua: `password123`):
    | Role  | Email            | Keterangan                          |
    |-------|------------------|-------------------------------------|
    | admin | admin@cbt.test   |                                     |
    | guru  | guru@cbt.test    | Punya kelas, bank soal, dan ujian   |
    | siswa | siswa1@cbt.test  | Terdaftar di "Kelas XI IPA 1"       |
    | siswa | siswa2@cbt.test  | Terdaftar di "Kelas XI IPA 1"       |

    Ujian demo: **Ujian Matematika Dasar**, token `UJIAN1`, durasi 60 menit.

6. **Menjalankan Aplikasi**
    ```bash
    npm run dev
    ```

7. **Akses Aplikasi**
    Aplikasi berjalan di `http://localhost:3000`.

## Ringkasan API

### Auth (publik)
| Method | Endpoint          | Keterangan                     |
|--------|-------------------|--------------------------------|
| POST   | `/api/auth/signup`| Daftar akun                    |
| POST   | `/api/auth/signin`| Login → access + refresh token |
| POST   | `/api/auth/refresh`| Perbarui token (rotasi)       |
| POST   | `/api/auth/logout`| Cabut refresh token            |
| GET    | `/api/auth/me`    | Profil user saat ini           |

### Users
| Method | Endpoint        | Akses                  | Keterangan                          |
|--------|-----------------|------------------------|-------------------------------------|
| GET    | `/api/users`    | admin, guru            | Daftar user (filter `role=siswa`)   |
| GET    | `/api/users/:id`| admin, guru            | Detail user                         |
| POST   | `/api/users`    | admin, guru            | Buat user (guru hanya boleh `siswa`)|
| PATCH  | `/api/users/:id`| admin                  | Update user                         |
| DELETE | `/api/users/:id`| admin                  | Hapus user                          |

### Classes (kelas)
| Method | Endpoint                          | Akses       | Keterangan                       |
|--------|-----------------------------------|-------------|----------------------------------|
| GET    | `/api/classes`                    | admin, guru | Daftar kelas                     |
| POST   | `/api/classes`                    | admin, guru | Buat kelas                       |
| GET    | `/api/classes/:id`                | admin, guru | Detail kelas                     |
| PATCH  | `/api/classes/:id`                | admin, guru | Update kelas                     |
| DELETE | `/api/classes/:id`                | admin, guru | Hapus kelas                      |
| GET    | `/api/classes/:id/students`       | admin, guru | Daftar siswa di kelas            |
| POST   | `/api/classes/:id/students`       | admin, guru | Tambah siswa `{ studentIds: [] }`|
| DELETE | `/api/classes/:id/students/:studentId` | admin, guru | Keluarkan siswa             |

### Banks (bank soal)
| Method | Endpoint                                    | Akses       | Keterangan                        |
|--------|---------------------------------------------|-------------|-----------------------------------|
| GET    | `/api/banks`                                | admin, guru | Daftar bank soal                  |
| POST   | `/api/banks`                                | admin, guru | Buat bank soal                    |
| GET    | `/api/banks/:id`                            | admin, guru | Detail bank soal                  |
| PATCH  | `/api/banks/:id`                            | admin, guru | Update bank soal                  |
| DELETE | `/api/banks/:id`                            | admin, guru | Hapus bank soal                   |
| GET    | `/api/banks/:id/questions`                  | admin, guru | Daftar soal (termasuk kunci)      |
| POST   | `/api/banks/:id/questions`                  | admin, guru | Buat soal                         |
| PATCH  | `/api/banks/:id/questions/:questionId`      | admin, guru | Update soal                       |
| DELETE | `/api/banks/:id/questions/:questionId`      | admin, guru | Hapus soal                        |

Tipe soal (`type`):
- `multiple_choice`: `options` berupa array 2–5 string, `correctAnswer` = index opsi (angka)
- `true_false`: `correctAnswer` = `0` (Benar) atau `1` (Salah), opsi otomatis `["Benar","Salah"]`
- `short_answer`: `correctAnswer` = teks jawaban (penilaian tanpa membedakan huruf besar/kecil)

### Exams (ujian)
| Method | Endpoint                     | Akses       | Keterangan                                |
|--------|------------------------------|-------------|-------------------------------------------|
| GET    | `/api/exams`                 | admin, guru | Daftar ujian                              |
| POST   | `/api/exams`                 | admin, guru | Buat ujian (token dibuat otomatis jika kosong) |
| GET    | `/api/exams/:id`             | admin, guru | Detail ujian                              |
| PATCH  | `/api/exams/:id`             | admin, guru | Update ujian                              |
| DELETE | `/api/exams/:id`             | admin, guru | Hapus ujian                               |
| POST   | `/api/exams/:id/regenerate-token` | admin, guru | Ganti token ujian                     |
| GET    | `/api/exams/:id/results`     | admin, guru | Rekap hasil ujian                         |
| GET    | `/api/exams/available`       | siswa       | Daftar ujian kelasnya yang sudah terbit   |
| POST   | `/api/exams/:id/start`       | siswa       | Mulai/lanjut ujian `{ token: "UJIAN1" }`  |

### Sessions (pengerjaan siswa)
| Method | Endpoint                 | Akses                  | Keterangan                                 |
|--------|--------------------------|------------------------|--------------------------------------------|
| GET    | `/api/sessions/mine`     | siswa                  | Riwayat sesi milik sendiri                 |
| GET    | `/api/sessions/:id`      | pemilik / guru / admin | Detail sesi: soal satu-per-satu + progres  |
| POST   | `/api/sessions/:id/answers` | siswa (pemilik)     | Kirim **satu** jawaban `{ questionId, answer }` |
| POST   | `/api/sessions/:id/finish`  | siswa (pemilik)     | Selesaikan ujian → nilai dihitung otomatis |
| GET    | `/api/sessions/:id/result`  | pemilik / guru / admin | Detail hasil per soal setelah selesai     |

Format `answer` saat mengirim jawaban:
- `multiple_choice` / `true_false`: index opsi dalam string, misal `"0"`, `"2"`
- `short_answer`: teks bebas

Catatan perilaku pengerjaan:
- `expiresAt` dihitung server saat `start` (mulai + durasi). Client menerima `remainingSeconds`.
- Jawaban dikirim satu per satu dan langsung tersimpan; jawaban bisa diperbaiki selama waktu berjalan.
- Jika waktu habis, sesi otomatis difinalisasi pada request berikutnya.
- Kunci jawaban tidak pernah dikirim ke siswa selama ujian berjalan.

## Copyright
Hak cipta © 2025. Semua hak dilindungi. Proyek ini dirilis di bawah lisensi MIT. Silakan lihat file `LICENSE` untuk informasi lebih lanjut.
