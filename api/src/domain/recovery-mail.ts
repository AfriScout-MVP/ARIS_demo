import type { Locale } from "../env";

/** Minutes a password-reset link stays valid. */
export const RESET_MINUTES = 60;

const COPY: Record<Locale, { subject: string; body: (name: string, link: string) => string }> = {
  fr: {
    subject: "ARIS — réinitialiser votre mot de passe",
    body: (name, link) =>
      `Bonjour ${name},\n\nUne réinitialisation du mot de passe de votre compte ARIS a été demandée. Ouvrez ce lien pour choisir un nouveau mot de passe (valable ${RESET_MINUTES} minutes, une seule fois) :\n\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.`,
  },
  en: {
    subject: "ARIS — reset your password",
    body: (name, link) =>
      `Hello ${name},\n\nSomeone asked to reset the password of your ARIS account. Open this link to choose a new password (valid for ${RESET_MINUTES} minutes, once):\n\n${link}\n\nIf you did not ask for this, ignore this message: your current password still works.`,
  },
  es: {
    subject: "ARIS — restablecer su contraseña",
    body: (name, link) =>
      `Hola ${name}:\n\nSe ha solicitado restablecer la contraseña de su cuenta ARIS. Abra este enlace para elegir una nueva contraseña (válido ${RESET_MINUTES} minutos, una sola vez):\n\n${link}\n\nSi no ha hecho esta solicitud, ignore este mensaje: su contraseña actual sigue siendo válida.`,
  },
  de: {
    subject: "ARIS — Passwort zurücksetzen",
    body: (name, link) =>
      `Hallo ${name},\n\nfür Ihr ARIS-Konto wurde das Zurücksetzen des Passworts angefordert. Öffnen Sie diesen Link, um ein neues Passwort zu wählen (${RESET_MINUTES} Minuten gültig, nur einmal):\n\n${link}\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese Nachricht: Ihr bisheriges Passwort bleibt gültig.`,
  },
};

/** The reset e-mail in the account's language. */
export function resetMail(locale: Locale, name: string, link: string) {
  const copy = COPY[locale] ?? COPY.fr;
  return { subject: copy.subject, body: copy.body(name, link) };
}

/** Where the site's reset screen lives, from the configured public origin (or the request's own). */
export function resetLink(origin: string, token: string) {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
