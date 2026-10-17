/*
 * Mert Yeşil Eğitim Portalı — Akıllı Tahta yapılandırması
 * -------------------------------------------------------
 * Bu dosyayı düzenleyerek tüm tahtalarda görünecek kitapları,
 * Google Drive klasörlerini ve API anahtarını tek yerden yönetebilirsiniz.
 * (Kullanıcının Ayarlar ekranında girdiği değerler bu dosyadakilerin önüne geçer.)
 */
window.TAHTA_CONFIG = {
  appName: 'Mert Yeşil Eğitim Portalı',
  version: '2.0',

  /*
   * Kullanıcıların uygulama içinden kitap eklemesine izin verilsin mi?
   * false (önerilen): "Kitap Ekle", cihazdan yükleme, sürükle-bırak, yedek yükleme
   * ve bağlantıyla rastgele PDF açma kapalıdır. Kitaplar yalnızca bu dosyadaki
   * "books" ve "driveFolders" listelerinden gelir; API anahtarı da yalnızca
   * buradan okunur.
   * true: Herkes kendi tahtasına Drive/web/cihaz PDF'i ekleyebilir.
   */
  allowUserUploads: false,

  /*
   * Google Drive API anahtarı (isteğe bağlı ama önerilir).
   * Anahtar varsa Drive PDF'leri tam özellikli "Kitap" ve "Sayfa" modlarında açılır,
   * Drive klasörleri otomatik olarak kütüphaneye aktarılır.
   * Anahtar yoksa Drive dosyaları Google'ın kendi önizleyicisiyle açılır
   * (çizim araçları yine kullanılabilir).
   * Nasıl alınır: README.md → "Google Drive API anahtarı".
   */
  googleApiKey: '',

  /*
   * İsteğe bağlı CORS vekil sunucusu. API anahtarı yerine kullanılabilir.
   * "{url}" yer tutucusu hedef adresle değiştirilir; yoksa adres sona eklenir.
   * Örnek: 'https://vekil.ornek.com/?url={url}'
   */
  corsProxy: '',

  /*
   * Açılışta otomatik senkronize edilecek, "Bağlantıya sahip olan herkes"
   * ile paylaşılmış Google Drive klasörleri (API anahtarı gerekir).
   * Alt klasörler kategori olarak içeri aktarılır.
   * Örnek: { link: 'https://drive.google.com/drive/folders/KLASOR_ID', category: '8. Sınıf Fen' }
   */
  driveFolders: [],

  /*
   * Varsayılan kitaplar. Her kitap için şunlardan biri yeterlidir:
   *   pdfUrl: 'https://.../dosya.pdf'                     (web adresi)
   *   drive:  'https://drive.google.com/file/d/ID/view'    (Drive bağlantısı veya ID)
   * coverUrl verilmezse kapak otomatik üretilir.
   */
  books: [
    {
      id: 'fen-7-fasikul-1',
      title: 'Türkiye ve Uzay Araştırmaları',
      grade: '7. Sınıf',
      category: '7. Sınıf Fen Bilimleri',
      type: '1. Ünite 1. Konu Fasikülü',
      coverUrl: 'https://mertyesil.com.tr/dersler/filestahta/7.SINIF FEN BİLİMLERİ 1.ÜNİTE 1.KONU FASİKÜLÜ KAPAK.png',
      pdfUrl: 'https://mertyesil.com.tr/dersler/7/files/fen/1.ÜNİTE 1.KONU FASİKÜLÜ.pdf'
    },
    {
      id: 'fen-7-fasikul-2',
      title: 'Uzayda Neler Var?',
      grade: '7. Sınıf',
      category: '7. Sınıf Fen Bilimleri',
      type: '1. Ünite 2. Konu Fasikülü',
      coverUrl: 'https://mertyesil.com.tr/dersler/filestahta/7.SINIF FEN BİLİMLERİ 1.ÜNİTE 2.KONU FASİKÜLÜ KAPAK.png',
      pdfUrl: 'https://mertyesil.com.tr/dersler/7/files/fen/1.ÜNİTE 2.KONU FASİKÜLÜ.pdf'
    },
    {
      id: 'fen-7-fasikul-3',
      title: 'Kuvvet, İş ve Enerji İlişkisi',
      grade: '7. Sınıf',
      category: '7. Sınıf Fen Bilimleri',
      type: '2. Ünite 1. Konu Fasikülü',
      coverUrl: 'https://mertyesil.com.tr/dersler/filestahta/7.SINIF FEN BİLİMLERİ 2.ÜNİTE 1.KONU FASİKÜLÜ KAPAK.png',
      pdfUrl: 'https://mertyesil.com.tr/dersler/7/files/fen/2.ÜNİTE 1.KONU FASİKÜLÜ.pdf'
    },
    {
      id: 'fen-7-fasikul-4',
      title: 'Enerji Dönüşümleri',
      grade: '7. Sınıf',
      category: '7. Sınıf Fen Bilimleri',
      type: '2. Ünite 2. Konu Fasikülü',
      coverUrl: 'https://mertyesil.com.tr/dersler/filestahta/7.SINIF FEN BİLİMLERİ 2.ÜNİTE 2.KONU FASİKÜLÜ KAPAK.png',
      pdfUrl: 'https://mertyesil.com.tr/dersler/7/files/fen/2.ÜNİTE 2.KONU FASİKÜLÜ.pdf'
    },
    {
      id: 'fen-7-fasikul-5',
      title: 'Sindirim Sistemi',
      grade: '7. Sınıf',
      category: '7. Sınıf Fen Bilimleri',
      type: '3. Ünite 1. Konu Fasikülü',
      coverUrl: 'https://mertyesil.com.tr/dersler/filestahta/7.SINIF FEN BİLİMLERİ 3.ÜNİTE 1.KONU FASİKÜLÜ KAPAK.png',
      pdfUrl: 'https://mertyesil.com.tr/dersler/7/files/fen/3.ÜNİTE 1.KONU FASİKÜLÜ.pdf'
    }
  ]
};
