const express = require('express');
const axios = require('axios');
const serverless = require('serverless-http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const app = express();
const router = express.Router();
const TEMP_DIR = '/tmp';

// Define the allowed origins
const allowedOrigins = ['http://localhost:3000', 'https://tunewave.vercel.app'];

// Set up CORS with a function to check the origin
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Set the custom FFmpeg path
const customFfmpegPath = path.join(__dirname,'ffmpeg')
const dirPath = '/var/task/functions';
const files = fs.readdirSync(dirPath);
console.log('Directory contents:', files);

// Convert audio to MP3
router.post('/convert', async (req, res) => {
  const { audioUrl, imageUrl, artists, album } = req.body;
  const audioPath = path.join(TEMP_DIR, 'input.mp4');
  const imagePath = path.join(TEMP_DIR, 'cover.jpg');
  const outputPath = path.join(TEMP_DIR, 'output.mp3');

  if (!audioUrl || !imageUrl || !artists || !album) {
    return res.status(400).json({
      error: 'Audio URL, Image URL, artist name, and album name are required',
    });
  }

  console.log('Audio URL: ' + audioUrl);
  console.log('Image URL: ' + imageUrl);
  console.log('Artists: ' + artists);
  console.log('Album: ' + album);

  try {
    // Log custom FFmpeg path
    console.log('FFmpeg path:', customFfmpegPath);

    // Check if the custom FFmpeg binary exists
    if (!fs.existsSync(customFfmpegPath)) {
      console.error('FFmpeg binary not found at', customFfmpegPath);
      return res.status(500).json({ error: 'FFmpeg binary not found' });
    }

    // Download audio file
    const audioResponse = await axios({
      url: audioUrl,
      method: 'GET',
      responseType: 'stream',
    });

    await new Promise((resolve, reject) => {
      const audioWriter = fs.createWriteStream(audioPath);
      audioResponse.data.pipe(audioWriter);
      audioWriter.on('finish', resolve);
      audioWriter.on('error', reject);
    });

    // Download image file
    const imageResponse = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
    });

    await new Promise((resolve, reject) => {
      const imageWriter = fs.createWriteStream(imagePath);
      imageResponse.data.pipe(imageWriter);
      imageWriter.on('finish', resolve);
      imageWriter.on('error', reject);
    });

    console.log('Audio file exists:', fs.existsSync(audioPath));
    console.log('Image file exists:', fs.existsSync(imagePath));

    // Execute ffmpeg command
    await execPromise(
      `${customFfmpegPath} -i ${audioPath} -i ${imagePath} -c:v mjpeg -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -metadata artist="${artists.join(
        ', ',
      )}" -metadata album="${album}" ${outputPath}`,
    );

    const fileData = fs.readFileSync(outputPath);
    fs.unlinkSync(audioPath);
    fs.unlinkSync(imagePath);
    fs.unlinkSync(outputPath);

    return res.status(200).json({
      audioUrl,
      imageUrl,
      artists,
      album,
      audioData: fileData.toString('base64'),
    });
  } catch (err) {
    console.error('Conversion Failed', err.message);
    res.status(500).json({ error: 'Conversion Failed' });
  }
});

// app.use('/', router);
// // Use the router
// app.listen(3001, () => console.log(`http://localhost:3001`));
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);