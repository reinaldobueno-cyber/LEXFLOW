/**
 * LexFlow - Gmail webhook para resumo diario.
 *
 * Como usar:
 * 1. Acesse https://script.google.com com o Gmail do advogado.
 * 2. Crie um novo projeto e cole este arquivo em Code.gs.
 * 3. Em Project Settings > Script properties, crie:
 *    LEXFLOW_TOKEN = um texto secreto forte
 * 4. Deploy > New deployment > Web app:
 *    Execute as: Me
 *    Who has access: Anyone
 * 5. Copie a Web app URL e acrescente ?token=SEU_TOKEN.
 *    Essa URL sera o secret EMAIL_WEBHOOK_URL no Cloudflare.
 */

function doPost(e) {
  try {
    var expectedToken = PropertiesService.getScriptProperties().getProperty('LEXFLOW_TOKEN') || '';
    var receivedToken = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';

    if (!expectedToken || receivedToken !== expectedToken) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }

    var payload = JSON.parse(e.postData.contents || '{}');
    var recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    recipients = recipients
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean);

    if (!recipients.length) {
      return jsonResponse({ ok: false, error: 'missing_recipient' }, 400);
    }

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: payload.subject || 'LexFlow - Compromissos do dia',
      body: payload.text || 'Resumo LexFlow sem corpo de texto.',
      htmlBody: payload.html || '',
      name: 'LexFlow'
    });

    return jsonResponse({
      ok: true,
      provider: 'gmail_apps_script',
      recipients: recipients.length
    }, 200);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}

function jsonResponse(body, status) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
