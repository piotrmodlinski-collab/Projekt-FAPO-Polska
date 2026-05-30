const { handleMailRequest } = require('../server/mail-handler.cjs');

module.exports = async function contactHandler(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const result = await handleMailRequest({
    method: req.method,
    body: req.body,
    ip,
  });

  Object.entries(result.headers || {}).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (result.body === null) {
    res.status(result.status).end();
    return;
  }

  res.status(result.status).json(result.body);
};
