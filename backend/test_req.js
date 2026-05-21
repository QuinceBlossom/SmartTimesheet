const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/staff/performance?userId=3&month=05/2026',
  method: 'GET',
  headers: {
    'x-user-id': '3'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
