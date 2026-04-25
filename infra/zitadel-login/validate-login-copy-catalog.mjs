import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const fixtures = {
  de: {
    common: { title: "Anmelden mit Zitadel" },
    register: { description: "Create your ZITADEL account." },
    loginname: {
      title: "Willkommen zurück!",
      errors: {
        couldNotRegisterUser: "Benutzer konnte nicht registriert werden",
        couldNotResetPassword: "Passwort konnte nicht zurückgesetzt werden",
        couldNotVerifyEmail: "E-Mail konnte nicht verifiziert werden",
        couldNotVerifyInvite: "Einladung konnte nicht verifiziert werden",
        failedToAuthenticate: "Anmeldung fehlgeschlagen",
        lockoutMessage: "Zu viele Fehlversuche",
        multipleUsersFound: "Mehrere Benutzer gefunden",
        userNotActive: "Benutzer ist nicht aktiv",
        verificationRequired: "Die Benutzerverifizierung muss durchgeführt werden",
      },
    },
  },
  en: {
    common: { title: "Login with Zitadel", back: "Back", continue: "Continue" },
    register: {
      title: "Register",
      description: "Create your ZITADEL account.",
      selectMethod: "Select the method you would like to authenticate",
      labels: {
        firstname: "First name",
        lastname: "Last name",
        email: "E-mail",
      },
    },
    loginname: {
      title: "Welcome back!",
      description: "Enter your login data.",
      loginNamePlaceholder: "Loginname",
      registerButton: "Register new user",
      errors: {
        couldNotRegisterUser: "Could not register user",
        couldNotResetPassword: "Could not reset password",
        couldNotVerifyEmail: "Could not verify email",
        couldNotVerifyInvite: "Could not verify invitation",
        failedToAuthenticate: "Failed to authenticate",
        lockoutMessage: "Too many failed attempts",
        multipleUsersFound: "Multiple users found",
        userNotActive: "User is not active",
        verificationRequired: "User Verification Check has to be done",
      },
    },
    password: {
      verify: {
        title: "Password",
        resetPassword: "Reset Password",
      },
      set: {
        title: "Set Password",
        labels: {
          newPassword: "New Password",
          confirmPassword: "Confirm Password",
        },
      },
    },
    device: {
      request: {
        submit: "Allow",
        deny: "Deny",
      },
    },
  },
  es: {
    common: { title: "Iniciar sesión con Zitadel" },
    register: { description: "Create your ZITADEL account." },
    loginname: {
      title: "¡Bienvenido de nuevo!",
      errors: {
        couldNotRegisterUser: "No se pudo registrar el usuario",
        couldNotResetPassword: "No se pudo restablecer la contraseña",
        couldNotVerifyEmail: "No se pudo verificar el correo electrónico",
        couldNotVerifyInvite: "No se pudo verificar la invitación",
        failedToAuthenticate: "No se pudo autenticar",
        lockoutMessage: "Demasiados intentos fallidos",
        multipleUsersFound: "Se encontraron varios usuarios",
        userNotActive: "El usuario no está activo",
        verificationRequired: "Se debe realizar la verificación de usuario",
      },
    },
  },
  fr: {
    common: { title: "Connexion avec Zitadel" },
    register: { description: "Create your ZITADEL account." },
    loginname: {
      title: "Bienvenue!",
      errors: {
        couldNotRegisterUser: "Impossible d enregistrer l utilisateur",
        couldNotResetPassword: "Impossible de réinitialiser le mot de passe",
        couldNotVerifyEmail: "Impossible de vérifier l email",
        couldNotVerifyInvite: "Impossible de vérifier l invitation",
        failedToAuthenticate: "Impossible de s authentifier",
        lockoutMessage: "Trop de tentatives échouées",
        multipleUsersFound: "Plusieurs utilisateurs trouvés",
        userNotActive: "L utilisateur n est pas actif",
        verificationRequired: "Une vérification utilisateur doit être effectuée",
      },
    },
  },
  id: {
    common: { title: "Masuk dengan Zitadel" },
    register: { description: "Create your ZITADEL account." },
    loginname: {
      title: "Selamat datang kembali!",
      errors: {
        couldNotRegisterUser: "Tidak dapat mendaftarkan pengguna",
        couldNotResetPassword: "Tidak dapat mengatur ulang kata sandi",
        couldNotVerifyEmail: "Tidak dapat memverifikasi email",
        couldNotVerifyInvite: "Tidak dapat memverifikasi undangan",
        failedToAuthenticate: "Gagal mengautentikasi",
        lockoutMessage: "Terlalu banyak percobaan gagal",
        multipleUsersFound: "Banyak pengguna ditemukan",
        userNotActive: "Pengguna tidak aktif",
        verificationRequired: "Pemeriksaan verifikasi pengguna harus dilakukan",
      },
    },
  },
  ru: {
    common: { title: "Войти с Zitadel" },
    register: { description: "Create your ZITADEL account." },
    loginname: {
      title: "С возвращением!",
      errors: {
        couldNotRegisterUser: "Не удалось зарегистрировать пользователя",
        couldNotResetPassword: "Не удалось сбросить пароль",
        couldNotVerifyEmail: "Не удалось подтвердить электронную почту",
        couldNotVerifyInvite: "Не удалось подтвердить приглашение",
        failedToAuthenticate: "Не удалось выполнить аутентификацию",
        lockoutMessage: "Слишком много неудачных попыток",
        multipleUsersFound: "Найдено несколько пользователей",
        userNotActive: "Пользователь не активен",
        verificationRequired: "Необходимо выполнить проверку пользователя",
      },
    },
  },
};

const expected = {
  de: {
    commonTitle: "Anmelden mit Dev-SSO",
    registerDescription: "Create your Dev-SSO account.",
    couldNotRegisterUser:
      "Wir konnten die Registrierung nicht abschließen. Mit diesen Angaben besteht möglicherweise bereits ein Konto. Melden Sie sich an oder setzen Sie Ihr Passwort zurück.",
    couldNotResetPassword:
      "Wir konnten das Zurücksetzen des Passworts nicht starten. Bitte versuchen Sie es erneut.",
    couldNotVerifyEmail:
      "Wir konnten diese E-Mail-Adresse nicht bestätigen. Bitte versuchen Sie es erneut.",
    couldNotVerifyInvite:
      "Wir konnten diese Einladung nicht bestätigen. Bitte versuchen Sie es erneut.",
    failedToAuthenticate:
      "Wir konnten Ihre Anmeldedaten nicht bestätigen. Bitte versuchen Sie es erneut.",
    lockoutMessage:
      "Es wurden zu viele Versuche erkannt. Bitte warten Sie einen Moment, bevor Sie es erneut versuchen.",
    multipleUsersFound:
      "Wir haben mehr als ein Konto mit diesen Angaben gefunden. Verwenden Sie eine eindeutigere Anmeldekennung.",
    userNotActive:
      "Dieses Konto ist nicht aktiv. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    verificationRequired:
      "Eine zusätzliche Bestätigung ist erforderlich, um fortzufahren.",
  },
  en: {
    commonTitle: "Sign in",
    registerDescription: "Create your Dev-SSO account.",
    loginTitle: "Sign in",
    loginDescription: "Enter the registered email to continue.",
    loginNamePlaceholder: "Email",
    registerButton: "Register Now",
    backButton: "Back",
    continueButton: "Continue",
    registerTitle: "Register",
    registerSelectMethod: "Choose the sign-in method you want to use",
    registerFirstName: "First name",
    registerLastName: "Last name",
    registerEmail: "Email",
    passwordVerifyTitle: "Password",
    passwordResetButton: "Reset password",
    passwordSetTitle: "Set password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm password",
    allowButton: "Allow",
    denyButton: "Deny",
    couldNotRegisterUser:
      "We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.",
    couldNotResetPassword:
      "We could not start password reset. Please try again.",
    couldNotVerifyEmail:
      "We could not verify this email. Please try again.",
    couldNotVerifyInvite:
      "We could not verify this invitation. Please try again.",
    failedToAuthenticate:
      "We could not verify your sign-in details. Please try again.",
    lockoutMessage:
      "Too many attempts were detected. Please wait a moment before trying again.",
    multipleUsersFound:
      "We found more than one account with these details. Use a more specific sign-in identifier.",
    userNotActive:
      "This account is not active. Contact your administrator.",
    verificationRequired:
      "Additional verification is required to continue.",
  },
  es: {
    commonTitle: "Iniciar sesión con Dev-SSO",
    registerDescription: "Create your Dev-SSO account.",
    couldNotRegisterUser:
      "No pudimos completar el registro. Es posible que ya exista una cuenta con estos datos. Inicia sesión o restablece tu contraseña.",
    couldNotResetPassword:
      "No pudimos iniciar el restablecimiento de la contraseña. Inténtalo de nuevo.",
    couldNotVerifyEmail:
      "No pudimos verificar este correo electrónico. Inténtalo de nuevo.",
    couldNotVerifyInvite:
      "No pudimos verificar esta invitación. Inténtalo de nuevo.",
    failedToAuthenticate:
      "No pudimos verificar tus datos de acceso. Inténtalo de nuevo.",
    lockoutMessage:
      "Detectamos demasiados intentos. Espera un momento antes de volver a intentarlo.",
    multipleUsersFound:
      "Hemos encontrado más de una cuenta con estos datos. Utiliza un identificador de acceso más específico.",
    userNotActive:
      "Esta cuenta no está activa. Ponte en contacto con tu administrador.",
    verificationRequired:
      "Se requiere una verificación adicional para continuar.",
  },
  fr: {
    commonTitle: "Connexion avec Dev-SSO",
    registerDescription: "Create your Dev-SSO account.",
    couldNotRegisterUser:
      "Nous n avons pas pu terminer l inscription. Un compte existe peut-être déjà avec ces informations. Connectez-vous ou réinitialisez votre mot de passe.",
    couldNotResetPassword:
      "Nous n avons pas pu démarrer la réinitialisation du mot de passe. Veuillez réessayer.",
    couldNotVerifyEmail:
      "Nous n avons pas pu vérifier cette adresse e-mail. Veuillez réessayer.",
    couldNotVerifyInvite:
      "Nous n avons pas pu vérifier cette invitation. Veuillez réessayer.",
    failedToAuthenticate:
      "Nous n avons pas pu vérifier vos informations de connexion. Veuillez réessayer.",
    lockoutMessage:
      "Nous avons détecté trop de tentatives. Veuillez patienter un instant avant de réessayer.",
    multipleUsersFound:
      "Nous avons trouvé plusieurs comptes correspondant à ces informations. Utilisez un identifiant de connexion plus précis.",
    userNotActive:
      "Ce compte n est pas actif. Contactez votre administrateur.",
    verificationRequired:
      "Une vérification supplémentaire est requise pour continuer.",
  },
  id: {
    commonTitle: "Masuk",
    registerDescription: "Buat akun Dev-SSO Anda.",
    couldNotRegisterUser:
      "Kami tidak dapat menyelesaikan pendaftaran. Akun dengan detail ini mungkin sudah ada. Silakan masuk atau atur ulang kata sandi Anda.",
    couldNotResetPassword:
      "Kami tidak dapat memulai proses atur ulang kata sandi. Silakan coba lagi.",
    couldNotVerifyEmail:
      "Kami tidak dapat memverifikasi email ini. Silakan coba lagi.",
    couldNotVerifyInvite:
      "Kami tidak dapat memverifikasi undangan ini. Silakan coba lagi.",
    failedToAuthenticate:
      "Kami tidak dapat memverifikasi detail masuk Anda. Silakan coba lagi.",
    lockoutMessage:
      "Terlalu banyak percobaan terdeteksi. Mohon tunggu sebentar sebelum mencoba lagi.",
    multipleUsersFound:
      "Kami menemukan lebih dari satu akun dengan detail ini. Gunakan identitas masuk yang lebih spesifik.",
    userNotActive:
      "Akun ini tidak aktif. Hubungi administrator Anda.",
    verificationRequired:
      "Verifikasi tambahan diperlukan untuk melanjutkan.",
  },
  ru: {
    commonTitle: "Войти с Dev-SSO",
    registerDescription: "Create your Dev-SSO account.",
    couldNotRegisterUser:
      "Мы не смогли завершить регистрацию. Возможно, учетная запись с этими данными уже существует. Войдите в систему или сбросьте пароль.",
    couldNotResetPassword:
      "Мы не смогли начать сброс пароля. Попробуйте еще раз.",
    couldNotVerifyEmail:
      "Мы не смогли подтвердить этот адрес электронной почты. Попробуйте еще раз.",
    couldNotVerifyInvite:
      "Мы не смогли подтвердить это приглашение. Попробуйте еще раз.",
    failedToAuthenticate:
      "Мы не смогли проверить ваши данные для входа. Попробуйте еще раз.",
    lockoutMessage:
      "Обнаружено слишком много попыток. Подождите немного, прежде чем попробовать снова.",
    multipleUsersFound:
      "Мы нашли несколько учетных записей с этими данными. Используйте более точный идентификатор для входа.",
    userNotActive:
      "Эта учетная запись не активна. Обратитесь к администратору.",
    verificationRequired:
      "Для продолжения требуется дополнительная проверка.",
  },
};

const workspace = mkdtempSync(join(tmpdir(), "zitadel-copy-"));

try {
  for (const [locale, payload] of Object.entries(fixtures)) {
    writeFixture(locale, payload);
  }

  execFileSync("node", [
    "/Users/leavend/Desktop/Project_SSO/infra/zitadel-login/patch-login-copy.mjs",
    workspace,
  ]);

  for (const [locale, messages] of Object.entries(expected)) {
    assertLocale(locale, messages);
  }

  console.log("login copy catalog validation passed");
} finally {
  rmSync(workspace, { force: true, recursive: true });
}

function writeFixture(locale, payload) {
  const encoded = JSON.stringify(payload).replaceAll("'", "\\'");
  const file = join(workspace, `${locale}.js`);
  const source = `"use strict";exports.modules={1:a=>{a.exports=JSON.parse('${encoded}')}};`;
  writeFileSync(file, source);
}

function assertLocale(locale, messages) {
  const source = readFileSync(join(workspace, `${locale}.js`), "utf8");
  const translation = parseTranslation(source);
  if (translation?.common?.title !== messages.commonTitle) {
    throw new Error(`Missing ${locale}.commonTitle`);
  }
  if (translation?.register?.description !== messages.registerDescription) {
    throw new Error(`Missing ${locale}.registerDescription`);
  }
  if (messages.loginTitle && translation?.loginname?.title !== messages.loginTitle) {
    throw new Error(`Missing ${locale}.loginTitle`);
  }
  if (messages.loginDescription && translation?.loginname?.description !== messages.loginDescription) {
    throw new Error(`Missing ${locale}.loginDescription`);
  }
  if (messages.loginNamePlaceholder && translation?.loginname?.loginNamePlaceholder !== messages.loginNamePlaceholder) {
    throw new Error(`Missing ${locale}.loginNamePlaceholder`);
  }
  if (messages.registerButton && translation?.loginname?.registerButton !== messages.registerButton) {
    throw new Error(`Missing ${locale}.registerButton`);
  }
  if (messages.backButton && translation?.common?.back !== messages.backButton) {
    throw new Error(`Missing ${locale}.backButton`);
  }
  if (messages.continueButton && translation?.common?.continue !== messages.continueButton) {
    throw new Error(`Missing ${locale}.continueButton`);
  }
  if (messages.registerTitle && translation?.register?.title !== messages.registerTitle) {
    throw new Error(`Missing ${locale}.registerTitle`);
  }
  if (messages.registerSelectMethod && translation?.register?.selectMethod !== messages.registerSelectMethod) {
    throw new Error(`Missing ${locale}.registerSelectMethod`);
  }
  if (messages.registerFirstName && translation?.register?.labels?.firstname !== messages.registerFirstName) {
    throw new Error(`Missing ${locale}.registerFirstName`);
  }
  if (messages.registerLastName && translation?.register?.labels?.lastname !== messages.registerLastName) {
    throw new Error(`Missing ${locale}.registerLastName`);
  }
  if (messages.registerEmail && translation?.register?.labels?.email !== messages.registerEmail) {
    throw new Error(`Missing ${locale}.registerEmail`);
  }
  if (messages.passwordVerifyTitle && translation?.password?.verify?.title !== messages.passwordVerifyTitle) {
    throw new Error(`Missing ${locale}.passwordVerifyTitle`);
  }
  if (messages.passwordResetButton && translation?.password?.verify?.resetPassword !== messages.passwordResetButton) {
    throw new Error(`Missing ${locale}.passwordResetButton`);
  }
  if (messages.passwordSetTitle && translation?.password?.set?.title !== messages.passwordSetTitle) {
    throw new Error(`Missing ${locale}.passwordSetTitle`);
  }
  if (messages.newPasswordLabel && translation?.password?.set?.labels?.newPassword !== messages.newPasswordLabel) {
    throw new Error(`Missing ${locale}.newPasswordLabel`);
  }
  if (messages.confirmPasswordLabel && translation?.password?.set?.labels?.confirmPassword !== messages.confirmPasswordLabel) {
    throw new Error(`Missing ${locale}.confirmPasswordLabel`);
  }
  if (messages.allowButton && translation?.device?.request?.submit !== messages.allowButton) {
    throw new Error(`Missing ${locale}.allowButton`);
  }
  if (messages.denyButton && translation?.device?.request?.deny !== messages.denyButton) {
    throw new Error(`Missing ${locale}.denyButton`);
  }
  for (const [key, value] of Object.entries(messages)) {
    if (
      key === "commonTitle" ||
      key === "registerDescription" ||
      key === "loginTitle" ||
      key === "loginDescription" ||
      key === "loginNamePlaceholder" ||
      key === "registerButton" ||
      key === "backButton" ||
      key === "continueButton" ||
      key === "registerTitle" ||
      key === "registerSelectMethod" ||
      key === "registerFirstName" ||
      key === "registerLastName" ||
      key === "registerEmail" ||
      key === "passwordVerifyTitle" ||
      key === "passwordResetButton" ||
      key === "passwordSetTitle" ||
      key === "newPasswordLabel" ||
      key === "confirmPasswordLabel" ||
      key === "allowButton" ||
      key === "denyButton"
    ) {
      continue;
    }
    const actual = translation?.loginname?.errors?.[key];
    if (actual !== value) {
      throw new Error(`Missing ${locale}.${key}`);
    }
  }
}

function parseTranslation(source) {
  const marker = "a.exports=JSON.parse('";
  const start = source.indexOf(marker);
  const end = source.lastIndexOf("')");
  const literal = source.slice(start + marker.length, end);
  return JSON.parse(Function(`"use strict";return '${literal}';`)());
}
