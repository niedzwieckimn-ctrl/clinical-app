const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const CONTACT_PHONE = process.env.CONTACT_PHONE || '+48 797 193 931';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'massages.n.spa@gmail.com';
const SITE_URL = String(process.env.PUBLIC_SITE_URL || 'https://massagesandspa.netlify.app').replace(/\/$/, '');

export function spaEmail({ heading, intro, rows = [], note = '', preparation = false }) {
  const detailRows = rows.map(({ label, value }) => `
    <tr>
      <td style="padding:12px 8px;color:#89766a;border-bottom:1px solid #e7ddd2;width:128px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:12px 8px;color:#493f38;border-bottom:1px solid #e7ddd2;font-weight:600;vertical-align:top;">${esc(value || '-')}</td>
    </tr>`).join('');

  const noteHtml = note ? `
    <div style="margin-top:22px;padding:15px 18px;background:#edf4ed;border-left:4px solid #3f7d4a;color:#405b44;">
      <strong>Uwagi klienta</strong><br>${esc(note)}
    </div>` : '';

  const preparationHtml = preparation ? `
    <div style="margin-top:22px;padding:20px;background:#f7f3ed;color:#493f38;">
      <h2 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;">Jak przygotować się do masażu?</h2>
      <p style="margin:0 0 12px;color:#6d625a;">Aby masaż przebiegł komfortowo i sprawnie, prosimy o przygotowanie się według poniższych wskazówek:</p>
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
  <html lang="pl"><body style="margin:0;padding:0;background:#eee8df;font-family:Arial,sans-serif;color:#493f38;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eee8df;padding:24px 10px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;">
        <tr><td align="center" style="padding:28px 34px 24px;background:#f5efe7;border-bottom:3px solid #9a7839;">
          <img src="${esc(SITE_URL)}/assets/logo.svg" width="310" alt="Logo" style="display:block;width:310px;max-width:88%;height:auto;margin:0 auto;">
          <div style="margin:22px 0 0;color:#3f7d4a;font-family:'Segoe Print','Bradley Hand',cursive;font-size:22px;line-height:1.35;font-weight:400;">${esc(heading)}</div>
        </td></tr>
        <tr><td style="padding:30px 34px;">
          <p style="margin:0 0 22px;text-align:center;color:#6d625a;line-height:1.55;">${esc(intro)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ed;border-collapse:collapse;">${detailRows}</table>
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
