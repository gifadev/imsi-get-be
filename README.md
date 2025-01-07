# IMSI Get Backend

Backend server untuk aplikasi IMSI Get yang bertugas menangani koneksi ke database MySQL, WebSocket, dan upload file. Server ini berkomunikasi dengan API eksternal untuk mengambil data IMSI dan menjalankan script Python.

## Deskripsi

IMSI Get Backend adalah server yang menyediakan layanan untuk:
- Manajemen data IMSI dalam database MySQL
- Komunikasi real-time menggunakan WebSocket
- Penanganan upload file dan gambar
- Integrasi dengan API eksternal untuk pengambilan data IMSI
- Eksekusi script Python untuk pemrosesan data

## Prasyarat

Sebelum menjalankan proyek ini, pastikan telah menginstal:

- Node.js (versi 12 atau lebih baru)
- MySQL Server (versi 5.7 atau lebih baru)
- Python (versi 3.6 atau lebih baru) untuk menjalankan script

## Instalasi

1. Clone repositori:
   ```bash
   git clone https://github.com/gifadev/imsi-get-be.git
   cd imsi-get-backend
   ```

2. Install dependensi Node.js:
   ```bash
   npm install
   ```
3. Buat Folder uploads

## Menjalankan Server

1. 
   ```bash
   node index.js
   ```

## API Endpoints

### Data Management

#### GET /data
- Deskripsi: Mengambil semua data dari tabel citizen_records
- Response: Array dari record citizen
- Format Response:
  ```json
  [
    {
      "id": "string",
      "imsi": "string",
      "time_image": "datetime",
      "image_path": "string"
    }
  ]
  ```

#### POST /upload
- Deskripsi: Upload data citizen baru
- Content-Type: multipart/form-data
- Body Request:
  - `id` (string, required): ID citizen
  - `time_image` (string, required): Waktu pengambilan gambar
  - `image_data_capture` (file, required): File gambar
- Response:
  ```json
  {
    "message": "Data saved successfully",
    "id": "string",
    "image_data_capture": "string", 
    "time_image": "string",
  }
  ```

### WebSocket Events

- `connect`: Koneksi client baru
- `data_update`: Update data real-time
- `error`: Notifikasi error

## Error Handling

Server mengembalikan response error dengan format:
```json
{
  "status": "error",
  "message": "Deskripsi error",
  "error_code": "ERROR_CODE"
}
```
