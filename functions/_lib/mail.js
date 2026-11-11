/* Outgoing email. One small function talks to the email service (Resend), so changing
   service later means changing only sendMail(). The API key lives in Cloudflare as EMAIL_API_KEY. */

export async function sendMail(env, { to, subject, text, html }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.EMAIL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
    });
    if (res.ok) return true;
    console.error("email service said", res.status, (await res.text()).slice(0, 300));
  } catch (err) {
    console.error("email service unreachable", err && err.message);
  }
  return false;
}

/* A short plain note to the site owner (new sign-up, new order). Goes to NOTIFY_EMAIL, or the
   address already printed on the site. `link` opens the admin page on the site that sent the notice
   (the preview or the live domain). Never throws: a notice that fails must not break a sign-in or an order. */
const OWNER_DEFAULT = "ak4418561@gmail.com";
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function notifyOwner(env, subject, lines, link = "https://theaamirsheikh.com/admin.html") {
  if (!env.EMAIL_API_KEY || !env.MAIL_FROM) return false;
  const text = lines.join("\n") + "\n\nAdmin page: " + link;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0b0b0d">${lines.map((l) => `<div style="white-space:pre-wrap">${escHtml(l) || "&nbsp;"}</div>`).join("")}<p style="margin-top:16px"><a href="${escHtml(link)}">Open the admin page</a></p></div>`;
  return sendMail(env, { to: env.NOTIFY_EMAIL || OWNER_DEFAULT, subject: subject + " — THE AAMIR SHEIKH", text, html });
}

export function signupNotice(env, user, method, meta) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  return notifyOwner(env, "New sign-up: " + user.email, [
    "Someone just made an account.", "",
    "Email: " + user.email,
    "Name: " + (user.name || "(not given)"),
    "Signed in with: " + (method === "google" ? "Google" : "an email code"),
    "Country: " + (meta.country || "unknown"),
    "Time: " + when + " IST",
  ]);
}

/* The sign-in code email, in the nine site languages: subject, heading, how to use it, what to do if unexpected. */
const CODE_TEXT = {
  en: ["{code} is your sign-in code for THE AAMIR SHEIKH", "Your sign-in code", "Enter this code on the sign-in page. It works for 10 minutes and only once.", "If you didn’t ask for this, you can ignore this email."],
  de: ["{code} ist dein Anmeldecode für THE AAMIR SHEIKH", "Dein Anmeldecode", "Gib diesen Code auf der Anmeldeseite ein. Er gilt 10 Minuten und nur einmal.", "Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren."],
  fr: ["{code} est ton code de connexion pour THE AAMIR SHEIKH", "Ton code de connexion", "Saisis ce code sur la page de connexion. Il est valable 10 minutes et une seule fois.", "Si tu n’as rien demandé, tu peux ignorer cet e-mail."],
  ja: ["{code} が THE AAMIR SHEIKH のログインコードです", "ログインコード", "このコードをログインページに入力してください。有効期限は10分、使えるのは1回だけです。", "心当たりがない場合は、このメールを無視してください。"],
  es: ["{code} es tu código de acceso para THE AAMIR SHEIKH", "Tu código de acceso", "Escribe este código en la página de acceso. Vale 10 minutos y solo una vez.", "Si no lo pediste, puedes ignorar este correo."],
  ru: ["{code} — твой код для входа на THE AAMIR SHEIKH", "Твой код для входа", "Введи этот код на странице входа. Он действует 10 минут и только один раз.", "Если ты не запрашивал код, просто не обращай внимания на это письмо."],
  ar: ["{code} هو رمز الدخول إلى THE AAMIR SHEIKH", "رمز الدخول", "أدخل هذا الرمز في صفحة تسجيل الدخول. صالح لمدة 10 دقائق ولمرة واحدة فقط.", "إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة."],
  zh: ["{code} 是你在 THE AAMIR SHEIKH 的登录验证码", "你的登录验证码", "请在登录页面输入此验证码。10 分钟内有效，且只能使用一次。", "如果不是你本人操作，请忽略这封邮件。"],
  ko: ["{code} — THE AAMIR SHEIKH 로그인 코드", "로그인 코드", "로그인 페이지에 이 코드를 입력하세요. 10분 동안 한 번만 사용할 수 있습니다.", "요청한 적이 없다면 이 메일은 무시하세요."],
};

export function codeMail(lang, code) {
  const [subject, heading, how, ignore] = CODE_TEXT[lang] || CODE_TEXT.en;
  const rtl = lang === "ar";
  const text = `${heading}: ${code}\n\n${how}\n${ignore}\n\nTHE AAMIR SHEIKH\nhttps://theaamirsheikh.com`;
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#0b0b0d">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e3ded2;padding:28px;text-align:${rtl ? "right" : "left"}">
<p style="margin:0 0 18px;font-size:13px;letter-spacing:1px;color:#6b665c" dir="ltr">THE AAMIR SHEIKH</p>
<p style="margin:0 0 10px;font-size:16px">${heading}</p>
<p style="margin:0 0 18px;font-size:34px;font-weight:bold;letter-spacing:6px" dir="ltr">${code}</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${how}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#6b665c">${ignore}</p>
</div></body></html>`;
  return { subject: subject.replace("{code}", code), text, html };
}
