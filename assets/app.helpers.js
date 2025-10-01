(function(global){
  function ymd(d){const x=new Date(d);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');}
  function fmtDate(d){try{return new Date(d).toLocaleDateString('pl-PL')}catch{return String(d)}}
  function fmtMoney(n){try{return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(n)||0)}catch{return String(n)}}
  function makeBookingNo(){return 'B'+Date.now().toString(36).toUpperCase();}
  global.Helpers = global.Helpers || { ymd, fmtDate, fmtMoney, makeBookingNo };
})(window);
