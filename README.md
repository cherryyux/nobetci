# Nöbetçi Eczane

Aç, konum iznini ver, en yakın nöbetçi eczane en üstte. Tek dokunuşla **Ara** ya da **Yol tarifi**.
Konum izni yoksa ilçe seçerek bakılır. Telefona "Ana ekrana ekle" ile uygulama gibi kurulur ve internet zayıfken son listeyi gösterir.

## Nasıl çalışıyor

```
GitHub Actions (her gece 00:35)  →  EczaneAPI  →  data/istanbul.json  →  GitHub Pages  →  telefon
```

- Liste her gece **bir kez** çekilir (07:05 ve 18:05'te yalnızca gece başarısız olduysa tekrar denenir). Kaç kişi açarsa açsın API'ye günde bir istek gider.
- API anahtarı GitHub'ın gizli değişkeninde durur, tarayıcıya hiç gitmez.
- Nöbet günü sabah 09:00'da değişir: 09:00'dan önce dünkü liste, sonra bugünkü liste gösterilir. Gündüz "bu akşam nöbetçi" diye işaretlenir, pazar günü bütün gün nöbet sayılır.
- Konum telefonda kalır, hiçbir yere gönderilmez.

## Kurulum (bir kerelik, ~10 dk)

1. **API anahtarı:** [eczaneapi.com](https://eczaneapi.com) → ücretsiz hesap aç → API anahtarı oluştur.
2. **Repo:** GitHub'da yeni bir repo aç (ör. `nobetci`) ve bu klasördeki her şeyi yükle.
3. **Anahtarı ekle:** Repo → *Settings → Secrets and variables → Actions → New repository secret*
   Ad: `ECZANEAPI_KEY`, değer: anahtarın.
4. **Pages'i aç:** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
5. **İlk listeyi çek:** *Actions → "Nöbet listesini güncelle ve yayınla" → Run workflow*.
6. Telefonda `https://<kullanıcı-adın>.github.io/nobetci/` adresini aç → tarayıcı menüsü → **Ana ekrana ekle**.

### Başka il eklemek

*Settings → Secrets and variables → Actions → Variables* altında `CITIES` değişkeni oluştur: `istanbul,yalova` gibi. Her il günde bir istek demek.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `index.html` | Uygulamanın tamamı (tek sayfa) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Ana ekrana kurulum ve çevrimdışı açılış |
| `scripts/fetch.mjs` | Listeyi API'den çekip `data/` altına yazar (bağımlılık yok, Node 20+) |
| `.github/workflows/update.yml` | Gece çalışan iş + Pages'e yayın |
| `test/` | Sahte API'ye karşı testler: `npm test` |

Elle denemek için: `ECZANEAPI_KEY=... node scripts/fetch.mjs`, sonra `npx serve .` (konum için `localhost` yeterli).

## Bilmen gerekenler

- **Veri resmî kaynak değil.** İstanbul Eczacı Odası listesini üçüncü taraflara açmıyor, o yüzden veri EczaneAPI'den geliyor. Nöbet son dakika değişebilir: gitmeden önce ara. Sayfanın altında e-Devlet ve Eczacı Odası bağlantıları duruyor.
- EczaneAPI ücretsiz planın günlük kotasını sitesinde yazmıyor. Günde bir istek her planda yetecek kadar az; kota dolarsa iş kırmızı yanar, eski liste yerinde kalır.
- GitHub, 60 gün hiç commit olmayan repolarda zamanlanmış işleri durdurur. Burada her gece veri commit'lendiği için bu olmaz.
- Mesafe kuş uçuşudur; yürüme süresi kaba bir tahmindir.
