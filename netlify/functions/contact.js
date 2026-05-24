const { handleMailRequest } = require('../../server/mail-handler.cjs');

exports.handler = async function contactHandler(event) {
  const result = await handleMailRequest({
    method: event.httpMethod,
    body: event.body,
  });

  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body === null ? '' : JSON.stringify(result.body),
  };
};
