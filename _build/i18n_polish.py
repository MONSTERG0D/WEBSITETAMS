# Step 7 polish (v3.11): Home role line and Currently building, the three-step order form, the Work timeline
# and missions terminal, the Riot refresh. One row per English key:
# (English, Deutsch, Français, 日本語, Español, Русский, العربية, 中文, 한국어)
# Terminal commands (help, ls, open, whoami, contact, clear) stay in English in every language: they are what you type.

P = [
# ---------- home ----------
("Motion designer, 3D artist and game developer — a computer science student at Tezpur University, Assam.",
 "Motion Designer, 3D-Artist und Spieleentwickler — Informatikstudent an der Tezpur University in Assam.",
 "Motion designer, artiste 3D et développeur de jeux — étudiant en informatique à la Tezpur University, en Assam.",
 "モーションデザイナー、3Dアーティスト、ゲーム開発者 — インド・アッサム州テズプル大学のコンピューターサイエンス専攻の学生です。",
 "Motion designer, artista 3D y desarrollador de videojuegos — estudiante de informática en la Tezpur University, Assam.",
 "Моушн-дизайнер, 3D-художник и разработчик игр — студент-информатик Университета Тезпура, Ассам.",
 "مصمم موشن وفنان ثلاثي الأبعاد ومطوّر ألعاب — طالب علوم حاسوب في جامعة تيزبور، آسام.",
 "动态设计师、3D 艺术家、游戏开发者 —— 阿萨姆邦提斯浦尔大学的计算机科学学生。",
 "모션 디자이너, 3D 아티스트, 게임 개발자 — 아삼주 테즈푸르 대학교 컴퓨터공학과 학생이에요."),
("Featured", "Ausgewählt", "À la une", "注目の作品", "Destacados", "Избранное", "مختارات", "精选", "추천 작업"),
("Currently building:", "Gerade in Arbeit:", "En chantier :", "制作中：", "Ahora construyendo:", "Сейчас в работе:", "أعمل الآن على:", "正在制作：", "지금 만드는 중:"),

# ---------- order form in three steps ----------
("Steps", "Schritte", "Étapes", "ステップ", "Pasos", "Шаги", "الخطوات", "步骤", "단계"),
("Service", "Service", "Service", "サービス", "Servicio", "Услуга", "الخدمة", "服务", "서비스"),
("Details", "Details", "Détails", "詳細", "Detalles", "Детали", "التفاصيل", "详情", "세부 정보"),
("Review and send", "Prüfen und senden", "Vérifier et envoyer", "確認して送信", "Revisar y enviar", "Проверить и отправить", "راجع وأرسل", "检查并发送", "확인하고 보내기"),
("Next", "Weiter", "Suivant", "次へ", "Siguiente", "Далее", "التالي", "下一步", "다음"),
("Back", "Zurück", "Retour", "戻る", "Atrás", "Назад", "رجوع", "返回", "뒤로"),
("Budget, timing and you", "Budget, Zeitplan und du", "Budget, délai et toi", "予算・納期・あなたのこと", "Presupuesto, plazo y tú", "Бюджет, сроки и ты", "الميزانية والموعد وأنت", "预算、时间和你", "예산, 일정, 그리고 당신"),
("Check it, then send it", "Prüfen, dann senden", "Vérifie, puis envoie", "確認して、送信", "Revísalo y envíalo", "Проверь и отправь", "راجعه ثم أرسله", "检查一下，然后发送", "확인하고, 보내기"),
("Your details go only to me: on WhatsApp, in Gmail or in your account here.",
 "Deine Angaben gehen nur an mich: per WhatsApp, in Gmail oder in dein Konto hier.",
 "Tes informations ne vont qu’à moi : sur WhatsApp, dans Gmail ou dans ton compte ici.",
 "入力内容は私にだけ届きます：WhatsApp、Gmail、またはこのサイトのあなたのアカウントへ。",
 "Tus datos solo me llegan a mí: por WhatsApp, en Gmail o en tu cuenta de aquí.",
 "Твои данные получаю только я: в WhatsApp, в Gmail или в твоём аккаунте здесь.",
 "تصلني تفاصيلك أنا فقط: على واتساب أو في جيميل أو في حسابك هنا.",
 "你的信息只会发给我：通过 WhatsApp、Gmail，或保存到你在这里的账户。",
 "입력한 정보는 저에게만 가요: WhatsApp, Gmail, 또는 이 사이트의 내 계정으로."),

# ---------- work: timeline and terminal ----------
("Mission timeline", "Missions-Zeitleiste", "Chronologie des missions", "ミッション年表", "Cronología de misiones", "Хронология миссий", "الخط الزمني للمهام", "任务时间线", "미션 타임라인"),
("Now", "Jetzt", "Maintenant", "現在", "Ahora", "Сейчас", "الآن", "现在", "지금"),
("Type help, ls or open 2 — then press Enter.",
 "Tippe help, ls oder open 2 — dann Enter drücken.",
 "Tape help, ls ou open 2 — puis appuie sur Entrée.",
 "help、ls、open 2 などと入力して Enter を押してください。",
 "Escribe help, ls u open 2 — y pulsa Enter.",
 "Введи help, ls или open 2 — и нажми Enter.",
 "اكتب help أو ls أو open 2 — ثم اضغط Enter.",
 "输入 help、ls 或 open 2，然后按回车。",
 "help, ls, open 2 등을 입력하고 Enter를 누르세요."),
("Terminal command", "Terminal-Befehl", "Commande du terminal", "ターミナルのコマンド", "Comando de terminal", "Команда терминала", "أمر الطرفية", "终端命令", "터미널 명령어"),
("Commands: ls · open 1–7 · whoami · contact · clear",
 "Befehle: ls · open 1–7 · whoami · contact · clear",
 "Commandes : ls · open 1–7 · whoami · contact · clear",
 "コマンド：ls · open 1–7 · whoami · contact · clear",
 "Comandos: ls · open 1–7 · whoami · contact · clear",
 "Команды: ls · open 1–7 · whoami · contact · clear",
 "الأوامر: ls · open 1–7 · whoami · contact · clear",
 "命令：ls · open 1–7 · whoami · contact · clear",
 "명령어: ls · open 1–7 · whoami · contact · clear"),
("No mission called “{q}”. Type ls.", "Keine Mission namens „{q}“. Tippe ls.", "Aucune mission nommée « {q} ». Tape ls.", "「{q}」というミッションはありません。ls と入力してください。", "No hay ninguna misión llamada «{q}». Escribe ls.", "Миссии «{q}» нет. Введи ls.", "لا توجد مهمة باسم «{q}». اكتب ls.", "没有叫“{q}”的任务。输入 ls 看看。", "‘{q}’라는 미션은 없어요. ls를 입력해 보세요."),
("Opening {name}…", "Öffne {name} …", "Ouverture de {name}…", "{name} を開いています…", "Abriendo {name}…", "Открываю {name}…", "جارٍ فتح {name}…", "正在打开 {name}…", "{name} 여는 중…"),
("Nice try.", "Netter Versuch.", "Bien essayé.", "いい試みですね。", "Buen intento.", "Хорошая попытка.", "محاولة جيدة.", "想得美。", "좋은 시도네요."),
("Command not found: {c}. Type help.", "Befehl nicht gefunden: {c}. Tippe help.", "Commande introuvable : {c}. Tape help.", "コマンドが見つかりません：{c}。help と入力してください。", "Comando no encontrado: {c}. Escribe help.", "Команда не найдена: {c}. Введи help.", "الأمر غير موجود: {c}. اكتب help.", "找不到命令：{c}。输入 help。", "명령어를 찾을 수 없어요: {c}. help를 입력하세요."),

# ---------- settings: the Riot card now describes the refresh ----------
("Loud, slashed, gothic.", "Laut, zerschnitten, gotisch.", "Fort, tranchant, gothique.", "爆音、斬撃、ゴシック。", "Ruidoso, cortante, gótico.", "Громко, резко, готично.", "صاخب، حاد، قوطي.", "响亮、斩击、哥特。", "강렬하게, 베고, 고딕으로."),
]
