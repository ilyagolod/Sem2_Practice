const http = require('http');
const https = require('https'); 
const WebSocket = require('ws');
const fs = require('fs');

const server = http.createServer();
const wss = new WebSocket.Server({ noServer: true });

let maxThreads = 5;
try {
  const configData = fs.readFileSync('config.txt', 'utf-8');
  maxThreads = parseInt(configData);
  if (isNaN(maxThreads) || maxThreads <= 0) {
    console.error('Error reading config.txt file. Using the default value.');
  }
} catch (err) {
  console.error('Error reading config.txt file. Using the default value.', err);
}

const keywordToURL = {
  'flowers': [
    'https://cdn.pixabay.com/photo/2015/04/19/08/32/marguerite-729510_1280.jpg',
    'https://cdn.pixabay.com/photo/2015/04/19/08/32/rose-729509_1280.jpg',
    'https://cdn.pixabay.com/photo/2018/02/08/22/27/flower-3140492_1280.jpg'
  ],
  'food': [
    'https://cdn.pixabay.com/photo/2010/12/13/10/05/berries-2277_1280.jpg',
    'https://cdn.pixabay.com/photo/2016/08/11/08/04/vegetables-1584999_1280.jpg',
    'https://cdn.pixabay.com/photo/2014/11/05/15/57/salmon-518032_1280.jpg'
  ],
  'sky': [
    'https://cdn.pixabay.com/photo/2018/08/23/07/35/thunderstorm-3625405_1280.jpg',
    'https://cdn.pixabay.com/photo/2016/10/18/21/22/beach-1751455_1280.jpg',
    'https://cdn.pixabay.com/photo/2016/11/23/13/48/beach-1852945_1280.jpg'
  ]
};

function downloadContent(url, callback) {
  const protocol = url.startsWith('https') ? https : http; // Determine the protocol based on the URL

  const request = protocol.get(url, (response) => {
    let data = Buffer.from([]);

    response.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
    });

    response.on('end', () => {
      if (response.statusCode === 200) {
        callback(null, data);
      } else {
        callback(new Error(`Error downloading content. Status code: ${response.statusCode}`));
      }
    });

    response.on('error', (error) => {
      callback(error);
    });
  });

  request.on('error', (error) => {
    callback(error);
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const keyword = JSON.parse(message).keyword;
      const urls = keywordToURL[keyword];
      if (urls) {
        ws.send(JSON.stringify({ urls }));

        const downloadPromises = urls.map((url) => {
          return new Promise((resolve) => {
            downloadContent(url, (error, content) => {
              if (!error) {
                const filename = `downloaded_${Date.now()}.jpg`;
                fs.writeFileSync(filename, content);
                resolve({ url, filename });
              } else {
                resolve({ url, error: error.message });
              }
            });
          });
        });

        Promise.all(downloadPromises).then((results) => {
          ws.send(JSON.stringify({ message: 'Content successfully downloaded and saved.', results }));
        });
      } else {
        ws.send(JSON.stringify({ error: 'Keyword not found' }));
      }
    } catch (error) {
      console.error('Error processing request:', error);
      ws.send(JSON.stringify({ error: 'Error processing request' }));
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
