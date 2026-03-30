// Minimal Express app used by all tests.
// verifyToken is mocked before this module is loaded (jest.mock is hoisted).
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api/rewards', require('../routes/rewards'));
app.use('/api/missions', require('../routes/missions'));
app.use('/api/debug',   require('../routes/debug'));

module.exports = app;
