const express = require('express');
const app = express();
const PORT = 5000;

app.get('/', (req, res) => {
    res.send('Backend CoreBiz SaaS siap dikembangkan!');
});

app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});