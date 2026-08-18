# Graph Report - muhta  (2026-08-18)

## Corpus Check
- Large corpus: 310 files · ~1,056,716 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1113 nodes · 2158 edges · 104 communities (82 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.84)
- Token cost: 144,978 input · 0 output

## Community Hubs (Navigation)
- تنبيهات المستخدم والنغمات
- بوت تيليجرام
- بوت واتساب
- لوحة الإدارة والملصقات
- هيكل التطبيق والدفع
- الأيقونات وصفحات الدخول
- تذكيرات الملّاك والإعداد
- مخطط القاعدة والهجرات
- غلاف iOS
- ساعات العمل والإحصائيات
- الصفحة الرئيسية والبحث
- إدارة المحطات والتقييمات
- صفحة المحطة والمنتجات
- الخريطة والازدحام
- اختيار المدن والتنبيهات
- أدوات التطوير
- حزم Capacitor
- بناء فيديو الدليل
- دالة الإشعارات
- الإعلانات والشكاوى
- خطوط بناء التطبيقات
- لوحة المالك والمشاركة
- MapPicker.tsx
- explainer.html
- render-video.mjs
- manifest.json
- build-voice.mjs
- google-play.md
- shoot-ios.mjs
- deploy.yml
- page.tsx
- index.ts
- index.ts
- index.ts
- index.ts
- phone.ts
- ExampleInstrumentedTest.java
- HANDOVER.md
- package.json
- index.ts
- index.ts
- index.ts
- page.tsx
- StationLinkCard.tsx
- retime-explainer.mjs
- page.tsx
- ResetForm.tsx
- SubscribeForm.tsx
- print-pdf.mjs
- sync-voice.mjs
- test-owner-daily.mjs
- test-traffic.mjs
- index.ts
- HANDOVER.md
- README.md
- index.ts
- page.tsx
- shareApp.ts
- audit-cycles.mjs
- make-icons.mjs
- set-gh-secret.py
- verify-holes.mjs
- gradlew
- BroadcastPanel.tsx
- diag-admin.mjs
- inline-logo.mjs
- inline-qr.mjs
- probe-public.mjs
- index.ts
- index.ts
- MainActivity.java
- page.tsx
- make-ios-assets.mjs
- upload-wa-audio.mjs
- package.json
- Package.swift
- package.json
- package.json
- next-env.d.ts
- package.json
- package.json
- package.json
- 20260817_announcements.sql
- Community 100
- Community 102

## God Nodes (most connected - your core abstractions)
1. `supabase` - 33 edges
2. `SpinnerIcon()` - 28 edges
3. `handle()` - 24 edges
4. `isOpenNow()` - 21 edges
5. `PRODUCT_LABELS` - 21 edges
6. `FuelProduct` - 21 edges
7. `send()` - 17 edges
8. `compilerOptions` - 16 edges
9. `CheckIcon()` - 15 edges
10. `route()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `stations_guard_trg RLS Trigger` --semantically_similar_to--> `Admin Approval and Phone Verification Gate`  [INFERRED] [semantically similar]
  HANDOVER.md → docs/anbar-oil/guide.html
- `Play Data Safety Declaration` --semantically_similar_to--> `Data and Privacy Stance`  [INFERRED] [semantically similar]
  store/google-play.md → docs/anbar-oil/guide.html
- `Service Guide PDF Export` --references--> `Service Guide (Four-Page Attachment)`  [INFERRED]
  docs/anbar-oil/guide.pdf → docs/anbar-oil/guide.html
- `submit()` --calls--> `phoneToEmail()`  [EXTRACTED]
  app/login/page.tsx → lib/phone.ts
- `HomePage()` --indirect_call--> `isOpenNow()`  [INFERRED]
  app/page.tsx → lib/hours.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **iOS Release Pipeline (Mac-less, key-signed, review-hardened)** — _github_workflows_ios_build_ios, _github_workflows_ios_newest_xcode_selection, _github_workflows_ios_app_store_connect_api_key_signing, _github_workflows_ios_run_number_build_number, _github_workflows_ios_testflight_upload, handover_pre_review_audit [INFERRED 0.85]
- **Station Publication Trust Chain** — docs_anbar_oil_guide_admin_approval_gate, handover_stations_guard_trg, handover_station_phone_function, handover_no_auto_dedupe, readme_roles, _github_workflows_deploy_stations_changed_dispatch [INFERRED 0.85]
- **Free, No-Account, No-Personal-Data Positioning** — docs_anbar_oil_guide_privacy_stance, store_google_play_data_safety, docs_anbar_oil_letter_official_letter, docs_anbar_oil_letter_aldeera_aldeera_channel_letter, docs_promo_explainer_scene_sequence, readme_roles [INFERRED 0.85]

## Communities (104 total, 22 thin omitted)

### Community 0 - "تنبيهات المستخدم والنغمات"
Cohesion: 0.06
Nodes (52): metadata, DownloadPage(), AlertSetup(), save(), stop(), AlertsPrompt(), askPermission(), FirstRun() (+44 more)

### Community 1 - "بوت تيليجرام"
Cohesion: 0.08
Nodes (58): addFavourite(), ADMIN_IDS, advance(), answer(), approveOne(), ask(), call(), CANCEL_ROW (+50 more)

### Community 2 - "بوت واتساب"
Cohesion: 0.13
Nodes (48): ANBAR_CITIES, askCity(), askLocation(), askVoice(), availability(), db, FAV_WORDS, fuels() (+40 more)

### Community 3 - "لوحة الإدارة والملصقات"
Cohesion: 0.07
Nodes (28): decide(), Complaint, Panel(), saveName(), setStatus(), STATUS_LABEL, AdminHealth(), callAnnounce() (+20 more)

### Community 4 - "هيكل التطبيق والدفع"
Cohesion: 0.08
Nodes (25): metadata, tajawal, viewport, OwnerPage(), setTraffic(), Step, TestPushPage(), run() (+17 more)

### Community 5 - "الأيقونات وصفحات الدخول"
Cohesion: 0.08
Nodes (26): LoginPage(), submit(), Announcement, NewsPage(), when(), base, BellRingIcon(), DownloadIcon() (+18 more)

### Community 6 - "تذكيرات الملّاك والإعداد"
Cohesion: 0.06
Nodes (36): baghdadMinutesNow(), config, handler(), isOpenNow(), PRODUCT_LABELS, toMinutes(), dom, dom.iterable (+28 more)

### Community 7 - "مخطط القاعدة والهجرات"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.station_reviews_guard(), public.admin_stats(), device_tokens, public.announce_reach(), public.alerts_for(), public.station_product_traffic (+14 more)

### Community 8 - "غلاف iOS"
Cohesion: 0.08
Nodes (22): Any, Bool, Capacitor, Data, Error, AppDelegate, UIScene, UISceneSession (+14 more)

### Community 9 - "ساعات العمل والإحصائيات"
Cohesion: 0.14
Nodes (18): AdminStats(), CityRow, Row, StationLive(), HOURS, MINUTES, TimeSelect(), WorkingHours() (+10 more)

### Community 10 - "الصفحة الرئيسية والبحث"
Cohesion: 0.13
Nodes (16): HomePage(), SearchIcon(), ProductsDashboard(), countActive(), EMPTY_FILTERS, Filters, SearchBar(), TripAsk() (+8 more)

### Community 11 - "إدارة المحطات والتقييمات"
Cohesion: 0.15
Nodes (15): Ad, AdminStationForm(), Handover, CheckIcon(), XIcon(), ReviewsPanel(), Row, deviceId() (+7 more)

### Community 12 - "صفحة المحطة والمنتجات"
Cohesion: 0.15
Nodes (17): db, dynamicParams, generateMetadata(), getStation(), StationPage(), MapPinIcon(), PhoneIcon(), App (+9 more)

### Community 13 - "الخريطة والازدحام"
Cohesion: 0.19
Nodes (14): StationMap, PIN_COLOR, pinIcon(), StationMap(), LEVELS, Ask, LEVELS, ProductTraffic (+6 more)

### Community 14 - "اختيار المدن والتنبيهات"
Cohesion: 0.17
Nodes (14): AlertChips(), BellIcon(), CITY_NAMES, WaitingForStations(), AlertChoice, ANNOUNCE_TEMPLATES, AnnounceTemplate, BODY_MAX (+6 more)

### Community 15 - "أدوات التطوير"
Cohesion: 0.11
Nodes (19): autoprefixer, netlify-cli, devDependencies, autoprefixer, netlify-cli, postcss, tailwindcss, @types/leaflet (+11 more)

### Community 16 - "حزم Capacitor"
Cohesion: 0.11
Nodes (19): @capacitor/android, @capacitor/core, @capacitor/ios, @capacitor/local-notifications, @capacitor/push-notifications, dependencies, @capacitor/android, @capacitor/core (+11 more)

### Community 17 - "بناء فيديو الدليل"
Cohesion: 0.12
Nodes (15): CLIPS, cues, delays, files, inputs, lengths, made, missing (+7 more)

### Community 18 - "دالة الإشعارات"
Cohesion: 0.17
Nodes (13): apnsToken(), b64url(), CORS, db, fcmAccessToken(), headline(), json(), Listener (+5 more)

### Community 19 - "الإعلانات والشكاوى"
Cohesion: 0.17
Nodes (8): Ad, ComplaintButton(), REASONS, DeleteAccount(), headlines(), NewsTicker(), supabase, timeoutSignal()

### Community 20 - "خطوط بناء التطبيقات"
Cohesion: 0.15
Nodes (16): AAB Bundle Artifact, APK Signature Verification, Build APK Workflow, Capacitor WebView Shell (Android), Firebase Config Restore Step, App Store Connect API Key Signing, Build iOS Workflow, Newest Xcode Selection (+8 more)

### Community 21 - "لوحة المالك والمشاركة"
Cohesion: 0.25
Nodes (12): LEVELS, ProductControl(), WHEN, ShareButton(), share(), ExpectedPeriod, expectedLabel(), isoDateIn() (+4 more)

### Community 22 - "MapPicker.tsx"
Cohesion: 0.22
Nodes (7): SpinnerIcon(), LocationField(), MapPicker, pin, ANBAR_CENTER, ANBAR_CITIES, ANBAR_ZOOM

### Community 23 - "explainer.html"
Cohesion: 0.15
Nodes (15): Service Guide PDF Export, Problem Statement Table, أحمد الرفاعي — Platform Originator and Supervisor, Letter to Al-Deera Satellite Channel, Al-Deera Letter PDF Export, Two Requests to the Channel, Official Letter to Anbar Oil Products Distribution, Official Letter PDF Export (+7 more)

### Community 24 - "render-video.mjs"
Cohesion: 0.15
Nodes (13): AUDIO, chrome, CUES, evalIn(), GUIDE, MODES, OUTDIR, PAGE (+5 more)

### Community 25 - "manifest.json"
Cohesion: 0.14
Nodes (13): background_color, description, dir, display, icons, lang, name, orientation (+5 more)

### Community 26 - "build-voice.mjs"
Cohesion: 0.14
Nodes (12): bed, CAPTIONS, CLIPS, cues, delays, files, gap, inputs (+4 more)

### Community 27 - "google-play.md"
Cohesion: 0.19
Nodes (13): Benefits Offered to the Directorate, Four-Phase Expansion Plan, Data and Privacy Stance, Service Guide (Four-Page Attachment), Three Requests to the Directorate, DSA Trader Verification (EU Distribution), Only Six Real Stations in the Whole Province, telegram Edge Function (@muhtaonlinebot) (+5 more)

### Community 28 - "shoot-ios.mjs"
Cohesion: 0.29
Nodes (12): click(), clickLabel(), evaluate(), main(), pending, scrollTo(), send(), SHOTS (+4 more)

### Community 29 - "deploy.yml"
Cohesion: 0.21
Nodes (12): Deploy Site Workflow, .nojekyll Guard, Static Export to GitHub Pages, stations-changed Repository Dispatch, Three-Step Operating Flow, Owner Guide Step Sequence, Static Export Constraint on Dynamic Routes, Environment Variables and VAPID Keys (+4 more)

### Community 30 - "page.tsx"
Cohesion: 0.21
Nodes (5): AdminPage(), core(), findSimilar(), NOISE, normalise()

### Community 31 - "index.ts"
Cohesion: 0.31
Nodes (8): apnsJwt(), b64url(), CORS, db, fcmAccessToken(), json(), pemToPkcs8(), pushToAdmins()

### Community 32 - "index.ts"
Cohesion: 0.27
Nodes (9): b64url(), Check, checkApns(), checkFcm(), checkTelegram(), CORS, db, json() (+1 more)

### Community 33 - "index.ts"
Cohesion: 0.25
Nodes (7): apnsJwt(), b64url(), db, fcmToken(), MESSAGES, Msg, pemToPkcs8()

### Community 34 - "index.ts"
Cohesion: 0.22
Nodes (6): StationAnnouncePanel(), countReach(), publish(), audience(), CORS, db

### Community 35 - "phone.ts"
Cohesion: 0.42
Nodes (8): submit(), displayPhone(), isValidIraqiMobile(), normalizePhone(), phoneToEmail(), whatsappLink(), emails, same

### Community 36 - "ExampleInstrumentedTest.java"
Cohesion: 0.33
Nodes (5): ExampleInstrumentedTest, ExampleUnitTest, androidx.test.ext.junit.runners.AndroidJUnit4, org.junit.runner.RunWith, org.junit.Test

### Community 37 - "HANDOVER.md"
Cohesion: 0.22
Nodes (9): Admin Approval and Phone Verification Gate, iOS Talks to APNs Directly, Missing APNs Device-Token Registration, delete-account Edge Function, iPhone-Only Bundle, No Automatic Deletion on Station Similarity, notify Edge Function, Pre-Review Multi-Agent Audit (+1 more)

### Community 38 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 39 - "index.ts"
Cohesion: 0.36
Nodes (8): ALL_PRODUCTS, apnsJwt(), b64url(), CORS, db, fcmToken(), json(), pemToPkcs8()

### Community 40 - "index.ts"
Cohesion: 0.25
Nodes (4): CORS, db, json(), sendSms()

### Community 41 - "index.ts"
Cohesion: 0.39
Nodes (8): b64url(), CORS, db, fcmAccessToken(), json(), pemToPkcs8(), sendApns(), sendFcm()

### Community 42 - "page.tsx"
Cohesion: 0.29
Nodes (5): metadata, StoreIcon(), RegisterGate(), StationRegisterForm(), checkName()

### Community 43 - "StationLinkCard.tsx"
Cohesion: 0.36
Nodes (7): ShareIcon(), clean(), RESERVED, StationLinkCard(), copy(), saveSlug(), share()

### Community 44 - "retime-explainer.mjs"
Cohesion: 0.29
Nodes (6): NEW, OLD, PAGE, r2(), spanFor(), { total, cues }

### Community 45 - "page.tsx"
Cohesion: 0.29
Nodes (5): CONTACTS, metadata, FacebookIcon(), InstagramIcon(), WhatsappIcon()

### Community 46 - "ResetForm.tsx"
Cohesion: 0.38
Nodes (3): metadata, call(), ResetForm()

### Community 47 - "SubscribeForm.tsx"
Cohesion: 0.38
Nodes (3): metadata, call(), SubscribeForm()

### Community 48 - "print-pdf.mjs"
Cohesion: 0.33
Nodes (5): chrome, files, pending, sleep(), waitForTarget()

### Community 49 - "sync-voice.mjs"
Cohesion: 0.33
Nodes (5): NEW, OLD, PAGE, r2(), spanFor()

### Community 50 - "test-owner-daily.mjs"
Cohesion: 0.38
Nodes (6): always, decide(), justPassed(), night, S, toMinutes()

### Community 51 - "test-traffic.mjs"
Cohesion: 0.33
Nodes (5): activeTrafficLevel(), crowd, later, owner, trafficSource()

### Community 52 - "index.ts"
Cohesion: 0.29
Nodes (4): BULLET, db, PRODUCT_LABELS, SPLIT

### Community 53 - "HANDOVER.md"
Cohesion: 0.40
Nodes (6): Anticipated Questions Box, admin-alert Edge Function, broadcast Edge Function, otp Edge Function (OTPIQ SMS), station-phone Edge Function, Deployed Supabase Edge Functions

### Community 54 - "README.md"
Cohesion: 0.40
Nodes (6): Ask About Congestion Only After the Trip, Congestion Measured Per Lane, Not Per Station, Colour-Only Congestion Voting, Database Schema (profiles, stations, station_products, traffic_votes, push_subscriptions, ads), station_traffic_avg View, Play Content Rating Answers

### Community 57 - "shareApp.ts"
Cohesion: 0.40
Nodes (4): share(), SHARE_TEXT, shareApp(), ShareResult

### Community 59 - "make-icons.mjs"
Cohesion: 0.40
Nodes (3): CANDIDATES, original, targets

### Community 60 - "set-gh-secret.py"
Cohesion: 0.60
Nodes (4): main(), Store a GitHub Actions secret. GitHub requires secrets sealed with the repo's…, request(), seal()

### Community 63 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 64 - "BroadcastPanel.tsx"
Cohesion: 0.83
Nodes (3): BroadcastPanel(), send(), call()

### Community 66 - "inline-logo.mjs"
Cohesion: 0.50
Nodes (3): b64, ICON, PAGE

### Community 67 - "inline-qr.mjs"
Cohesion: 0.67
Nodes (3): PAGE, prepare(), QR()

### Community 68 - "probe-public.mjs"
Cohesion: 0.50
Nodes (3): env, H, READS

## Knowledge Gaps
- **260 isolated node(s):** `db`, `dynamicParams`, `metadata`, `CONTACTS`, `Ad` (+255 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `الإعلانات والشكاوى` to `BroadcastPanel.tsx`, `تنبيهات المستخدم والنغمات`, `لوحة الإدارة والملصقات`, `هيكل التطبيق والدفع`, `الأيقونات وصفحات الدخول`, `ساعات العمل والإحصائيات`, `الصفحة الرئيسية والبحث`, `إدارة المحطات والتقييمات`, `StationLinkCard.tsx`, `الخريطة والازدحام`, `اختيار المدن والتنبيهات`, `لوحة المالك والمشاركة`, `MapPicker.tsx`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `SpinnerIcon()` connect `MapPicker.tsx` to `BroadcastPanel.tsx`, `تنبيهات المستخدم والنغمات`, `لوحة الإدارة والملصقات`, `هيكل التطبيق والدفع`, `الأيقونات وصفحات الدخول`, `ساعات العمل والإحصائيات`, `الصفحة الرئيسية والبحث`, `إدارة المحطات والتقييمات`, `StationLinkCard.tsx`, `اختيار المدن والتنبيهات`, `ResetForm.tsx`, `SubscribeForm.tsx`, `لوحة المالك والمشاركة`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `isOpenNow()` connect `ساعات العمل والإحصائيات` to `الإعلانات والشكاوى`, `الصفحة الرئيسية والبحث`, `لوحة الإدارة والملصقات`, `صفحة المحطة والمنتجات`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `db`, `dynamicParams`, `metadata` to the rest of the system?**
  _260 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `تنبيهات المستخدم والنغمات` be split into smaller, more focused modules?**
  _Cohesion score 0.06233538191395961 - nodes in this community are weakly interconnected._
- **Should `بوت تيليجرام` be split into smaller, more focused modules?**
  _Cohesion score 0.08123904149620105 - nodes in this community are weakly interconnected._
- **Should `بوت واتساب` be split into smaller, more focused modules?**
  _Cohesion score 0.12816326530612246 - nodes in this community are weakly interconnected._