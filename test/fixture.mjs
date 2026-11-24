// Test için EczaneAPI biçiminde SAHTE yanıt üretir. Adlar, adresler ve telefonlar uydurmadır.
const DISTRICTS = [
  ['Beyoğlu', 41.0370, 28.9770], ['Şişli', 41.0600, 28.9870], ['Beşiktaş', 41.0430, 29.0070],
  ['Kadıköy', 40.9900, 29.0290], ['Üsküdar', 41.0230, 29.0150], ['Fatih', 41.0190, 28.9400],
  ['Kağıthane', 41.0800, 28.9700], ['Sarıyer', 41.1670, 29.0500], ['Bakırköy', 40.9800, 28.8720],
  ['Ataşehir', 40.9840, 29.1060], ['Maltepe', 40.9350, 29.1300], ['Kartal', 40.8900, 29.1900],
  ['Esenyurt', 41.0300, 28.6700], ['Bağcılar', 41.0390, 28.8560], ['Eyüpsultan', 41.0480, 28.9330],
  ['Zeytinburnu', 40.9940, 28.9040], ['Ümraniye', 41.0160, 29.1240], ['Pendik', 40.8770, 29.2350],
];
const NAMES = ['Şifa', 'Hayat', 'Güneş', 'Deva', 'Nur', 'Merkez', 'Yıldız', 'Sağlık', 'Umut', 'Lale',
  'Papatya', 'Çınar', 'Defne', 'Ada', 'Mavi', 'Huzur', 'Gül', 'Pınar', 'Ece', 'Bahar'];

function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function day(base, offset) {
  return new Date(Date.parse(base + 'T12:00:00Z') + offset * 864e5).toISOString().slice(0, 10);
}

export function pharmaciesFor(date, seed) {
  const r = rand(seed);
  const out = [];
  let id = seed * 1000;
  for (const [d, lat, lng] of DISTRICTS) {
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const name = `${NAMES[Math.floor(r() * NAMES.length)]} Eczanesi`;
      out.push({
        id: ++id,
        name,
        address: `Örnek Mah. ${10 + Math.floor(r() * 80)}. Sk. No:${1 + Math.floor(r() * 60)}`,
        phone: `0212 000 ${String(10 + Math.floor(r() * 89))} ${String(10 + Math.floor(r() * 89))}`,
        phone2: null,
        location: {latitude: +(lat + (r() - .5) * .03).toFixed(6), longitude: +(lng + (r() - .5) * .04).toFixed(6)},
        city: {id: 34, name: 'İstanbul', slug: 'istanbul'},
        district: {id: 1, name: d, slug: d.toLowerCase()},
        duty: {date, isVerified: true},
      });
    }
  }
  return out;
}

/** Yesterday, today, tomorrow — as the API answers without a date. Plus a few broken rows. */
export function payload(today) {
  const days = [-1, 0, 1].map((o, i) => {
    const date = day(today, o);
    const list = pharmaciesFor(date, 11 + i);
    if (o === -1) {
      list.push({id: 'no-addr', name: 'Adressiz Eczanesi', address: null, phone: '(0212) 000 11 22',
        location: {latitude: '41.0375', longitude: '28.9790'}, city: {slug: 'istanbul'}, district: {name: 'Beyoğlu'}, duty: {date}});
      list.push({id: 'no-phone', name: 'Telefonsuz Eczanesi', address: 'Örnek Cad. No:1', phone: '', phone2: 'yok',
        location: {latitude: 41.06, longitude: 28.98}, city: {slug: 'istanbul'}, district: {name: 'Şişli'}, duty: {date}});
      list.push({id: 'bad-point', name: 'Konumsuz Eczanesi', address: 'Örnek Sk. No:3', phone: '2120001122',
        location: {latitude: 0, longitude: 0}, city: {slug: 'istanbul'}, district: {name: 'Fatih'}, duty: {date}});
      list.push({id: 'other-city', name: 'Başka İl Eczanesi', address: 'x', phone: '02240001122',
        location: {latitude: 40.19, longitude: 29.06}, city: {slug: 'bursa', name: 'Bursa'}, district: {name: 'Osmangazi'}, duty: {date}});
      list.push({id: 'ankara-leak', name: 'Park Eczanesi', address: 'Tunalı Hilmi Cad.', phone: '03120001122',
        location: null, city: {slug: 'istanbul'}, district: {name: 'Çankaya'}, duty: {date}});
      list.push({id: 'old-name', name: 'Eski Ad Eczanesi', address: 'Örnek Sk. No:9', phone: '02120001133',
        location: {latitude: 41.05, longitude: 28.93}, city: {slug: 'istanbul'}, district: {name: 'Eyüp'}, duty: {date}});
      list.push({id: 'broken'});
      list.push({...list[0]}); // duplicate
    }
    return {date, count: list.length, pharmacies: list};
  });
  return {success: true, data: days, meta: {requestId: 'test'}};
}
