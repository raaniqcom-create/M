# Graph Report - muhta  (2026-09-08)

## Corpus Check
- Large corpus: 472 files · ~1,241,845 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1976 nodes · 4035 edges · 187 communities (156 shown, 31 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.79)
- Token cost: 288,130 input · 0 output

## Community Hubs (Navigation)
- Telegram Bot & Schedule Pipeline
- Branch Dashboard & Layout
- Home Screen & Station List
- Road Assistant Map
- WhatsApp Bot
- Anbar Oil Branch Documents
- Report & Brief Builders
- First Run & Alert Setup
- Promo Video Builder
- Login & News Pages
- About, Login & Road Pages
- Availability & Branch Boards
- TypeScript Build Config
- iOS Capacitor Shell
- Admin Station Page
- Admin Panel & Station Form
- Alert Timing & Following
- Branch Viewer Provisioning
- Station Map & Traffic Vote
- Admin Actions
- Owner Panel & Poster
- Admin Health & Stats
- Bottom Dock & Reviews
- Schedule Parsing & Aliases
- Owner Daily Reminder
- Push Diagnostics
- components (20)
- supabase/functions/notify (20)
- package.json (19)
- package.json (19)
- scripts (18)
- app/station/[id] (17)
- HANDOVER.md (17)
- components (16)
- lib (16)
- HANDOVER.md (16)
- docs/promo (16)
- scripts (16)
- scripts (16)
- components (15)
- app/owner (15)
- lib (15)
- scripts (15)
- scripts (15)
- supabase/migrations (14)
- public (14)
- scripts (14)
- scripts (14)
- scripts (14)
- components (13)
- scripts (13)
- docs/anbar-oil (12)
- supabase/functions/health (12)
- supabase/migrations (12)
- app/admin/station (11)
- components (11)
- lib (11)
- supabase/functions/admin-alert (11)
- supabase/migrations (11)
- .github/workflows (10)
- supabase/migrations (10)
- scripts (10)
- scripts (10)
- supabase/functions/announce (10)
- supabase/migrations (10)
- supabase (10)
- android/app/src/androidTest/java/com/getcapacitor/myapp (9)
- lib (9)
- docs/promo (9)
- package.json (9)
- scripts (9)
- scripts (9)
- supabase/functions/otp (9)
- supabase/functions/poll-channel (9)
- supabase/functions/test-push (9)
- .github/workflows (8)
- docs/promo (8)
- HANDOVER.md (8)
- docs/promo (8)
- mockup (8)
- scripts (8)
- components (7)
- components (7)
- components (7)
- store (7)
- mockup (7)
- scripts (7)
- scripts (7)
- scripts (7)
- scripts (7)
- scripts (7)
- supabase/functions/broadcast (7)
- docs (6)
- docs (6)
- .github/workflows (5)
- app/privacy (5)
- app/[slug] (5)
- HANDOVER.md (5)
- scripts (5)
- scripts (5)
- scripts (5)
- scripts (5)
- supabase/functions/rebuild (5)
- supabase/migrations (5)
- android (4)
- components (4)
- docs (4)
- README.md (4)
- scripts (4)
- scripts (4)
- scripts (4)
- scripts (4)
- supabase/functions/delete-account (4)
- supabase/functions/notify-favorites (4)
- android/app/src/main/java/online/muhta/app (3)
- scripts (3)
- scripts (3)
- supabase/migrations (3)
- supabase/migrations (3)
- supabase/migrations (3)
- supabase/migrations (3)
- package.json (2)
- ios/App/CapApp-SPM (2)
- package.json (2)
- package.json (2)
- next-env.d.ts (2)
- package.json (2)
- package.json (2)
- package.json (2)
- scripts (2)
- supabase/migrations (2)
- HANDOVER.md (1)
- misc (1)
- misc (1)
- misc (1)
- misc (1)
- misc (1)

## God Nodes (most connected - your core abstractions)
1. `supabase` - 51 edges
2. `SpinnerIcon()` - 47 edges
3. `FuelProduct` - 42 edges
4. `PRODUCT_LABELS` - 34 edges
5. `isOpenNow()` - 33 edges
6. `send()` - 24 edges
7. `handle()` - 24 edges
8. `CheckIcon()` - 23 edges
9. `HomePage()` - 21 edges
10. `readChoice()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `playNotifs` --semantically_similar_to--> `دالة notify — تنبيه التوفّر (تيليجرام + FCM + APNs)`  [INFERRED] [semantically similar]
  mockup/_template.html → HANDOVER.md
- `Reviewer Demo Station Account` --references--> `Three Roles: Driver, Station Owner, Admin`  [INFERRED]
  store/google-play.md → README.md
- `Play Data Safety Declaration` --semantically_similar_to--> `Data and Privacy Stance`  [INFERRED] [semantically similar]
  store/google-play.md → docs/anbar-oil/guide.html
- `VAPID تُنسخ ولا تُولَّد` --semantically_similar_to--> `iOS يخاطب APNs مباشرة لا عبر Firebase`  [INFERRED] [semantically similar]
  docs/نقل-البيانات.md → HANDOVER.md
- `تقييم الازدحام محميّ — لا يُقبل إلا ممّن وصل أو كان في طريقه` --semantically_similar_to--> `سؤال الازدحام بعد الرحلة فقط`  [INFERRED] [semantically similar]
  رسالة-المحطات.txt → HANDOVER.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **iOS Release Pipeline (Mac-less, key-signed, review-hardened)** — _github_workflows_ios_build_ios, _github_workflows_ios_newest_xcode_selection, _github_workflows_ios_app_store_connect_api_key_signing, _github_workflows_ios_run_number_build_number, _github_workflows_ios_testflight_upload, handover_pre_review_audit [INFERRED 0.85]
- **Free, No-Account, No-Personal-Data Positioning** — docs_anbar_oil_guide_privacy_stance, store_google_play_data_safety, docs_anbar_oil_letter_official_letter, docs_anbar_oil_letter_aldeera_aldeera_channel_letter, docs_promo_explainer_scene_sequence, readme_roles [INFERRED 0.85]
- **سطح دوال Supabase Edge المنشورة للمحطة التقنية** — handover_edge_functions, handover_telegram, handover_notify, handover_otp, handover_admin_alert, handover_broadcast, handover_station_phone, handover_delete_account, docs_naql_albayanat_health_function, docs_naql_albayanat_config_toml [EXTRACTED 1.00]
- **تسلسل نقل القاعدة من سنغافورة إلى فرانكفورت** — docs_naql_albayanat_step_zero_backup, docs_naql_albayanat_fingerprint, docs_naql_albayanat_rehearsal, docs_naql_albayanat_target_build, docs_naql_albayanat_cutover_window, docs_naql_albayanat_rollback, docs_naql_albayanat_breakage_list, handover_maintenance_switch, handover_live_bypass [EXTRACTED 1.00]
- **نظام الساعة الواحدة في فيلم مساعد الطريق** — docs_promo_road_single_clock, docs_promo_road_optional_voice, docs_promo_road_warp, docs_promo_road_filmtime, docs_promo_road_audiotime, docs_promo_road_now, docs_promo_road_scrub, docs_promo_road_collect, docs_promo_road_seek, docs_promo_road_tick, docs_promo_road_marks [EXTRACTED 1.00]
- **حزمة المخاطبة المقدَّمة إلى فرع الأنبار (كتاب + ملحق + حوكمة + كتاب دخول)** — docs_anbar_oil_letter_oil_official_letter, docs_anbar_oil_annex_oil_data_annex, docs_anbar_oil_data_governance_document, docs_anbar_oil_letter_studies_access_letter, docs_anbar_oil_letter_oil_anbar_oil_branch [EXTRACTED 1.00]
- **الخصوصية بالبنية لا بالوعد — الضوابط التقنية المتضافرة** — docs_anbar_oil_data_governance_no_citizen_account, docs_anbar_oil_data_governance_push_token, docs_anbar_oil_data_governance_row_level_security, docs_anbar_oil_data_governance_github_pages, docs_anbar_oil_data_governance_retention_and_deletion, docs_anbar_oil_letter_studies_read_only_scope [INFERRED 0.85]
- **انضباط الأرقام — تعريف معلن وتاريخ قراءة واحد وإفصاح عن الفروق** — docs_anbar_oil_annex_oil_visit_definition, docs_anbar_oil_annex_oil_subscriber_double_count, docs_anbar_oil_data_governance_counting_definition, docs_anbar_oil_data_governance_live_read_snapshot, docs_anbar_oil_data_governance_prior_annex_disclosure [INFERRED 0.85]

## Communities (187 total, 31 thin omitted)

### Community 0 - "Telegram Bot & Schedule Pipeline"
Cohesion: 0.05
Nodes (90): readSchedule(), AlertOutcome, countWord(), sendScheduleAlert(), newPassword(), CORS, db, addFavourite() (+82 more)

### Community 1 - "Branch Dashboard & Layout"
Cohesion: 0.06
Nodes (56): BranchSchedule(), Tab, TABS, metadata, tajawal, viewport, SchedulePage(), Maintenance() (+48 more)

### Community 2 - "Home Screen & Station List"
Cohesion: 0.09
Nodes (34): EMPTY_CITY_COUNTS, StationMap, AvailabilityPopup(), ChevronDownIcon(), SearchIcon(), SlidersIcon(), XIcon(), OutOfCityCall() (+26 more)

### Community 3 - "Road Assistant Map"
Cohesion: 0.08
Nodes (42): disc(), endIcon(), GapSpan, Layers(), lerpColor(), RoadMap(), Stops(), useClusters() (+34 more)

### Community 4 - "WhatsApp Bot"
Cohesion: 0.12
Nodes (48): ANBAR_CITIES, askCity(), askLocation(), askVoice(), availability(), db, FAV_WORDS, fuels() (+40 more)

### Community 5 - "Anbar Oil Branch Documents"
Cohesion: 0.06
Nodes (45): ملحق البيانات — أربعة ملاحق مرفقة بالكتاب الرسمي, ملحق (٤) — منحنى نمو المنصة منذ الإطلاق (08/13 – 09/05), ملحق البيانات (PDF مطبوع), ملحق (٢) — جدول المحطات المسجّلة (37 محطة: اسم، مدينة، عنوان، هاتف، مسؤول), الفراغ على الخريطة غياب تسجيل لا غياب محطات, ملحق (١) — خريطة الرقعة الجغرافية للمحطات المسجّلة, المجموع أقل من حاصل جمع المدن — المشترك يُحسب في كل مدينة اختارها, ملحق (٣) — المشتركون في كل مدينة (المجموع 9,641) (+37 more)

### Community 6 - "Report & Brief Builders"
Cohesion: 0.05
Nodes (30): alerts, allAddr, annex, ar(), byCity, days, devices, env (+22 more)

### Community 7 - "First Run & Alert Setup"
Cohesion: 0.09
Nodes (29): AlertChips(), askPermission(), FirstRun(), chooseTone(), close(), finish(), Permission, TONE_NAMES (+21 more)

### Community 8 - "Promo Video Builder"
Cohesion: 0.05
Nodes (35): all, ANCHOR, body, C, CLIP_HEAD, CUES, CUT_SCENES, delays (+27 more)

### Community 9 - "Login & News Pages"
Cohesion: 0.09
Nodes (26): LoginPage(), submit(), Announcement, NewsPage(), when(), InfoIcon(), PlusIcon(), Msg (+18 more)

### Community 10 - "About, Login & Road Pages"
Cohesion: 0.10
Nodes (21): CONTACTS, metadata, metadata, AdminOnly(), base, BellRingIcon(), CrosshairIcon(), EyeIcon() (+13 more)

### Community 11 - "Availability & Branch Boards"
Cohesion: 0.12
Nodes (25): AvailabilityBoard(), baghdadDate(), BranchBoard(), BranchMap, BranchRow, isSilent(), silentHours(), State (+17 more)

### Community 12 - "TypeScript Build Config"
Cohesion: 0.06
Nodes (31): dom, dom.iterable, esnext, netlify/functions, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+23 more)

### Community 13 - "iOS Capacitor Shell"
Cohesion: 0.08
Nodes (22): Any, Bool, Capacitor, Data, Error, AppDelegate, UIScene, UISceneSession (+14 more)

### Community 14 - "Admin Station Page"
Cohesion: 0.12
Nodes (15): Complaint, STATUS_LABEL, Ad, REASONS, Gone, SpinnerIcon(), clean(), RESERVED (+7 more)

### Community 15 - "Admin Panel & Station Form"
Cohesion: 0.12
Nodes (17): Ad, AdminStationForm(), Handover, BroadcastPanel(), send(), call(), CheckIcon(), LocationField() (+9 more)

### Community 16 - "Alert Timing & Following"
Cohesion: 0.14
Nodes (26): save(), AlertTiming(), apply(), FollowStation(), toggle(), NotificationBell(), AlertPrefs, announceChange() (+18 more)

### Community 17 - "Branch Viewer Provisioning"
Cohesion: 0.10
Nodes (25): badUsername(), db, env, findUser(), label(), main(), normalizePhone(), toEmail() (+17 more)

### Community 18 - "Station Map & Traffic Vote"
Cohesion: 0.14
Nodes (21): PIN_COLOR, pinIcon(), StationMap(), LEVELS, TrafficVote(), vote(), Ask, LEVELS (+13 more)

### Community 19 - "Admin Actions"
Cohesion: 0.14
Nodes (16): AdminPage(), submit(), Step, STEPS, displayPhone(), isValidIraqiMobile(), normalizePhone(), phoneToEmail() (+8 more)

### Community 20 - "Owner Panel & Poster"
Cohesion: 0.12
Nodes (17): LEVELS, AvailabilityPoster(), save(), fitFont(), heightFor(), ChangePassword(), DeleteAccount(), LogOutIcon() (+9 more)

### Community 21 - "Admin Health & Stats"
Cohesion: 0.14
Nodes (17): Check, Mini(), Report, Row, AdminStats(), CityRow, ownerName(), reminderLink() (+9 more)

### Community 22 - "Bottom Dock & Reviews"
Cohesion: 0.13
Nodes (15): BottomDock(), PlatformNotice(), pick(), schedule(), ReviewsPanel(), Row, NOTICE_TEMPLATES, NoticeTemplate (+7 more)

### Community 23 - "Schedule Parsing & Aliases"
Cohesion: 0.13
Nodes (19): searchKnownFuel(), ALIAS_PAIRS, ALIASES, AREA_CITY, AREAS_BY_LENGTH, CITIES_BY_LENGTH, cityInText(), DIALECT (+11 more)

### Community 24 - "Owner Daily Reminder"
Cohesion: 0.14
Nodes (16): adminOnly(), apnsJwt(), b64url(), baghdadNow(), baseKind(), db, fcmToken(), json() (+8 more)

### Community 25 - "Push Diagnostics"
Cohesion: 0.17
Nodes (16): Step, TestPushPage(), run(), OwnerDeviceLink(), OwnerReminders(), toggle(), State, ServiceWorkerRegister() (+8 more)

### Community 26 - "components (20)"
Cohesion: 0.19
Nodes (12): DownloadPage(), AndroidIcon(), AppleIcon(), BeforeInstallPromptEvent, InstallPrompt(), PermissionHelp(), APP_STORE_URL, detectPlatform() (+4 more)

### Community 27 - "supabase/functions/notify (20)"
Cohesion: 0.15
Nodes (15): apnsToken(), b64url(), CORS, db, fcmAccessToken(), headline(), json(), Listener (+7 more)

### Community 28 - "package.json (19)"
Cohesion: 0.11
Nodes (19): autoprefixer, netlify-cli, devDependencies, autoprefixer, netlify-cli, postcss, tailwindcss, @types/leaflet (+11 more)

### Community 29 - "package.json (19)"
Cohesion: 0.11
Nodes (19): @capacitor/android, @capacitor/core, @capacitor/ios, @capacitor/local-notifications, @capacitor/push-notifications, dependencies, @capacitor/android, @capacitor/core (+11 more)

### Community 30 - "scripts (18)"
Cohesion: 0.12
Nodes (15): CLIPS, cues, delays, files, inputs, lengths, made, missing (+7 more)

### Community 31 - "app/station/[id] (17)"
Cohesion: 0.18
Nodes (12): db, dynamicParams, generateMetadata(), getStation(), StationPage(), ComplaintButton(), StationLive(), WorkingHours() (+4 more)

### Community 32 - "HANDOVER.md (17)"
Cohesion: 0.15
Nodes (17): المهام المجدولة الأربع (notify-favorites · owner-daily · clear-stale-traffic · rollup-notifications), دالة health — تثبت APNs وFCM والموقع ورمزَي تلغرام وGitHub, المرحلة الثانية — بناء الهدف قبل النافذة بأيّام, VAPID تُنسخ ولا تُولَّد, iOS يخاطب APNs مباشرة لا عبر Firebase, AppDelegate.swift بلا didRegisterForRemoteNotifications — الحلقة الأولى المفقودة, دالة broadcast — إرسال عرض للمشتركين, دالة delete-account — حذف الحساب داخل التطبيق (+9 more)

### Community 33 - "components (16)"
Cohesion: 0.19
Nodes (12): PhoneIcon(), StarIcon(), headlines(), NewsTicker(), App, LINKS, RouteButton(), Hours (+4 more)

### Community 34 - "lib (16)"
Cohesion: 0.23
Nodes (12): HOURS, MINUTES, TimeSelect(), baghdadMinutesNow(), CLOSING_SOON_MINUTES, formatTime(), minutesLabel(), openingLine() (+4 more)

### Community 35 - "HANDOVER.md (16)"
Cohesion: 0.15
Nodes (16): قائمة ما يكسر — سبع عشرة نقطة, دفتر نقل البيانات إلى فرانكفورت — مؤجَّل بقرار, app/[slug]/page.tsx يبتلع خطأ القراءة — بناء ناجح بلا صفحات محطات, غلافا Capacitor — نافذتان على muhta.online, scripts/check-outage.mjs — فحص الصيانة وشريط القِدَم, حقول الإدخال ١٦ بكسل على الأقل, باب الفحص أثناء الصيانة — ?live=1, مفتاح الصيانة public/status.json (+8 more)

### Community 36 - "docs/promo (16)"
Cohesion: 0.14
Nodes (16): collect, fitChips — فضّ تراكب لافتات المدن بـ getBBox, MARKS — خمس عشرة علامة فصل على الشريط, now, وميض الافتتاح — visibility لا display:none كي لا تفشل getBBox, الصوت اختياري — voice.mp3 هو الساعة إن وُجد، وإلا ساعة الجدار, مسجّل الشاشة — MediaRecorder على getDisplayMedia, scene (+8 more)

### Community 37 - "scripts (16)"
Cohesion: 0.20
Nodes (15): normalizeName(), bareWord(), lineProduct(), looksLikeSchedule(), parseSchedule(), readManualLine(), readProduct(), a (+7 more)

### Community 38 - "scripts (16)"
Cohesion: 0.12
Nodes (10): addr, byPlatform, cities, collected, env, H, n, oldLetter (+2 more)

### Community 39 - "components (15)"
Cohesion: 0.27
Nodes (10): metadata, AlertSetup(), stop(), AlertsPrompt(), BellIcon(), WaitingForStations(), AlertChoice, ALERTS_CHANGED (+2 more)

### Community 40 - "app/owner (15)"
Cohesion: 0.15
Nodes (8): OwnerPage(), setTraffic(), togglePhoneHidden(), MANUAL_TRAFFIC_MINUTES, cancelTrafficReminder(), Plugin, scheduleTrafficReminder(), station()

### Community 41 - "lib (15)"
Cohesion: 0.26
Nodes (13): ProductControl(), RUNS_OUT, WHEN, StationCard(), hasRunOut(), isWithdrawn(), PERIODS, runsOutLabel() (+5 more)

### Community 42 - "scripts (15)"
Cohesion: 0.15
Nodes (13): AUDIO, chrome, CUES, evalIn(), GUIDE, MODES, OUTDIR, PAGE (+5 more)

### Community 43 - "scripts (15)"
Cohesion: 0.15
Nodes (12): body, byCity, CITIES, files, kept, km(), merged, out (+4 more)

### Community 44 - "supabase/migrations (14)"
Cohesion: 0.15
Nodes (10): auth, public.station_archive, public.station_reviews_guard(), public.station_reach(), device_tokens, public.deleted_stations(), public.restore_station(), profiles (+2 more)

### Community 45 - "public (14)"
Cohesion: 0.14
Nodes (13): background_color, description, dir, display, icons, lang, name, orientation (+5 more)

### Community 46 - "scripts (14)"
Cohesion: 0.14
Nodes (12): bed, CAPTIONS, CLIPS, cues, delays, files, gap, inputs (+4 more)

### Community 47 - "scripts (14)"
Cohesion: 0.14
Nodes (11): badExpr, badStart, badUsername, CASES, fromLogin, fromScript, loginExpr, loginSrc (+3 more)

### Community 48 - "scripts (14)"
Cohesion: 0.14
Nodes (10): back, block, { cacheStations, loadCachedStations }, fake, from, js, mem, ROWS (+2 more)

### Community 49 - "components (13)"
Cohesion: 0.22
Nodes (10): AdminThreads(), Thread, DeletedStations(), ChatRow, isStuck(), readableBy(), StationChat(), send() (+2 more)

### Community 50 - "scripts (13)"
Cohesion: 0.29
Nodes (12): click(), clickLabel(), evaluate(), main(), pending, scrollTo(), send(), SHOTS (+4 more)

### Community 51 - "docs/anbar-oil (12)"
Cohesion: 0.21
Nodes (12): Admin Approval and Phone Verification Gate, Benefits Offered to the Directorate, Anticipated Questions Box, Service Guide PDF Export, Service Guide (Four-Page Attachment), أحمد الرفاعي — Platform Originator and Supervisor, Letter to Al-Deera Satellite Channel, Al-Deera Letter PDF Export (+4 more)

### Community 52 - "supabase/functions/health (12)"
Cohesion: 0.26
Nodes (10): b64url(), Check, checkApns(), checkFcm(), checkGithub(), checkTelegram(), CORS, db (+2 more)

### Community 53 - "supabase/migrations (12)"
Cohesion: 0.36
Nodes (10): public.station_product_traffic, public.station_traffic_avg, public.station_products_live, public.nearby_stations(), public.station_product_traffic, public.station_products_live, public.station_traffic_avg, station_products (+2 more)

### Community 54 - "app/admin/station (11)"
Cohesion: 0.27
Nodes (7): decide(), Panel(), saveEdit(), saveName(), setStatus(), announceStation(), rebuildSite()

### Community 55 - "components (11)"
Cohesion: 0.24
Nodes (7): metadata, StoreIcon(), RegisterGate(), StationRegisterForm(), checkName(), chooseKnown(), pickCity()

### Community 56 - "lib (11)"
Cohesion: 0.29
Nodes (9): onPlatform(), knownFuelNear(), metresBetween(), NameHit, NearbyFuel, rad(), SUSPICIOUS_M, ROAD_STATIONS (+1 more)

### Community 57 - "supabase/functions/admin-alert (11)"
Cohesion: 0.31
Nodes (8): apnsJwt(), b64url(), CORS, db, fcmAccessToken(), json(), pemToPkcs8(), pushToAdmins()

### Community 58 - "supabase/migrations (11)"
Cohesion: 0.20
Nodes (6): alert_prefs, notification_log, public.admin_stats(), device_tokens, public.branch_stats(), public.alerts_for()

### Community 59 - ".github/workflows (10)"
Cohesion: 0.27
Nodes (10): Deploy Site Workflow, .nojekyll Guard, Static Export to GitHub Pages, stations-changed Repository Dispatch, Three-Step Operating Flow, Owner Guide Step Sequence, Environment Variables and VAPID Keys, المحطة التقنية PWA (+2 more)

### Community 60 - "supabase/migrations (10)"
Cohesion: 0.22
Nodes (9): public.archive_station, station_messages, station_reviews, public.archive_station(), public.deleted_stations(), public.restore_station(), public.station_archive, device_tokens (+1 more)

### Community 61 - "scripts (10)"
Cohesion: 0.36
Nodes (6): hasRunOut(), isFresh(), isListed(), isOffered(), isStaleOffer(), isWithdrawn()

### Community 62 - "scripts (10)"
Cohesion: 0.20
Nodes (5): body, i, js, loop, src

### Community 63 - "supabase/functions/announce (10)"
Cohesion: 0.31
Nodes (8): ALL_PRODUCTS, apnsJwt(), b64url(), CORS, db, fcmToken(), json(), pemToPkcs8()

### Community 64 - "supabase/migrations (10)"
Cohesion: 0.20
Nodes (7): public.admin_stats(), device_tokens, public.announce_reach(), public.alerts_for(), alerts, public.admin_stats(), device_tokens

### Community 65 - "supabase (10)"
Cohesion: 0.22
Nodes (5): ads, handle_new_user(), on_auth_user_created, push_subscriptions, station_traffic_avg

### Community 66 - "android/app/src/androidTest/java/com/getcapacitor/myapp (9)"
Cohesion: 0.33
Nodes (5): ExampleInstrumentedTest, ExampleUnitTest, androidx.test.ext.junit.runners.AndroidJUnit4, org.junit.runner.RunWith, org.junit.Test

### Community 67 - "lib (9)"
Cohesion: 0.25
Nodes (5): HomePage(), useOpenAnnouncements(), homeFor(), Session, useSession()

### Community 68 - "docs/promo (9)"
Cohesion: 0.31
Nodes (9): MAIN_D — هندسة مسار الرمادي ← منفذ عرعر, العودة ليست الذهاب معكوساً — الاتجاه محسوب, الامتداد الأطول بين محطتين — ٢٢٨ كم (ذروة الفيلم), لا لغة تحذير في الفيلم — الرقم وحده يكفي, مصدر كل رقم — لا رقم مكتوب بيد, public/road-routes.json — ٨٧٠ رحلة من محرّك OSRM, lib/roadStations.ts — snapAlong و ON_ROAD_M=500, المنافذ الثلاثة — طريبيل والقائم وعرعر (+1 more)

### Community 69 - "package.json (9)"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 70 - "scripts (9)"
Cohesion: 0.25
Nodes (6): chrome, evalJs(), original, pending, send(), STATUS

### Community 71 - "scripts (9)"
Cohesion: 0.28
Nodes (7): both(), BULLET, EIGHT, fromEdge, fromLib, named, NL

### Community 72 - "supabase/functions/otp (9)"
Cohesion: 0.25
Nodes (4): CORS, db, json(), sendSms()

### Community 74 - "supabase/functions/test-push (9)"
Cohesion: 0.39
Nodes (8): b64url(), CORS, db, fcmAccessToken(), json(), pemToPkcs8(), sendApns(), sendFcm()

### Community 75 - ".github/workflows (8)"
Cohesion: 0.29
Nodes (8): Capacitor WebView Shell (Android), App Store Connect API Key Signing, Build iOS Workflow, Newest Xcode Selection, Run Number as CFBundleVersion, TestFlight Upload Step, WKWebView Shell (iOS), CapApp-SPM Dependency Host Package

### Community 76 - "docs/promo (8)"
Cohesion: 0.25
Nodes (8): Problem Statement Table, Service QR Block (Site, iPhone, Android), Two Aspect Ratios From One File, Explainer Video Stage (explainer.html), Persistent Brand Band, QR Legibility Under Video Compression, Nine-Scene Explainer Sequence, Station Owner Guide Video (guide.html)

### Community 77 - "HANDOVER.md (8)"
Cohesion: 0.25
Nodes (8): PRE_LAUNCH — الراية الصامتة (?? '1'), حدّ ما نعرف — المعروض تغطية فقط, مساعد الطريق — خدمة داخل المحطة التقنية, لا حذف تلقائي عند تشابه المحطات, ست محطات حقيقية فقط في محافظة كاملة — أضعف ما في المنصّة, دالة telegram — بوت @muhtaonlinebot, رسالة المحطات — تحديثات الأربع والعشرين ساعة, Six Ordered Play Screenshots

### Community 78 - "docs/promo (8)"
Cohesion: 0.32
Nodes (8): audioTime, filmTime, PARAS — طبقة الكلمات لمراجعة تطابق الصوت بالصورة, scripts/build-road.mjs — يبني التعليق ويحقن جدول المقابلة, ثمان وخمسون وحدة نطق — التوقيت يُقاس لا يُقدَّر (جذر الخطأ ٠٫٨٢ث), filmTime, WARP القصير — ١٢ مِرساة و AUDIO_TOTAL ١٦٠٫٧٧, WARP — جدول المقابلة بين زمن الفيلم وزمن الصوت (١٣١ث ↔ ٢٥١٫٢٦ث)

### Community 79 - "mockup (8)"
Cohesion: 0.36
Nodes (8): card, CITIES — ست عشرة مدينة بعدّادي now و at, isOpen, render, حالة النطاق — HOME و picked و allAnbar و prodFilter, scopeLabel, STATIONS — ثمانية عشر اسماً حقيقياً بحالات متخيَّلة, visible

### Community 80 - "scripts (8)"
Cohesion: 0.29
Nodes (6): NEW, OLD, PAGE, r2(), spanFor(), { total, cues }

### Community 81 - "components (7)"
Cohesion: 0.38
Nodes (3): metadata, call(), ResetForm()

### Community 82 - "components (7)"
Cohesion: 0.38
Nodes (3): metadata, call(), SubscribeForm()

### Community 83 - "components (7)"
Cohesion: 0.38
Nodes (6): AdminHealth(), callAnnounce(), confirmSend(), preview(), previewPending(), announceBody()

### Community 84 - "store (7)"
Cohesion: 0.29
Nodes (7): Four-Phase Expansion Plan, Data and Privacy Stance, Reviewer Demo Station Account, App Name Without the Province, 12-Tester Closed Testing Requirement, Play Data Safety Declaration, Google Play Store Listing Copy

### Community 85 - "mockup (7)"
Cohesion: 0.33
Nodes (7): سؤال الازدحام بعد الرحلة فقط, الازدحام للمسرب لا للمحطة, NEWS — أخبار محطات لم تنضمّ بعد، بتصويت «ما زال متوفراً / نفد», newsRows, renderNews, vote, تقييم الازدحام محميّ — لا يُقبل إلا ممّن وصل أو كان في طريقه

### Community 86 - "scripts (7)"
Cohesion: 0.33
Nodes (5): chrome, files, pending, sleep(), waitForTarget()

### Community 87 - "scripts (7)"
Cohesion: 0.33
Nodes (5): NEW, OLD, PAGE, r2(), spanFor()

### Community 88 - "scripts (7)"
Cohesion: 0.38
Nodes (6): always, decide(), justPassed(), night, S, toMinutes()

### Community 89 - "scripts (7)"
Cohesion: 0.33
Nodes (4): at(), isStuck(), NOW, THREAD_KINDS

### Community 90 - "scripts (7)"
Cohesion: 0.33
Nodes (5): activeTrafficLevel(), crowd, later, owner, trafficSource()

### Community 91 - "supabase/functions/broadcast (7)"
Cohesion: 0.29
Nodes (3): CORS, db, OTPIQ_SENDER

### Community 92 - "docs (6)"
Cohesion: 0.40
Nodes (6): جدول alerts — اشتراكات حيّة لا سجلّ تاريخي, المرحلة الثالثة — النافذة (٥:٠٠ إلى ٥:٤٠ فجراً), لا جملة هدم واحدة على القديم — فعلان عكوسان فقط, جدول notification_log — السجلّ المؤجَّل, التراجع — مجّاني قبل ص+١٨، دمج يدوي بعده, ضبط المتسلسلات بعد COPY

### Community 93 - "docs (6)"
Cohesion: 0.40
Nodes (6): البصمة — md5 على auth.users و auth.identities, مُشغّل on_auth_user_created على auth.users, scripts/probe-public.mjs — تسعة مسارات يقرؤها الزائر, المرحلة الأولى — البروفة على مشروع يُرمى, الخطوة صفر — النسخة الاحتياطية الأولى, حدّ المشروعين على الخطّة المجّانية

### Community 94 - ".github/workflows (5)"
Cohesion: 0.50
Nodes (5): AAB Bundle Artifact, APK Signature Verification, Build APK Workflow, Firebase Config Restore Step, Package Name online.muhta.app

### Community 97 - "HANDOVER.md (5)"
Cohesion: 0.40
Nodes (5): دالة otp — رموز SMS عبر OTPIQ, الرقم هو رقم النشر واسم الدخول (p<digits>@muhta.app), دالة station-phone — نقل ملكية المحطة, إخفاء رقم هاتف المحطة, وقت آخر تحديث للحالة — بديل «اتصل قبل أن تتحرك»

### Community 98 - "scripts (5)"
Cohesion: 0.50
Nodes (3): doc(), old, qr()

### Community 99 - "scripts (5)"
Cohesion: 0.40
Nodes (3): CANDIDATES, original, targets

### Community 100 - "scripts (5)"
Cohesion: 0.60
Nodes (4): main(), Store a GitHub Actions secret. GitHub requires secrets sealed with the repo's…, request(), seal()

### Community 102 - "supabase/functions/rebuild (5)"
Cohesion: 0.40
Nodes (3): CORS, db, NEWLINE

### Community 105 - "supabase/migrations (5)"
Cohesion: 0.50
Nodes (3): public.branch_viewers, public.is_branch_viewer(), auth.users

### Community 106 - "android (4)"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 108 - "docs (4)"
Cohesion: 0.50
Nodes (4): supabase/config.toml مع كل نشر دوال — verify_jwt=false وإلّا ٤٠١, لا يُنشر بـ نشر-الدوال.bat — ينشر ستّاً من أربع عشرة, دوال Supabase Edge المنشورة, الأسرار خارج المستودع — supabase secrets set و set-gh-secret.py

### Community 109 - "README.md (4)"
Cohesion: 0.67
Nodes (4): Colour-Only Congestion Voting, Database Schema (profiles, stations, station_products, traffic_votes, push_subscriptions, ads), station_traffic_avg View, Play Content Rating Answers

### Community 111 - "scripts (4)"
Cohesion: 0.50
Nodes (3): b64, ICON, PAGE

### Community 112 - "scripts (4)"
Cohesion: 0.67
Nodes (3): PAGE, prepare(), QR()

### Community 113 - "scripts (4)"
Cohesion: 0.50
Nodes (3): env, H, READS

## Knowledge Gaps
- **472 isolated node(s):** `db`, `dynamicParams`, `metadata`, `CONTACTS`, `Ad` (+467 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `line()` connect `Branch Viewer Provisioning` to `Login & News Pages`, `scripts (16)`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `CITY_NAMES` connect `Home Screen & Station List` to `Telegram Bot & Schedule Pipeline`, `Availability & Branch Boards`, `Admin Panel & Station Form`, `components (7)`, `Schedule Parsing & Aliases`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `SpinnerIcon()` connect `Admin Station Page` to `Branch Dashboard & Layout`, `Home Screen & Station List`, `Road Assistant Map`, `First Run & Alert Setup`, `Login & News Pages`, `About, Login & Road Pages`, `Availability & Branch Boards`, `Admin Panel & Station Form`, `Alert Timing & Following`, `Admin Actions`, `Owner Panel & Poster`, `Admin Health & Stats`, `Bottom Dock & Reviews`, `Push Diagnostics`, `components (15)`, `lib (15)`, `components (13)`, `components (7)`, `components (7)`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `db`, `dynamicParams`, `metadata` to the rest of the system?**
  _472 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Telegram Bot & Schedule Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05390893470790378 - nodes in this community are weakly interconnected._
- **Should `Branch Dashboard & Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.05647517039922103 - nodes in this community are weakly interconnected._
- **Should `Home Screen & Station List` be split into smaller, more focused modules?**
  _Cohesion score 0.08874912648497554 - nodes in this community are weakly interconnected._