const https = require('https');
const fs = require('fs');
const path = require('path');

const genreImages = {
  'action.jpg': 'https://images.unsplash.com/photo-1559583109-3e7968e11449',
  'adventure.jpg': 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99',
  // ...add other URLs from above...
};

const downloadImage = (url, filename) => {
  const genresDir = path.join(process.cwd(), 'public', 'genres');
  
  if (!fs.existsSync(genresDir)){
    fs.mkdirSync(genresDir, { recursive: true });
  }

  const filepath = path.join(genresDir, filename);
  const file = fs.createWriteStream(filepath);

  https.get(url, response => {
    response.pipe(file);
    file.on('finish', () => {
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
