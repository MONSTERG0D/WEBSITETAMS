# v3.4 (Priority 0) strings — one row per English key, all eight languages together:
# (English, Deutsch, Français, 日本語, Español, Русский, العربية, 中文, 한국어)
# Names of works, games and software stay in English. {n} and {t} are filled in by main.js.

P = [
# ---------- navigation ----------
("About", "Über mich", "À propos", "プロフィール", "Sobre mí", "Обо мне", "عنّي", "关于我", "소개"),
("Contact", "Kontakt", "Contact", "お問い合わせ", "Contacto", "Контакты", "تواصل", "联系", "연락하기"),
("Lighthouse game", "Leuchtturm-Spiel", "Jeu du phare", "灯台ゲーム", "Juego del faro", "Игра «Маяк»", "لعبة المنارة", "灯塔游戏", "등대 게임"),

# ---------- intro + settings ----------
("Skip intro", "Intro überspringen", "Passer l’intro", "イントロをスキップ", "Saltar intro", "Пропустить интро", "تخطي المقدمة", "跳过片头", "인트로 건너뛰기"),
("Continues quietly in 3 seconds", "Geht in 3 Sekunden leise weiter", "Continue en silence dans 3 secondes", "3秒後に音なしで始まります", "Continúa en silencio en 3 segundos", "Продолжится без звука через 3 секунды", "يتابع بصمت خلال 3 ثوانٍ", "3 秒后静音进入", "3초 후 소리 없이 계속됩니다"),
("Play the intro (3 seconds)", "Intro abspielen (3 Sekunden)", "Lire l’intro (3 secondes)", "イントロを再生（3秒）", "Reproducir la intro (3 segundos)", "Показывать интро (3 секунды)", "تشغيل المقدمة (3 ثوانٍ)", "播放片头（3 秒）", "인트로 재생 (3초)"),

# ---------- lighthouse game ----------
("The lighthouse is on. Find the 6 hidden works in the dark.", "Der Leuchtturm ist an. Finde die 6 versteckten Arbeiten im Dunkeln.", "Le phare est allumé. Trouve les 6 œuvres cachées dans le noir.", "灯台に灯りがともった。暗闇に隠れた6つの作品を見つけよう。", "El faro está encendido. Encuentra los 6 trabajos escondidos en la oscuridad.", "Маяк горит. Найди 6 работ, спрятанных в темноте.", "المنارة مضاءة. اعثر على الأعمال الستة المخبأة في الظلام.", "灯塔亮了。在黑暗中找到 6 件隐藏的作品。", "등대에 불이 켜졌다. 어둠 속에 숨은 작품 6개를 찾아라."),
("Side quest", "Nebenquest", "Quête annexe", "サイドクエスト", "Misión secundaria", "Побочный квест", "مهمة جانبية", "支线任务", "사이드 퀘스트"),
("The lighthouse.", "Der Leuchtturm.", "Le phare.", "灯台。", "El faro.", "Маяк.", "المنارة.", "灯塔。", "등대."),
("Six of my works are hidden in the dark. You have 45 seconds.", "Sechs meiner Arbeiten sind im Dunkeln versteckt. Du hast 45 Sekunden.", "Six de mes œuvres sont cachées dans le noir. Tu as 45 secondes.", "暗闇に私の作品が6つ隠れている。制限時間は45秒。", "Seis de mis trabajos están escondidos en la oscuridad. Tienes 45 segundos.", "Шесть моих работ спрятаны в темноте. У тебя 45 секунд.", "ستة من أعمالي مخبأة في الظلام. لديك 45 ثانية.", "我的 6 件作品藏在黑暗里。你有 45 秒。", "내 작품 6개가 어둠 속에 숨어 있다. 제한 시간은 45초."),
("Start the search", "Suche starten", "Lancer la recherche", "探索スタート", "Empezar la búsqueda", "Начать поиск", "ابدأ البحث", "开始寻找", "찾기 시작"),
("See all work", "Alle Arbeiten ansehen", "Voir tous les projets", "すべての作品を見る", "Ver todos los trabajos", "Все работы", "شاهد كل الأعمال", "查看全部作品", "모든 작품 보기"),
("Move the light with your mouse or finger. Hold it on a work to collect it. Keyboard: arrow keys move the light, Enter collects.",
 "Bewege das Licht mit Maus oder Finger. Halte es auf eine Arbeit, um sie einzusammeln. Tastatur: Pfeiltasten bewegen das Licht, Enter sammelt ein.",
 "Déplace la lumière avec ta souris ou ton doigt. Garde-la sur une œuvre pour la récupérer. Clavier : les flèches déplacent la lumière, Entrée récupère.",
 "マウスか指で光を動かそう。作品に光を当て続けると回収できる。キーボード：矢印キーで光を移動、Enterで回収。",
 "Mueve la luz con el ratón o el dedo. Mantenla sobre un trabajo para recogerlo. Teclado: las flechas mueven la luz, Enter recoge.",
 "Двигай свет мышью или пальцем. Задержи его на работе, чтобы забрать её. Клавиатура: стрелки двигают свет, Enter — забрать.",
 "حرّك الضوء بالفأرة أو بإصبعك. أبقِه على العمل لتجمعه. لوحة المفاتيح: الأسهم تحرّك الضوء، وEnter للجمع.",
 "用鼠标或手指移动光束。让光停在作品上即可收集。键盘：方向键移动光束，Enter 收集。",
 "마우스나 손가락으로 빛을 움직여라. 작품 위에 빛을 잠시 비추면 수집된다. 키보드: 화살표 키로 빛 이동, Enter로 수집."),
("Best", "Bestzeit", "Record", "ベスト", "Récord", "Рекорд", "الأفضل", "最佳", "최고 기록"),
("Found", "Gefunden", "Trouvé", "発見", "Encontrado", "Найдено", "تم العثور", "已找到", "발견"),
("Found works", "Gefundene Arbeiten", "Œuvres trouvées", "見つけた作品", "Trabajos encontrados", "Найденные работы", "الأعمال التي وجدتها", "已找到的作品", "찾은 작품"),
("Nothing found yet.", "Noch nichts gefunden.", "Rien trouvé pour l’instant.", "まだ何も見つかっていない。", "Aún no has encontrado nada.", "Пока ничего не найдено.", "لم تجد شيئًا بعد.", "还没有找到任何作品。", "아직 찾은 작품이 없다."),
("All 6 found!", "Alle 6 gefunden!", "Les 6 trouvées !", "6つすべて発見！", "¡Los 6 encontrados!", "Все 6 найдены!", "وجدت الستة كلها!", "6 件全部找到！", "6개 모두 발견!"),
("Time’s up!", "Zeit abgelaufen!", "Temps écoulé !", "タイムアップ！", "¡Se acabó el tiempo!", "Время вышло!", "انتهى الوقت!", "时间到！", "시간 종료!"),
("{n} of 6 found", "{n} von 6 gefunden", "{n} sur 6 trouvées", "6つ中{n}つ発見", "{n} de 6 encontrados", "Найдено {n} из 6", "تم العثور على {n} من 6", "找到 {n}/6", "6개 중 {n}개 발견"),
("Time: {t} s", "Zeit: {t} s", "Temps : {t} s", "タイム：{t}秒", "Tiempo: {t} s", "Время: {t} с", "الوقت: {t} ث", "用时：{t} 秒", "시간: {t}초"),
("Best: {t} s", "Bestzeit: {t} s", "Record : {t} s", "ベスト：{t}秒", "Récord: {t} s", "Рекорд: {t} с", "الأفضل: {t} ث", "最佳：{t} 秒", "최고 기록: {t}초"),
("New best!", "Neue Bestzeit!", "Nouveau record !", "ベスト更新！", "¡Nuevo récord!", "Новый рекорд!", "رقم قياسي جديد!", "新纪录！", "신기록!"),
("Play again", "Nochmal spielen", "Rejouer", "もう一度プレイ", "Jugar otra vez", "Сыграть ещё раз", "العب مجددًا", "再玩一次", "다시 하기"),
]
