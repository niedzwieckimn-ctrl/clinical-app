import { requireAdmin, response } from './_auth.js';
import { validateRange, blockedCells } from './_booking-range.js';
import { handler as confirmBooking } from './admin-confirm.js';

export const handler = async event => {
  if (!['GET','POST'].includes(event.httpMethod)) return response(405,{error:'Method Not Allowed'});
  try {
    const auth = await requireAdmin(event);
    if (auth.error) return auth.error;
    const sb = auth.sb;
    if (event.httpMethod === 'GET') {
      let range;
      try { range = validateRange(event.queryStringParameters?.day, '08:00','20:00'); }
      catch (e) { return response(400,{error:e.message}); }
      const [b,s,t] = await Promise.all([
        sb.from('bookings_view').select('when, starts_at, ends_at, status').lt('starts_at',range.end).gt('ends_at',range.start),
        sb.from('slots').select('when,taken').gte('when',range.start).lt('when',range.end),
        sb.from('services').select('id,name,duration_min').eq('active',true).order('name')
      ]);
      if ([b,s,t].some(q=>q.error)) return response(503,{error:'Nie można pobrać kalendarza. Sprawdź, czy uruchomiono migrację 202609140001_admin_range_booking.sql.'});
      const clients = [];
      for (let offset=0;;offset+=500) {
        const q = await sb.from('clients').select('id,name,email,phone,address').order('id').range(offset,offset+499);
        if (q.error) throw q.error;
        clients.push(...q.data);
        if (q.data.length < 500) break;
      }
      return response(200,{blocked:blockedCells(range.start,b.data,s.data), clients,services:t.data});
    }
    let body, range;
    try {
      body = JSON.parse(event.body || '{}');
      range = validateRange(body.day,body.start,body.end);
      if (Date.parse(range.start)<=Date.now()) throw new Error('Nie można dodać wizyty w przeszłości.');
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.request_id||'')) throw new Error('Odśwież okno rezerwacji.');
      for (const [key,max] of [['name',150],['email',254],['phone',40],['address',500]]) {
        if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length>max) throw new Error('Uzupełnij poprawnie dane klienta i adres.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new Error('Wpisz poprawny e-mail.');
      if (!body.service_id) throw new Error('Wybierz zabieg.');
    } catch(e) { return response(400,{error:e.message}); }
    const {data,error} = await sb.rpc('create_admin_range_booking',{
      p_request_id:body.request_id,p_start:range.start,p_end:range.end,
      p_service_id:String(body.service_id),p_client_id:body.client_id ? String(body.client_id) : null,
      p_name:body.name.trim(),p_email:body.email.trim(),p_phone:body.phone.trim(),p_address:body.address.trim(),
      p_notes:String(body.notes||'').slice(0,2000)
    });
    if (error) {
      const conflict = error.code==='23P01' || /range_unavailable/.test(error.message);
      return response(conflict?409:400,{error:conflict?'Ten zakres jest już zajęty. Wybierz inne godziny.':'Nie zapisano wizyty. Sprawdź dane i migrację bazy.', code:error.code});
    }
    const booking = data?.[0];
    if (!booking?.booking_no) throw new Error('Brak numeru zapisanej wizyty.');
    // The request key is persisted atomically with the visit: network retries never create another visit or resend mail.
    if (booking.reused) return response(200,{ok:true,booking_no:booking.booking_no,warning:'Ta wizyta została już zapisana. Sprawdź jej status w Rezerwacjach; ponowienie nie wysłało kolejnego e-maila.'});
    const sent = await confirmBooking({...event,body:JSON.stringify({booking_no:booking.booking_no})});
    if (sent.statusCode!==200) return response(201,{ok:true,booking_no:booking.booking_no,warning:'Wizyta została zapisana, ale potwierdzenie lub wysyłka e-maila/przypomnienia nie zakończyły się poprawnie. Sprawdź status w Rezerwacjach oraz logi Resend. Nie dodawaj wizyty ponownie.'});
    return response(201,{ok:true,booking_no:booking.booking_no});
  } catch(e) {
    console.error('admin-create-range-booking failed', e.code || e.name);
    return response(500,{error:'Nie udało się zakończyć operacji. Sprawdź Rezerwacje przed ponownym dodaniem wizyty.'});
  }
};
