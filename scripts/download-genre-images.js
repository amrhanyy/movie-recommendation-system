const https = require('https');
const fs = require('fs');
const path = require('path');

const genreImages = {
  'action.jpg': 'https://images.unsplash.com/photo-1559583109-3e7968e11449',
  'adventure.jpg': 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99',
  // ...add other URLs from above...
};

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const downloadImage = (url, filename) => {
  const genresDir = path.join(process.cwd(), 'public', 'genres');

  if (!fs.existsSync(genresDir)){
    fs.mkdirSync(genresDir, { recursive: true });
  }

  const filepath = path.join(genresDir, filename);
  const file = fs.createWriteStream(filepath);
  let bytes = 0;
  let aborted = false;

  const skip = (reason) => {
    aborted = true;
    file.destroy();
    fs.unlink(filepath, () => {
      console.error(`Skipping ${filename}: ${reason}`);
    });
  };

  https.get(url, response => {
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      response.resume();
      skip(`unexpected content-type ${contentType || '(missing)'}`);
      return;
    }
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      response.resume();
      skip(`content-length ${declared} exceeds 2MB`);
      return;
    }
    response.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_IMAGE_BYTES) {
        response.destroy();
        skip('exceeds 2MB');
      }
    });
    response.pipe(file);
    file.on('finish', () => {
      if (aborted) return;
      if (bytes > MAX_IMAGE_BYTES) {
        fs.unlink(filepath, () => {
          console.error(`Skipping ${filename}: exceeds 2MB`);
        });
        return;
      }
      file.close();
      console.log(`Downloaded: ${filename}`);
    });
  }).on('error', err => {
    fs.unlink(filepath, () => {
      console.error(`Error downloading ${filename}:`, err.message);
    });
  });
};

Object.entries(genreImages).forEach(([filename, url]) => {
  downloadImage(url, filename);
});
