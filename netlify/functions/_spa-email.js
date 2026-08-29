const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const CONTACT_PHONE = process.env.CONTACT_PHONE || '+48 797 193 931';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'massages.n.spa@gmail.com';
const SITE_URL = String(process.env.PUBLIC_SITE_URL || 'https://massagesandspa.netlify.app').replace(/\/$/, '');
const BACKGROUND_URL = `${SITE_URL}/assets/email-bg-palm-shadow.png`;

export function spaEmail({ heading, intro, rows = [], note = '', preparation = false }) {
  const detailRows = rows.map(({ label, value }) => `
    <tr>
      <td class="spa-label" style="padding:12px 8px;color:#795a28;border-bottom:1px solid #ddd2c5;width:128px;vertical-align:top;">${esc(label)}</td>
      <td class="spa-copy" style="padding:12px 8px;color:#302821;border-bottom:1px solid #ddd2c5;font-weight:700;vertical-align:top;">${esc(value || '-')}</td>
    </tr>`).join('');

  const noteHtml = note ? `
    <div class="spa-note" style="margin-top:22px;padding:15px 18px;background:#e5f0e5;border-left:4px solid #316a3d;color:#28462e;">
      <strong>Uwagi klienta</strong><br>${esc(note)}
    </div>` : '';

  const preparationHtml = preparation ? `
    <div class="spa-surface spa-copy" style="margin-top:22px;padding:20px;background:#fcfaf6;border-top:2px solid #b79555;color:#302821;">
      <h2 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;color:#8d6b30;">Jak przygotować się do masażu?</h2>
      <p style="margin:0 0 12px;color:#493f38;">Aby masaż przebiegł komfortowo i sprawnie, prosimy o przygotowanie się według poniższych wskazówek:</p>
      <ul style="margin:0;padding-left:22px;line-height:1.55;">
        <li style="margin:9px 0;">📐 <strong>Przygotuj przestrzeń</strong> — najlepiej ok. 2 × 3 m wolnego miejsca, aby można było ustawić stół i swobodnie się poruszać.</li>
        <li style="margin:9px 0;">🌡️ <strong>Zadbaj o ciepło</strong> — pomieszczenie powinno być przyjemnie nagrzane (ok. 23–25 °C), aby ciało nie marzło podczas masażu.</li>
        <li style="margin:9px 0;">🔌 <strong>Zapewnij dostęp do gniazdka</strong> — jeśli używamy podgrzewacza lub lampy, przyda się prąd w pobliżu miejsca masażu.</li>
        <li style="margin:9px 0;">🚿 <strong>Prysznic przed masażem</strong> — najlepiej ok. 1–2 godziny wcześniej.</li>
        <li style="margin:9px 0;">🍽️ <strong>Nie jedz ciężkich posiłków</strong> tuż przed zabiegiem (odczekaj 1,5–2 godziny).</li>
        <li style="margin:9px 0;">💧 <strong>Wypij szklankę wody</strong> przed wizytą — wspiera to proces regeneracji organizmu.</li>
        <li style="margin:9px 0;">🐾 <strong>Zwierzęta domowe</strong> — jeśli to możliwe, zadbaj, aby podczas masażu nie wchodziły do pokoju.</li>
      </ul>
    </div>` : '';

  return `<!doctype html>
  <html lang="pl"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only;supported-color-schemes:light}.spa-surface{background-color:#fcfaf6!important}.spa-copy{color:#302821!important}.spa-label{color:#795a28!important}.spa-note{background-color:#e5f0e5!important;color:#28462e!important}@media(prefers-color-scheme:dark){.spa-surface{background-color:#fcfaf6!important}.spa-copy{color:#302821!important}.spa-label{color:#795a28!important}.spa-note{background-color:#e5f0e5!important;color:#28462e!important}}</style></head><body style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,sans-serif;color:#493f38;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4ef;padding:24px 10px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffefa;">
        <tr><td align="center" background="${esc(BACKGROUND_URL)}" style="padding:28px 34px 24px;background-color:#fbf8f3;background-image:url('${esc(BACKGROUND_URL)}');background-position:left top;background-size:cover;background-repeat:no-repeat;border-bottom:3px solid #b79555;">
          <img src="${esc(SITE_URL)}/assets/logo.svg" width="310" alt="Logo" style="display:block;width:310px;max-width:88%;height:auto;margin:0 auto;">
          <div style="margin:22px 0 0;color:#315f39;font-family:'Trebuchet MS',Arial,sans-serif;font-size:21px;line-height:1.35;letter-spacing:.035em;font-weight:600;">${esc(heading)}</div>
        </td></tr>
        <tr><td background="${esc(BACKGROUND_URL)}" style="padding:30px 34px;background-color:#fffefa;background-image:url('${esc(BACKGROUND_URL)}');background-position:left center;background-size:cover;background-repeat:no-repeat;">
          <table class="spa-surface" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fcfaf6" style="margin:0 0 18px;background:#fcfaf6;border-collapse:collapse;"><tr><td class="spa-copy" align="center" style="padding:15px 18px;color:#302821;font-weight:700;line-height:1.55;">${esc(intro)}</td></tr></table>
          <table class="spa-surface" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fcfaf6" style="background:#fcfaf6;border-left:3px solid #b79555;border-collapse:collapse;">${detailRows}</table>
          ${noteHtml}${preparationHtml}
        </td></tr>
        <tr><td align="center" style="padding:20px 28px;background:#493f38;color:#f4ece3;font-size:14px;">
          <a href="tel:${esc(CONTACT_PHONE.replace(/[^+\d]/g, ''))}" style="color:#f4ece3;text-decoration:none;">${esc(CONTACT_PHONE)}</a>
          &nbsp;·&nbsp;
          <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:#f4ece3;text-decoration:none;">${esc(CONTACT_EMAIL)}</a>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}
