# Akıllı Tahta — Mert Yeşil Eğitim Portalı

Akıllı tahtalar için dijital kitap okuyucu. Web'deki, **Google Drive**'daki veya bilgisayardaki PDF'leri
gerçekçi sayfa çevirme efektiyle açar; kalem, lazer, spot ışığı, perde ve zamanlayıcı gibi sınıf araçları sunar.
Kurulum gerektirmez — statik dosyalardır, herhangi bir web sunucusunda (GitHub Pages dahil) çalışır.

## Öne çıkanlar

| | |
|---|---|
| 📚 **Kütüphane** | Arama, kategoriler, favoriler, son okunanlar, "kaldığın yerden devam et", otomatik kapak üretimi |
| ☁️ **Google Drive** | Dosya veya klasör bağlantısı yapıştırın; klasörler (alt klasörler dahil) kategori olarak aktarılır, Google Dokümanlar/Slaytlar PDF'e çevrilerek açılır |
| 📖 **İki okuma modu** | *Kitap* (çift sayfa, sayfa çevirme efekti) ve *Sayfa* (tek sayfa, sunum modu) |
| 🔍 **Okuyucu** | Akıllı yakınlaştırma (Ctrl+tekerlek, iki parmak), genişliğe sığdır, kaydırma, küçük resimler, içindekiler, kitap içinde metin arama |
| ✏️ **Çizim** | Kalem, fosforlu kalem, dikdörtgen/elips/çizgi/ok, metin, silgi, geri al/yinele — çizimler sayfa sayfa kaydedilir |
| 🎯 **Sınıf araçları** | Lazer işaretçi, spot ışığı, perde, geri sayım/kronometre, beyaz tahta (kareli/çizgili/kara tahta), ekran görüntüsü |
| 📱 **Paylaşım** | Kitabı istediğiniz sayfadan açan bağlantı ve QR kod |
| 📴 **Çevrimdışı** | PWA olarak yüklenebilir; açılan kitaplar önbelleğe alınır |

## Dosyalar

```
akillitahta.html   Uygulama
assets/config.js   ← Kitap listesi, Drive klasörleri ve API anahtarı (düzenlenecek tek dosya)
assets/app.js      Uygulama mantığı
assets/app.css     Görünüm
sw.js              Çevrimdışı önbellek (Service Worker)
manifest.json      PWA bilgileri
```

## Kitap eklemek

**Herkes için (tüm tahtalarda görünsün):** `assets/config.js` içindeki `books` listesine ekleyin:

```js
{ title: 'Hücre ve Bölünmeler', category: '8. Sınıf Fen', grade: '8. Sınıf',
  drive: 'https://drive.google.com/file/d/DOSYA_ID/view' }       // veya pdfUrl: 'https://…/kitap.pdf'
```

Bir Drive klasörünün tamamını otomatik getirmek için:

```js
driveFolders: [ { link: 'https://drive.google.com/drive/folders/KLASOR_ID', category: '8. Sınıf Fen' } ]
```

### Yükleme kilidi (varsayılan: kapalı)

`assets/config.js` içindeki `allowUserUploads: false` ayarı sayesinde tahtayı kullanan hiç kimse
uygulama içinden kitap ekleyemez: **Kitap Ekle** düğmesi, cihazdan yükleme, sürükle-bırak, yedek yükleme,
Ayarlar'daki API anahtarı alanı ve `#pdf=…` / `#drive=…` bağlantılarıyla kütüphane dışı dosya açma devre dışıdır.
Kitaplar yalnızca bu dosyadaki `books` ve `driveFolders` listelerinden gelir (Drive klasörüne dosya koymak yeterli).

İsterseniz `allowUserUploads: true` yaparak her tahtanın kendi kitaplarını eklemesine izin verebilirsiniz:
o zaman **Kitap Ekle** → *Google Drive*, *Web bağlantısı* veya *Bu cihazdan* ve sürükle-bırak açılır.

> Drive dosya/klasörleri **"Bağlantıya sahip olan herkes — Görüntüleyen"** olarak paylaşılmalıdır.

## Google Drive API anahtarı

Anahtar olmadan Drive dosyaları Google'ın kendi önizleyicisinde açılır (çizim, lazer, spot ve perde yine çalışır).
Anahtar eklendiğinde Drive PDF'leri de **kitap modu, metin arama, içindekiler, sayfa sayfa çizim** ve **klasör aktarımı** kazanır.

1. <https://console.cloud.google.com/> → yeni proje oluşturun.
2. **API'ler ve Hizmetler → Kitaplık** → *Google Drive API* → **Etkinleştir**.
3. **Kimlik bilgileri → Kimlik bilgisi oluştur → API anahtarı**.
4. Anahtarı kısıtlayın: *Uygulama kısıtlamaları* → **Web siteleri** (ör. `https://mertyesil.com.tr/*`),
   *API kısıtlamaları* → yalnızca **Google Drive API**.
5. Anahtarı `assets/config.js` içindeki `googleApiKey` alanına yapıştırın (yükleme kilidi kapalıysa uygulamadaki **Ayarlar** ekranına da girilebilir).

Anahtar yalnızca herkese açık paylaşılmış dosyaları okuyabilir; özel dosyalarınıza erişim vermez.

## Paylaşım bağlantıları

| Adres | Açılan |
|---|---|
| `akillitahta.html#kitap=fen-7-fasikul-1&s=12` | Kütüphanedeki kitap, 12. sayfa |
| `akillitahta.html#drive=DOSYA_ID` | Drive PDF'i |
| `akillitahta.html#pdf=https://…/kitap.pdf` | Web PDF'i |
| `akillitahta.html#tahta=1` | Beyaz tahta |

## Kısayollar

`←/→`, `PgUp/PgDn`, `Boşluk` sayfa çevirir (sunum kumandaları da çalışır) · `+ - 0 W` yakınlaştırma ·
`M` mod değiştir · `V P H R X E L` araçlar · `1–8` renkler · `Ctrl+Z / Ctrl+Y` geri al/yinele ·
`S` spot ışığı · `C` perde · `T` küçük resimler · `Ctrl+F` kitapta ara · `F` tam ekran · `Esc` kapat.

## Yerel çalıştırma

Service Worker ve dosya erişimi için bir web sunucusu gerekir:

```bash
npx http-server .     # veya: python3 -m http.server
```
