const express = require('express');
const mysql = require('mysql');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
const port = 3000;
let cardContentTextData = "";
let imagesData = "";
// Konfigurasi multer untuk menangani upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); 
  },
});

const upload = multer({ storage });

// Middleware untuk parsing JSON
app.use(express.json());

// Buat koneksi ke database MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'me',
  password: '1',
  database: 'imsi-get',
});

// Koneksi ke database
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
    return;
  }
  console.log('Connected to database with ID', connection.threadId);
});

// Fungsi untuk membuat koneksi WebSocket
function connectWebSocket() {
  const externalWs = new WebSocket('ws://192.168.22.200:9090');

  // Event ketika koneksi WebSocket terbuka
  externalWs.on('open', () => {
    console.log('Connected to external WebSocket server');

    // Kirim pesan ke WebSocket server (opsional)
    externalWs.send('Hello from Express.js');
  });

  externalWs.on('message', (message) => {
    externalWs.on('message', (message) => {
      const data = JSON.parse(message.toString());

      if (data.Operand === "CardContentText") {
        cardContentTextData = message.toString();
        console.log('Received CardContentText data:', cardContentTextData);
      } else if (data.Operand === "Images") {
        imagesData = message.toString();
        console.log('Received Images data:', imagesData);
      }
    });
  });

  // Event ketika koneksi WebSocket tertutup
  externalWs.on('close', () => {
    console.log('Disconnected from external WebSocket server');
    setTimeout(() => {
      console.log('Reconnecting to WebSocket server...');
      connectWebSocket();
    }, 1000); 
  });

  // Event jika terjadi error pada koneksi WebSocket
  externalWs.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    externalWs.close();
  });
}

// Mulai koneksi WebSocket 
connectWebSocket();

// Endpoint GET untuk mengambil data dari database
app.get('/data', (req, res) => {
  const citizenRecordsQuery = 'SELECT * FROM citizen_records';
  const imsiDataQuery = 'SELECT * FROM imsi_data WHERE citizen_record_id = ?';

  connection.query(citizenRecordsQuery, async (error, citizenRecords, fields) => {
    if (error) {
      console.error('Error executing query:', error.stack);
      return res.status(500).send('Error retrieving data from database');
    }

    const host = req.get('host');
    const protocol = req.protocol;

    // Modifikasi hasil query untuk menyertakan URL gambar dan data IMSI
    const modifiedResults = await Promise.all(
      citizenRecords.map(async (record) => {
        if (record.image_data_capture) {
          // Buat URL lengkap berdasarkan host dan protocol
          record.image_data_capture = `${protocol}://${host}:8888/${record.image_data_capture}`;
        }

        // Ambil data IMSI berdasarkan citizen_record_id
        const imsiData = await new Promise((resolve, reject) => {
          connection.query(imsiDataQuery, [record.id], (error, results) => {
            if (error) {
              console.error('Error fetching IMSI data:', error.stack);
              reject(error);
            } else {
              resolve(results);
            }
          });
        });

        // Filter IMSI data dengan status 1
        const imsiDataFiltered = imsiData.filter(imsi => imsi.status === 1);
        // console.log("imsiDataFiltered ===",imsiDataFiltered)
        // Cari IMSI dengan rssi dan rsrp terbesar
        const maxRssiAndRsrpImsi = imsiDataFiltered.reduce((max, imsi) => {
          if (imsi.rssi > max.rssi && imsi.rsrp > max.rsrp) {
            return imsi;
          }
          return max;
        }, { rssi: -Infinity, rsrp: -Infinity }); // Inisialisasi dengan nilai default

        // Jika tidak ada data IMSI yang memenuhi kriteria, kembalikan objek dengan nilai null
        if (imsiDataFiltered.length === 0) {
          record.imsi_data = {
            imsi: null,
            rsrp: null,
            rssi: null,
            time: null,
            ip: null,
            status: null,
            provider: null
          };
        } else {
          record.imsi_data = maxRssiAndRsrpImsi;
        }

        return record;
      })
    );

    res.json(modifiedResults);
  });
});

// Endpoint POST untuk menerima id, photo, dan time_data_scan
app.post('/upload', upload.single('image_data_capture'), (req, res) => {
  const { id, time_image } = req.body; 
  const image_data_capture = req.file;

  // Validasi input
  if (!id || !image_data_capture || !time_image) {
    return res.status(400).json({ error: 'ID, image_data_capture, and time_image are required' });
  }

  try {
    // Parse data JSON dari temporary_data
    const dataCard = JSON.parse(cardContentTextData);
    // Validasi data JSON
    if (!dataCard || !dataCard.id) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    const cardMainID = dataCard.Param.CARD_MAINID;
    let query, values;
    // Cek kondisi: id harus sama dan data.Param.DESC tidak ada
    if (id == dataCard.id && (!dataCard.Param || !dataCard.Param.DESC)) {
      if (cardMainID == '2010') { //data KTP
        query = `
          INSERT INTO citizen_records (
            card_mainid, card_subid, card_name, reserve, name, id_number, date_of_birth, place_of_birth, gender, religion, 
            nationality, occupation, blood_group, address, address_one, address_second, address_third, date_of_expiry, 
            marital_status, image_data_scan, time_data_scan, image_data_capture, time_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        values = [
          dataCard.Param.CARD_MAINID,
          dataCard.Param.CARD_SUBID,
          dataCard.Param.CARD_NAME,
          dataCard.Param.Reserve,
          dataCard.Param.Name,
          dataCard.Param['ID Number'],
          dataCard.Param['Date of Birth'],
          dataCard.Param['Place of Birth'],
          dataCard.Param.Gender,
          dataCard.Param.Religion,
          dataCard.Param.Nationality,
          dataCard.Param.Occupation,
          dataCard.Param['Blood group'],
          dataCard.Param.Address,
          dataCard.Param['Address one'],
          dataCard.Param['Address second'],
          dataCard.Param['Address third'],
          dataCard.Param['Date of expiry'],
          dataCard.Param['marital status'],
          dataCard.Param.ImageData?.White || null, // Jika ImageData ada, ambil field White
          dataCard.time_data_scan,
          image_data_capture.path,
          time_image,
        ];
      } else if (cardMainID == '2041') {
        query = `
          INSERT INTO citizen_records (
            card_mainid, card_subid, card_name, reserve, name, gender, address, issuer, date_of_birth, height, job, 
            id_number, date_of_expiry, place_of_birth, blood_group, class, image_data_scan, time_data_scan, 
            image_data_capture, time_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        values = [
          dataCard.Param.CARD_MAINID,
          dataCard.Param.CARD_SUBID,
          dataCard.Param.CARD_NAME,
          dataCard.Param.Reserve,
          dataCard.Param.Name,
          dataCard.Param.Sex,
          dataCard.Param.Address,
          dataCard.Param.Issuer,
          dataCard.Param['Date of Birth'],
          dataCard.Param.Height,
          dataCard.Param.Job,
          dataCard.Param['ID Number'],
          dataCard.Param['Date of Expiry'],
          dataCard.Param.Birthplacelace,
          dataCard.Param['Blood Group'],
          dataCard.Param.Class,
          dataCard.Param.ImageData?.White || null,
          dataCard.time_data_scan,
          image_data_capture.path,
          time_image,
        ];
      } else if (cardMainID == '13') {
        query = `
          INSERT INTO citizen_records (
            card_mainid, card_subid, card_name, passport_type, national_name, english_name, gender, date_of_birth, 
            date_of_expiry, issuing_country_code, english_surname, english_first_name, mrz1, mrz2, nationality_code, 
            passport_number, place_of_issue, date_of_issue, id_number, authority, national_surname, national_given_names, 
            surname, given_name, match_given_name, match_english_name, guardian_name, image_data_scan, time_data_scan, 
            image_data_capture, time_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        values = [
          dataCard.Param.CARD_MAINID,
          dataCard.Param.CARD_SUBID,
          dataCard.Param.CARD_NAME,
          dataCard.Param['Passport type'],
          dataCard.Param['National name'],
          dataCard.Param['English name'],
          dataCard.Param.Sex,
          dataCard.Param['Date of birth'],
          dataCard.Param['Date of expiry'],
          dataCard.Param['Issuing country code'],
          dataCard.Param['English surname'],
          dataCard.Param['English first name'],
          dataCard.Param.MRZ1,
          dataCard.Param.MRZ2,
          dataCard.Param['Nationality code'],
          dataCard.Param['Passport number'],
          dataCard.Param['Place of issue'],
          dataCard.Param['Date of issue'],
          dataCard.Param['ID Number'],
          dataCard.Param['Authority(OCR)'],
          dataCard.Param['National surname'],
          dataCard.Param['National given names'],
          dataCard.Param['Surname(VIZ)'],
          dataCard.Param['Given Name(VIZ)'],
          dataCard.Param['Match Given Name'],
          dataCard.Param['Match English name'],
          dataCard.Param['Guardian Name'],
          dataCard.Param.ImageData?.White || null,
          dataCard.time_data_scan,
          image_data_capture.path,
          time_image,
        ];
      } else {
        return res.status(400).json({ error: 'Unsupported CARD_MAINID' });
      }

      connection.query(query, values,async (error, results) => {
        if (error) {
          console.error('Error executing query:', error.stack);
          return res.status(500).json({ error: 'Failed to save data to database' });
        }
        // Ambil data IMSI dari API eksternal
        try {
          const imsiResponse = await axios.get('http://192.168.22.200:8000/get_imsi');

          if (imsiResponse.data.status === 'success' && imsiResponse.data.data.length > 0) {
            // Jika data IMSI tersedia, simpan ke database
            const imsiData = imsiResponse.data.data;
            // console.log("Inin Imsi Dataaa ", imsiData)

            for (const imsi of imsiData) {
              const imsiQuery = `
                INSERT INTO imsi_data 
                (citizen_record_id, imsi, rsrp, rssi, time, ip, status, provider) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `;
              const imsiValues = [
                dataCard.id, // ID dari data yang baru disimpan
                imsi.imsi,
                imsi.rsrp,
                imsi.rssi,
                imsi.time,
                imsi.ip,
                imsi.status,
                imsi.provider
              ];

              connection.query(imsiQuery, imsiValues, (error) => {
                if (error) {
                  console.error('Error saving IMSI data:', error.stack);
                }
              });
            }
          } else {
            // Jika data IMSI tidak tersedia, simpan dengan nilai null
            const imsiQuery = `
              INSERT INTO imsi_data 
              (citizen_record_id, imsi, rsrp, rssi, time, ip, status, provider) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const imsiValues = [dataCard.id, null, null, null, null, null, null, null];

            connection.query(imsiQuery, imsiValues, (error) => {
              if (error) {
                console.error('Error saving IMSI data:', error.stack);
              }
            });
          }

          // Jalankan file Python setelah data IMSI disimpan
          exec('python3 /var/www/html/imsi-gate-be/python/gate.py', (error, stdout, stderr) => {
            if (error) {
              console.error(`Error executing Python script: ${error.message}`);
              return res.status(500).json({ error: 'Failed to execute Python script' });
            }
            if (stderr) {
              console.error(`Python script stderr: ${stderr}`);
              return res.status(500).json({ error: 'Python script returned an error' });
            }

            console.log(`Python script output: ${stdout}`);

            // Kirim response sukses
            res.status(201).json({
              message: 'Data saved successfully',
              id: dataCard.id,
              image_data_capture: image_data_capture.path, 
              time_image: time_image,
            });
          });
        } catch (error) {
          console.error('Error fetching IMSI data:', error.message);
          return res.status(500).json({ error: 'Failed to fetch IMSI data' });
        }
      });

    } else {
      res.status(400).json({
        error: 'Condition not met: ID does not match or DESC is present',
        details: {
          id: dataCard.id,
          hasParam: !!dataCard.Param,
          hasDesc: dataCard.Param ? !!dataCard.Param.DESC : false,
        },
      });
    }
  } catch (error) {
    // Tangani error jika parsing JSON gagal
    console.error('Error parsing JSON:', error.message);
    return res.status(400).json({ error: 'Invalid JSON data' });
  }
});


// Jalankan server
app.listen(port, () => {
  console.log(`Server is running on http${port}`);
});