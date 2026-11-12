/* Order emails to customers, in the nine site languages:
   received  a request arrived (the owner will set the price)
   pay       an amount is due now (a fixed-price order, a price the owner set, or the next part)
   accepted  the owner accepted a free order
   Each email links to the order on the account page. Never throws: a failed email must not undo an order. */
import { sendMailResult } from "./mail.js";

const T = {
  en: { recS: "Request {ref} received", recH: "I got your request", recB: "I’ll read your brief and email you the price.", free: "Your first thumbnail is free.",
        payS: "Order {ref}: {amount} to pay", payH: "Ready to pay", payB: "Amount due now: {amount}", part: "This is part {n} of {t}.",
        okS: "Order {ref} accepted", okH: "Your order is accepted", okB: "There’s nothing to pay. I’ve started work on it.", see: "See your order", pay: "View and pay" },
  de: { recS: "Anfrage {ref} erhalten", recH: "Deine Anfrage ist da", recB: "Ich lese dein Briefing und schicke dir den Preis per E-Mail.", free: "Dein erstes Thumbnail ist kostenlos.",
        payS: "Bestellung {ref}: {amount} zu zahlen", payH: "Bereit zum Bezahlen", payB: "Jetzt fällig: {amount}", part: "Das ist Teil {n} von {t}.",
        okS: "Bestellung {ref} angenommen", okH: "Deine Bestellung ist angenommen", okB: "Du musst nichts bezahlen. Ich habe schon angefangen.", see: "Bestellung ansehen", pay: "Ansehen und bezahlen" },
  fr: { recS: "Demande {ref} reçue", recH: "J’ai bien reçu ta demande", recB: "Je lis ton brief et je t’envoie le prix par e-mail.", free: "Ta première miniature est gratuite.",
        payS: "Commande {ref} : {amount} à payer", payH: "Prêt à payer", payB: "À payer maintenant : {amount}", part: "C’est la partie {n} sur {t}.",
        okS: "Commande {ref} acceptée", okH: "Ta commande est acceptée", okB: "Tu n’as rien à payer. J’ai commencé le travail.", see: "Voir ta commande", pay: "Voir et payer" },
  ja: { recS: "リクエスト {ref} を受け付けました", recH: "リクエストを受け取りました", recB: "内容を読んで、料金をメールでお知らせします。", free: "最初のサムネイルは無料です。",
        payS: "注文 {ref}：お支払い {amount}", payH: "お支払いの準備ができました", payB: "今回のお支払い額：{amount}", part: "全{t}回のうち{n}回目のお支払いです。",
        okS: "注文 {ref} を承りました", okH: "ご注文を承りました", okB: "お支払いは不要です。制作を始めました。", see: "注文を見る", pay: "確認して支払う" },
  es: { recS: "Solicitud {ref} recibida", recH: "Recibí tu solicitud", recB: "Leeré tu brief y te enviaré el precio por correo.", free: "Tu primera miniatura es gratis.",
        payS: "Pedido {ref}: {amount} por pagar", payH: "Listo para pagar", payB: "A pagar ahora: {amount}", part: "Es la parte {n} de {t}.",
        okS: "Pedido {ref} aceptado", okH: "Tu pedido está aceptado", okB: "No tienes nada que pagar. Ya empecé a trabajar en él.", see: "Ver tu pedido", pay: "Ver y pagar" },
  ru: { recS: "Запрос {ref} получен", recH: "Я получил твой запрос", recB: "Я прочитаю бриф и пришлю цену на почту.", free: "Первая обложка — бесплатно.",
        payS: "Заказ {ref}: к оплате {amount}", payH: "Можно оплатить", payB: "К оплате сейчас: {amount}", part: "Это часть {n} из {t}.",
        okS: "Заказ {ref} принят", okH: "Твой заказ принят", okB: "Платить ничего не нужно. Я уже начал работу.", see: "Посмотреть заказ", pay: "Посмотреть и оплатить" },
  ar: { recS: "تم استلام الطلب {ref}", recH: "وصلني طلبك", recB: "سأقرأ الموجز وأرسل لك السعر بالبريد.", free: "صورتك المصغرة الأولى مجانية.",
        payS: "الطلب {ref}: المبلغ المستحق {amount}", payH: "جاهز للدفع", payB: "المستحق الآن: {amount}", part: "هذه الدفعة {n} من {t}.",
        okS: "تم قبول الطلب {ref}", okH: "تم قبول طلبك", okB: "لا يوجد ما تدفعه. بدأتُ العمل عليه.", see: "عرض طلبك", pay: "العرض والدفع" },
  zh: { recS: "已收到需求 {ref}", recH: "我收到你的需求了", recB: "我会看完你的需求，然后通过邮件告诉你价格。", free: "你的第一张缩略图免费。",
        payS: "订单 {ref}：待付 {amount}", payH: "可以付款了", payB: "本次应付：{amount}", part: "这是第 {n} 笔，共 {t} 笔。",
        okS: "订单 {ref} 已接受", okH: "你的订单已接受", okB: "无需付款。我已经开始制作了。", see: "查看订单", pay: "查看并付款" },
  ko: { recS: "요청 {ref} 접수 완료", recH: "요청을 받았어요", recB: "브리프를 읽고 가격을 메일로 보내드릴게요.", free: "첫 번째 썸네일은 무료예요.",
        payS: "주문 {ref}: 결제 금액 {amount}", payH: "결제 준비 완료", payB: "지금 결제할 금액: {amount}", part: "총 {t}회 중 {n}회차 결제예요.",
        okS: "주문 {ref} 수락", okH: "주문이 수락되었어요", okB: "결제할 금액이 없어요. 작업을 시작했어요.", see: "주문 보기", pay: "확인하고 결제하기" },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));

export function money(lang, minor, currency = "INR") {
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-IN" : lang, { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
  } catch (e) {
    return currency + " " + (minor / 100);
  }
}

/* One plain card, the same look as the sign-in code email. */
function card(lang, { heading, lines, title, ref, button, href }) {
  const rtl = lang === "ar", align = rtl ? "right" : "left";
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#0b0b0d">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e3ded2;padding:28px;text-align:${align}">
<p style="margin:0 0 18px;font-size:13px;letter-spacing:1px;color:#6b665c" dir="ltr">THE AAMIR SHEIKH</p>
<p style="margin:0 0 6px;font-size:20px;font-weight:bold">${esc(heading)}</p>
${ref ? `<p style="margin:0 0 18px;font-size:13px;color:#6b665c"><span dir="ltr">${esc(ref)}</span> · <span dir="ltr">${esc(title)}</span></p>` : '<p style="margin:0 0 12px"></p>'}
${lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join("")}
<p style="margin:22px 0 0"><a href="${esc(href)}" style="display:inline-block;background:#0b0b0d;color:#ffffff;text-decoration:none;padding:12px 20px;font-size:15px;font-weight:bold">${esc(button)}</a></p>
</div></body></html>`;
  const text = `${heading}\n${ref ? `${ref} · ${title}\n` : ""}\n${lines.join("\n")}\n\n${button}: ${href}\n\nTHE AAMIR SHEIKH`;
  return { html, text };
}

const orderLink = (origin, ref) => `${origin}/account.html?order=${encodeURIComponent(ref)}`;

export function receivedMail(lang, { ref, title, free, origin }) {
  const t = T[lang] || T.en;
  const lines = [t.recB];
  if (free) lines.unshift(t.free);
  return { subject: fill(t.recS, { ref }) + " — THE AAMIR SHEIKH", ...card(lang, { heading: t.recH, lines, title, ref, button: t.see, href: orderLink(origin, ref) }) };
}

export function payMail(lang, { ref, title, amountMinor, currency, n, total, origin }) {
  const t = T[lang] || T.en, amount = money(lang, amountMinor, currency);
  const lines = [fill(t.payB, { amount })];
  if (total > 1) lines.push(fill(t.part, { n, t: total }));
  return { subject: fill(t.payS, { ref, amount }) + " — THE AAMIR SHEIKH", ...card(lang, { heading: t.payH, lines, title, ref, button: t.pay, href: orderLink(origin, ref) }) };
}

export function acceptedMail(lang, { ref, title, origin }) {
  const t = T[lang] || T.en;
  return { subject: fill(t.okS, { ref }) + " — THE AAMIR SHEIKH", ...card(lang, { heading: t.okH, lines: [t.okB], title, ref, button: t.see, href: orderLink(origin, ref) }) };
}

/* Payment emails (v3.9): the owner confirmed a payment, or could not find it. */
const P = {
  en: { gotS: "Payment received for {ref}", gotH: "Payment received", gotB: "I received {amount}. Thank you!", gotAll: "Your order is fully paid.", gotMore: "The next part is due later. You’ll get an email when it is.",
        noS: "Please check your payment for {ref}", noH: "I couldn’t find this payment", noB: "I couldn’t match the UPI reference {utr} to a payment of {amount}.", noB2: "Please check the number and enter it again, or pay again from your order page." },
  de: { gotS: "Zahlung für {ref} erhalten", gotH: "Zahlung erhalten", gotB: "Ich habe {amount} erhalten. Danke!", gotAll: "Deine Bestellung ist vollständig bezahlt.", gotMore: "Der nächste Teil ist später fällig. Du bekommst dann eine E-Mail.",
        noS: "Bitte prüfe deine Zahlung für {ref}", noH: "Ich konnte diese Zahlung nicht finden", noB: "Ich konnte die UPI-Referenz {utr} keiner Zahlung über {amount} zuordnen.", noB2: "Bitte prüfe die Nummer und gib sie erneut ein, oder zahle noch einmal über deine Bestellseite." },
  fr: { gotS: "Paiement reçu pour {ref}", gotH: "Paiement reçu", gotB: "J’ai bien reçu {amount}. Merci !", gotAll: "Ta commande est entièrement payée.", gotMore: "La partie suivante sera à payer plus tard. Tu recevras un e-mail à ce moment-là.",
        noS: "Vérifie ton paiement pour {ref}", noH: "Je n’ai pas trouvé ce paiement", noB: "Je n’ai trouvé aucun paiement de {amount} avec la référence UPI {utr}.", noB2: "Vérifie le numéro et saisis-le de nouveau, ou paie à nouveau depuis la page de ta commande." },
  ja: { gotS: "{ref} のお支払いを確認しました", gotH: "お支払いを確認しました", gotB: "{amount} を受け取りました。ありがとうございます！", gotAll: "ご注文のお支払いはすべて完了しました。", gotMore: "次回のお支払いは後日です。その時にメールでお知らせします。",
        noS: "{ref} のお支払いをご確認ください", noH: "このお支払いが見つかりませんでした", noB: "UPI参照番号 {utr} で {amount} のお支払いが見つかりませんでした。", noB2: "番号を確認してもう一度入力するか、注文ページからもう一度お支払いください。" },
  es: { gotS: "Pago recibido para {ref}", gotH: "Pago recibido", gotB: "Recibí {amount}. ¡Gracias!", gotAll: "Tu pedido está pagado por completo.", gotMore: "La siguiente parte se paga más adelante. Te llegará un correo cuando toque.",
        noS: "Revisa tu pago de {ref}", noH: "No encontré este pago", noB: "No encontré ningún pago de {amount} con la referencia UPI {utr}.", noB2: "Revisa el número y escríbelo de nuevo, o vuelve a pagar desde la página de tu pedido." },
  ru: { gotS: "Оплата по {ref} получена", gotH: "Оплата получена", gotB: "Я получил {amount}. Спасибо!", gotAll: "Заказ оплачен полностью.", gotMore: "Следующую часть нужно будет оплатить позже. Я пришлю письмо, когда придёт время.",
        noS: "Проверь оплату по {ref}", noH: "Я не нашёл этот платёж", noB: "Я не нашёл платёж на {amount} с номером UPI {utr}.", noB2: "Проверь номер и введи его снова или оплати ещё раз со страницы заказа." },
  ar: { gotS: "تم استلام الدفع للطلب {ref}", gotH: "تم استلام الدفع", gotB: "استلمتُ {amount}. شكرًا لك!", gotAll: "تم دفع طلبك بالكامل.", gotMore: "الجزء التالي مستحق لاحقًا. ستصلك رسالة عندما يحين موعده.",
        noS: "يُرجى التحقق من دفعتك للطلب {ref}", noH: "لم أجد هذه الدفعة", noB: "لم أجد دفعة بقيمة {amount} بمرجع UPI ‏{utr}.", noB2: "يُرجى التحقق من الرقم وإدخاله مرة أخرى، أو الدفع مجددًا من صفحة طلبك." },
  zh: { gotS: "已收到 {ref} 的付款", gotH: "已收到付款", gotB: "我已收到 {amount}，谢谢！", gotAll: "你的订单已全部付清。", gotMore: "下一笔稍后再付，到时我会发邮件通知你。",
        noS: "请检查 {ref} 的付款", noH: "我没有找到这笔付款", noB: "我没有找到 UPI 参考号为 {utr}、金额为 {amount} 的付款。", noB2: "请核对号码后重新输入，或在订单页面重新付款。" },
  ko: { gotS: "{ref} 결제 확인", gotH: "결제를 확인했어요", gotB: "{amount}을(를) 받았어요. 감사해요!", gotAll: "주문 금액이 모두 결제되었어요.", gotMore: "다음 회차는 나중에 결제하면 돼요. 그때 메일을 보내드릴게요.",
        noS: "{ref} 결제를 확인해 주세요", noH: "이 결제를 찾지 못했어요", noB: "UPI 참조 번호 {utr}로 {amount} 결제를 찾지 못했어요.", noB2: "번호를 확인해 다시 입력하거나, 주문 페이지에서 다시 결제해 주세요." },
};

export function paidMail(lang, { ref, title, amountMinor, currency, allPaid, origin }) {
  const t = P[lang] || P.en, s = T[lang] || T.en, amount = money(lang, amountMinor, currency);
  return { subject: fill(t.gotS, { ref }) + " — THE AAMIR SHEIKH", ...card(lang, { heading: t.gotH, lines: [fill(t.gotB, { amount }), allPaid ? t.gotAll : t.gotMore], title, ref, button: s.see, href: orderLink(origin, ref) }) };
}

export function rejectedMail(lang, { ref, title, utr, amountMinor, currency, origin }) {
  const t = P[lang] || P.en, s = T[lang] || T.en, amount = money(lang, amountMinor, currency);
  return { subject: fill(t.noS, { ref }) + " — THE AAMIR SHEIKH", ...card(lang, { heading: t.noH, lines: [fill(t.noB, { utr, amount }), t.noB2], title, ref, button: s.see, href: orderLink(origin, ref) }) };
}

/* The account was deleted (step 6). Sent just before the details are wiped. */
const D = {
  en: ["Your data has been deleted", "As you asked, I deleted your account and your personal details.", "For my accounts I keep only the order numbers, amounts, dates and UPI references of past orders, without your name or email.", "Visit the site"],
  de: ["Deine Daten wurden gelöscht", "Wie gewünscht habe ich dein Konto und deine persönlichen Daten gelöscht.", "Für meine Buchhaltung behalte ich nur Bestellnummern, Beträge, Daten und UPI-Referenzen früherer Bestellungen, ohne deinen Namen und deine E-Mail-Adresse.", "Zur Website"],
  fr: ["Tes données ont été supprimées", "Comme demandé, j’ai supprimé ton compte et tes données personnelles.", "Pour ma comptabilité, je garde seulement les numéros de commande, montants, dates et références UPI des commandes passées, sans ton nom ni ton e-mail.", "Aller sur le site"],
  ja: ["あなたのデータを削除しました", "ご依頼のとおり、アカウントと個人情報を削除しました。", "帳簿のため、過去の注文番号・金額・日付・UPI参照番号だけを、お名前やメールアドレスなしで保管します。", "サイトを見る"],
  es: ["Tus datos se han eliminado", "Como pediste, eliminé tu cuenta y tus datos personales.", "Para mi contabilidad conservo solo los números de pedido, importes, fechas y referencias UPI de pedidos anteriores, sin tu nombre ni tu correo.", "Ir al sitio"],
  ru: ["Твои данные удалены", "По твоей просьбе я удалил твой аккаунт и личные данные.", "Для учёта я храню только номера заказов, суммы, даты и номера UPI прошлых заказов — без имени и почты.", "Перейти на сайт"],
  ar: ["تم حذف بياناتك", "كما طلبت، حذفتُ حسابك وبياناتك الشخصية.", "لأغراض حساباتي أحتفظ فقط بأرقام الطلبات والمبالغ والتواريخ ومراجع UPI للطلبات السابقة، دون اسمك أو بريدك.", "زيارة الموقع"],
  zh: ["你的数据已删除", "按照你的要求，我已删除你的账户和个人信息。", "为了记账，我只保留过往订单的订单号、金额、日期和 UPI 参考号，不含你的姓名和邮箱。", "访问网站"],
  ko: ["데이터가 삭제되었어요", "요청하신 대로 계정과 개인 정보를 삭제했어요.", "장부를 위해 지난 주문의 주문 번호, 금액, 날짜, UPI 참조 번호만 이름과 이메일 없이 보관해요.", "사이트 방문"],
};

export function deletedMail(lang, { origin, hadOrders }) {
  const [h, b1, b2, visit] = D[lang] || D.en;
  return { subject: h + " — THE AAMIR SHEIKH", ...card(lang, { heading: h, lines: hadOrders ? [b1, b2] : [b1], title: "", ref: "", button: visit, href: origin + "/" }) };
}

/* Sends one customer email. Returns { ok, status, error }; never throws. */
export async function mailCustomer(env, to, mail) {
  if (!env.EMAIL_API_KEY || !env.MAIL_FROM) return { ok: false, status: 0, error: "email settings missing" };
  if (!to || !mail) return { ok: false, status: 0, error: "nothing to send" };
  try { return await sendMailResult(env, { to, subject: mail.subject, text: mail.text, html: mail.html }); }
  catch (e) { console.error("customer email failed", e && e.stack); return { ok: false, status: 0, error: "could not send" }; }
}

/* Builds an email without ever throwing: a problem in an email must not undo an order. */
export function safeMail(build) {
  try { return build(); } catch (e) { console.error("could not build an order email", e && e.stack); return null; }
}
