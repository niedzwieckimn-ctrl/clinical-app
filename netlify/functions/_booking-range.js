const zone = 'Europe/Warsaw';
const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
export function localInstant(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^\d{2}:(00|30)$/.test(time || '')) throw new Error('Nieprawidłowa data lub godzina.');
  const [y,m,d] = day.split('-').map(Number), [h,min] = time.split(':').map(Number);
  const desired = Date.UTC(y,m-1,d,h,min);
  let ms = desired;
  for (let i=0;i<3;i++) {
    const p = parts(new Date(ms));
    ms += desired-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  }
  const p = parts(new Date(ms));
  if (`${p.year}-${p.month}-${p.day}` !== day || `${p.hour}:${p.minute}` !== time) throw new Error('Nieprawidłowa data lub godzina.');
  return new Date(ms);
}
export function validateRange(day, start, end) {
  const a = localInstant(day,start), b = localInstant(day,end);
  if (start < '08:00' || end > '20:00' || b <= a) throw new Error('Wybierz zakres od 08:00 do 20:00, co 30 minut.');
  return { start:a.toISOString(), end:b.toISOString() };
}
export function formatBookingRange(booking) {
  const start = new Date(booking.when).toLocaleString('pl-PL', {timeZone:zone,dateStyle:'full',timeStyle:'short'});
  return booking.ends_at ? `${start}–${new Date(booking.ends_at).toLocaleTimeString('pl-PL',{timeZone:zone,hour:'2-digit',minute:'2-digit'})}` : start;
}
export const isActive = status => !/^(anul|cancel)/i.test(String(status || ''));
export function blockedCells(start, bookings, slots, now = Date.now()) {
  const base = +new Date(start);
  return Array.from({length:24}, (_,i) => {
    const a = base+i*1800000, b = a+1800000;
    return a <= now || bookings.some(v => isActive(v.status) && +new Date(v.starts_at ?? v.when) < b && +new Date(v.ends_at) > a)
      || slots.some(s => s.taken && +new Date(s.when) >= a && +new Date(s.when) < b);
  });
}
