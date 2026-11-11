# Admin page strings (v3.7) — one row per English key, all eight languages together:
# (English, Deutsch, Français, 日本語, Español, Русский, العربية, 中文, 한국어)
# {n} and {t} are filled in by main.js. "CSV" and "Google" stay as they are.

P = [
# ---------- heading ----------
("Chapter ✦ — Admin", "Kapitel ✦ — Verwaltung", "Chapitre ✦ — Administration", "✦ — 管理", "Capítulo ✦ — Administración", "Глава ✦ — Управление", "✦ — الإدارة", "✦ — 管理", "✦ — 관리"),
("html:The <em>back office.</em>", "Das <em>Backoffice.</em>", "L’<em>arrière-boutique.</em>", "<em>バックオフィス。</em>", "La <em>trastienda.</em>", "<em>Закулисье.</em>", "<em>المكتب الخلفي.</em>", "<em>后台。</em>", "<em>백오피스.</em>"),
("Only you can see this page: everyone who signed up, every order and every payment.",
 "Nur du siehst diese Seite: alle Anmeldungen, alle Bestellungen und alle Zahlungen.",
 "Toi seul vois cette page : chaque inscription, chaque commande et chaque paiement.",
 "このページはあなただけが見られます。登録したすべての人、すべての注文、すべての支払い。",
 "Solo tú ves esta página: cada registro, cada pedido y cada pago.",
 "Эту страницу видишь только ты: все регистрации, все заказы и все платежи.",
 "هذه الصفحة لك وحدك: كل من سجّل، وكل طلب، وكل دفعة.",
 "只有你能看到这个页面：所有注册用户、所有订单和所有付款。",
 "이 페이지는 당신만 볼 수 있어요. 가입한 모든 사람, 모든 주문, 모든 결제."),
("Admin", "Verwaltung", "Administration", "管理", "Administración", "Управление", "الإدارة", "管理", "관리"),

# ---------- access ----------
("Sign in first.", "Melde dich zuerst an.", "Connecte-toi d’abord.", "先にログインしてください。", "Entra primero.", "Сначала войди.", "سجّل الدخول أولًا.", "请先登录。", "먼저 로그인하세요."),
("This page is only for the site owner.", "Diese Seite ist nur für den Inhaber der Website.", "Cette page est réservée au propriétaire du site.", "このページはサイトのオーナー専用です。", "Esta página es solo para el dueño del sitio.", "Эта страница только для владельца сайта.", "هذه الصفحة لمالك الموقع فقط.", "此页面仅供网站所有者使用。", "이 페이지는 사이트 소유자 전용이에요."),

# ---------- tabs, search, export ----------
("Users", "Nutzer", "Utilisateurs", "ユーザー", "Usuarios", "Пользователи", "المستخدمون", "用户", "사용자"),
("Orders", "Bestellungen", "Commandes", "注文", "Pedidos", "Заказы", "الطلبات", "订单", "주문"),
("Payments", "Zahlungen", "Paiements", "支払い", "Pagos", "Платежи", "المدفوعات", "付款", "결제"),
("Search", "Suchen", "Rechercher", "検索", "Buscar", "Поиск", "بحث", "搜索", "검색"),
("Download CSV", "CSV herunterladen", "Télécharger le CSV", "CSVをダウンロード", "Descargar CSV", "Скачать CSV", "تنزيل CSV", "下载 CSV", "CSV 다운로드"),
("Showing {n} of {t}", "{n} von {t} angezeigt", "{n} sur {t} affichés", "{t} 件中 {n} 件を表示", "Mostrando {n} de {t}", "Показано {n} из {t}", "عرض {n} من {t}", "显示 {t} 条中的 {n} 条", "{t}개 중 {n}개 표시"),
("Nothing here yet.", "Hier ist noch nichts.", "Rien pour l’instant.", "まだ何もありません。", "Aún no hay nada.", "Пока пусто.", "لا شيء هنا بعد.", "这里还什么都没有。", "아직 아무것도 없어요."),
("Nothing matches that search.", "Nichts passt zu dieser Suche.", "Aucun résultat pour cette recherche.", "検索に一致するものはありません。", "Nada coincide con esa búsqueda.", "По этому запросу ничего не найдено.", "لا توجد نتائج مطابقة.", "没有匹配的结果。", "검색 결과가 없어요."),
("Couldn’t load this list.", "Diese Liste konnte nicht geladen werden.", "Impossible de charger cette liste.", "このリストを読み込めませんでした。", "No se pudo cargar esta lista.", "Не удалось загрузить список.", "تعذّر تحميل هذه القائمة.", "无法加载此列表。", "이 목록을 불러오지 못했어요."),

# ---------- column headings ----------
("Name", "Name", "Nom", "名前", "Nombre", "Имя", "الاسم", "姓名", "이름"),
("Signed in with", "Angemeldet mit", "Connexion via", "ログイン方法", "Acceso con", "Способ входа", "طريقة الدخول", "登录方式", "로그인 방법"),
("Signed up", "Registriert", "Inscription", "登録日", "Registro", "Регистрация", "تاريخ التسجيل", "注册时间", "가입일"),
("Last login", "Letzte Anmeldung", "Dernière connexion", "最終ログイン", "Último acceso", "Последний вход", "آخر دخول", "最近登录", "마지막 로그인"),
("Order no.", "Bestell-Nr.", "N° de commande", "注文番号", "N.º de pedido", "№ заказа", "رقم الطلب", "订单号", "주문 번호"),
("Title", "Titel", "Titre", "タイトル", "Título", "Название", "العنوان", "标题", "제목"),
("Customer", "Kunde", "Client", "お客様", "Cliente", "Клиент", "العميل", "客户", "고객"),
("Amount", "Betrag", "Montant", "金額", "Importe", "Сумма", "المبلغ", "金额", "금액"),
("Created", "Erstellt", "Créée", "作成日", "Creado", "Создан", "تاريخ الإنشاء", "创建时间", "생성일"),
("UPI reference", "UPI-Referenz", "Référence UPI", "UPI参照番号", "Referencia UPI", "Номер UPI", "مرجع UPI", "UPI 参考号", "UPI 참조 번호"),
("Confirmed on", "Bestätigt am", "Confirmé le", "確認日", "Confirmado el", "Подтверждён", "تاريخ التأكيد", "确认时间", "확인일"),
("Email code", "E-Mail-Code", "Code par e-mail", "メールコード", "Código por correo", "Код по почте", "رمز البريد", "邮箱验证码", "이메일 코드"),

# ---------- account and payment states ----------
("Active", "Aktiv", "Actif", "有効", "Activo", "Активен", "نشط", "正常", "활성"),
("Blocked", "Gesperrt", "Bloqué", "停止中", "Bloqueado", "Заблокирован", "محظور", "已停用", "차단됨"),
("Deleted", "Gelöscht", "Supprimé", "削除済み", "Eliminado", "Удалён", "محذوف", "已删除", "삭제됨"),
("Started", "Begonnen", "Commencé", "開始", "Iniciado", "Начат", "بدأ", "已发起", "시작됨"),
("Waiting for check", "Wartet auf Prüfung", "En attente de vérification", "確認待ち", "Pendiente de revisión", "Ждёт проверки", "بانتظار التحقق", "待核对", "확인 대기"),
("Confirmed", "Bestätigt", "Confirmé", "確認済み", "Confirmado", "Подтверждён", "مؤكَّد", "已确认", "확인됨"),
("Rejected", "Abgelehnt", "Refusé", "却下", "Rechazado", "Отклонён", "مرفوض", "已拒绝", "거절됨"),
("Failed", "Fehlgeschlagen", "Échoué", "失敗", "Fallido", "Не прошёл", "فشل", "失败", "실패"),
]
