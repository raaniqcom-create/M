// Anbar province districts, with a rough centre for each so the map can jump
// to a city before any station exists there.
export const ANBAR_CITIES = [
  { name: 'الرمادي', lat: 33.4258, lng: 43.3012 },
  { name: 'الفلوجة', lat: 33.3556, lng: 43.7864 },
  { name: 'هيت', lat: 33.6383, lng: 42.8258 },
  { name: 'حديثة', lat: 34.1372, lng: 42.3789 },
  { name: 'عانة', lat: 34.4686, lng: 41.9375 },
  { name: 'راوة', lat: 34.4756, lng: 41.9139 },
  { name: 'القائم', lat: 34.3689, lng: 41.0906 },
  { name: 'الرطبة', lat: 33.0386, lng: 40.2864 },
  { name: 'الحبانية', lat: 33.3628, lng: 43.5586 },
  { name: 'الخالدية', lat: 33.3789, lng: 43.4881 },
  { name: 'عامرية الفلوجة', lat: 33.2264, lng: 43.6786 },
  { name: 'الكرمة', lat: 33.4453, lng: 43.7972 },
  { name: 'البغدادي', lat: 33.8517, lng: 42.6472 },
  { name: 'الحقلانية', lat: 34.0575, lng: 42.3792 },
  { name: 'بروانة', lat: 34.1508, lng: 42.3739 },
  { name: 'النخيب', lat: 32.0369, lng: 42.2506 },
  // نواحي الأنبار — أُضيفت بعد مقارنة القائمة بـOpenStreetMap، فقد كانت
  // كبيسة وتسعٌ غيرها غائبة، وصاحب محطةٍ فيها يضطرّ أن ينسب نفسه لقضائه.
  { name: 'كبيسة', lat: 33.5941, lng: 42.6185 }, // هيت
  { name: 'المحمدي', lat: 33.5509, lng: 42.9011 }, // هيت — ناحية الفرات
  { name: 'الصقلاوية', lat: 33.3964, lng: 43.6833 }, // الفلوجة
  { name: 'حصيبة', lat: 33.4207, lng: 43.4533 }, // الرمادي
  { name: 'الرحالية', lat: 32.7658, lng: 43.3911 }, // الرمادي
  { name: 'العبيدي', lat: 34.4281, lng: 41.2173 }, // القائم
  { name: 'الكرابلة', lat: 34.3909, lng: 41.0464 }, // القائم
  { name: 'الرمانة', lat: 34.3931, lng: 41.078 }, // القائم
  { name: 'عكاشات', lat: 33.6675, lng: 39.967 }, // الرطبة
  { name: 'الوليد', lat: 33.4328, lng: 38.9321 }, // الرطبة — المنفذ
] as const;

export const CITY_NAMES = ANBAR_CITIES.map((c) => c.name);

// whole-province view: used as the map's default framing
export const ANBAR_CENTER: [number, number] = [33.6, 42.3];
export const ANBAR_ZOOM = 7;
