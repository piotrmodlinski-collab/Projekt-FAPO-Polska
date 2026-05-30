const { handleMailRequest } = require('../../server/mail-handler.cjs');

exports.handler = async function contactHandler(event) {
  const ip = (event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || '').split(',')[0].trim();
  const result = await handleMailRequest({
    method: event.httpMethod,
    body: event.body,
    ip,
  });

  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body === null ? '' : JSON.stringify(result.body),
  };
};
