const brandName = "Dev-SSO";
export const fallbackLocale = "en";

export const localeMarkers = {
  en: ["Login with Zitadel", "Welcome back!"],
  de: ["Anmelden mit Zitadel", "Willkommen zurück!"],
  es: ["Iniciar sesión con Zitadel", "¡Bienvenido de nuevo!"],
  fr: ["Connexion avec Zitadel", "Bienvenue!"],
  id: ["Masuk dengan Zitadel", "Login dengan Zitadel", "Selamat datang kembali!"],
  ru: ["Войти с Zitadel", "С возвращением!"],
};

export const translationValueReplacements = [
  ["ZITADEL", brandName],
  ["Zitadel", brandName],
  ["zitadel", brandName],
];

const indonesianExactValueReplacements = [
  ["Login with Zitadel", "Masuk ke Dev-SSO"],
  ["Welcome back!", "Masuk ke Dev-SSO"],
  ["Enter your login data.", "Gunakan akun Anda untuk masuk dengan aman."],
  ["Loginname", "Email atau username"],
  ["Register new user", "Buat akun baru"],
  ["Register", "Buat akun"],
  ["Create your ZITADEL account.", "Buat akun Dev-SSO Anda."],
  ["Create your Zitadel account.", "Buat akun Dev-SSO Anda."],
  ["Select the method you would like to authenticate", "Pilih metode masuk yang ingin digunakan"],
  ["First name", "Nama depan"],
  ["Last name", "Nama belakang"],
  ["E-mail", "Email"],
  ["Password", "Kata sandi"],
  ["Reset Password", "Atur Ulang Kata Sandi"],
  ["Set Password", "Atur Kata Sandi"],
  ["Change Password", "Ubah Kata Sandi"],
  ["New Password", "Kata Sandi Baru"],
  ["Confirm Password", "Konfirmasi Kata Sandi"],
  ["Code", "Kode"],
  ["Resend code", "Kirim ulang kode"],
  ["Didn't receive a code?", "Belum menerima kode?"],
  ["A code has been sent to your email address.", "Kode telah dikirim ke alamat email Anda."],
  ["A code has just been sent to your email address.", "Kode baru saja dikirim ke alamat email Anda."],
  ["Choose authentication method", "Pilih metode autentikasi"],
  ["Choose authentication", "Pilih autentikasi"],
  ["Select one of the following providers to sign in", "Pilih salah satu penyedia berikut untuk masuk"],
  ["Sign in with SSO", "Masuk dengan SSO"],
  ["Sign in with Apple", "Masuk dengan Apple"],
  ["Sign in with Google", "Masuk dengan Google"],
  ["Login failed", "Gagal masuk"],
  ["Account linking failed", "Gagal menghubungkan akun"],
  ["Registration Not Available", "Pendaftaran Tidak Tersedia"],
  ["Registration disabled", "Pendaftaran Dinonaktifkan"],
  ["The registration is disabled. Please contact your administrator.", "Pendaftaran dinonaktifkan. Hubungi administrator Anda."],
  ["Missing data", "Data belum lengkap"],
  ["Provide email, first and last name to register.", "Lengkapi email, nama depan, dan nama belakang untuk mendaftar."],
  ["No authentication method available. Please contact your administrator.", "Tidak ada metode autentikasi yang tersedia. Hubungi administrator Anda."],
  ["To register you must agree to the terms and conditions", "Untuk mendaftar, Anda harus menyetujui syarat dan ketentuan."],
  ["Terms of Service", "Syarat Layanan"],
  ["Privacy Policy", "Kebijakan Privasi"],
  ["Verify user", "Verifikasi akun"],
  ["Enter the Code provided in the verification email.", "Masukkan kode yang dikirim ke email verifikasi."],
  ["User verified", "Akun terverifikasi"],
  ["The user has been verified successfully.", "Akun berhasil diverifikasi."],
  ["Invite User", "Undang Pengguna"],
  ["Provide the email address and the name of the user you want to invite.", "Masukkan email dan nama pengguna yang ingin Anda undang."],
  ["The user will receive an email with further instructions.", "Pengguna akan menerima email berisi petunjuk lanjutan."],
  ["User invited", "Pengguna berhasil diundang"],
  ["The email has successfully been sent.", "Email berhasil dikirim."],
  ["Welcome {user}!", "Selamat datang, {user}!"],
  ["You are signed in.", "Anda sudah masuk."],
  ["Logout", "Keluar"],
  ["Logout successful", "Berhasil keluar"],
  ["Click an account to end the session", "Pilih akun untuk mengakhiri sesi"],
  ["End Session", "Akhiri Sesi"],
  ["Last active: {time}", "Terakhir aktif: {time}"],
  ["You have successfully logged out.", "Anda berhasil keluar."],
  ["Accounts", "Daftar Akun"],
  ["Select the account you want to use.", "Pilih akun yang ingin digunakan."],
  ["Add another account", "Tambah akun lain"],
  ["No accounts found", "Tidak ada akun ditemukan."],
  ["verified", "terverifikasi"],
  ["expired", "kedaluwarsa"],
  ["Allow", "Izinkan"],
  ["Deny", "Tolak"],
  ["Device code", "Kode perangkat"],
  ["Try Again", "Coba Lagi"],
  ["Error", "Terjadi Kesalahan"],
  ["Back", "Kembali"],
  ["Continue", "Lanjutkan"],
  ["Username", "Nama pengguna"],
  ["Username or phone number", "Nama pengguna atau nomor telepon"],
  ["Username or email", "Nama pengguna atau email"],
  ["This field is required", "Kolom ini wajib diisi."],
  ["Enter your password.", "Masukkan kata sandi Anda."],
  ["Password was reset. Please check your email", "Kata sandi berhasil diatur ulang. Silakan periksa email Anda."],
  ["Set the password for your account", "Atur kata sandi untuk akun Anda."],
  ["You have to provide a password!", "Kata sandi wajib diisi."],
  ["You have to provide a new password!", "Kata sandi baru wajib diisi."],
  ["Must be at least {minLength} characters long.", "Minimal {minLength} karakter."],
  ["Must include a symbol.", "Harus mengandung simbol."],
  ["Must include a number.", "Harus mengandung angka."],
  ["Must include an uppercase letter.", "Harus mengandung huruf besar."],
  ["Must include a lowercase letter.", "Harus mengandung huruf kecil."],
  ["Password confirmation matched.", "Konfirmasi kata sandi sudah cocok."],
  ["Matches", "Cocok"],
  ["Doesn't match", "Belum cocok"],
  ["or sign in with", "atau masuk dengan"],
  ["Sign in with AzureAD", "Masuk dengan Azure AD"],
  ["Sign in with GitHub", "Masuk dengan GitHub"],
  ["Sign in with GitLab", "Masuk dengan GitLab"],
  ["Complete your data", "Lengkapi data Anda"],
  ["You need to complete your registration by providing your email address and name.", "Selesaikan pendaftaran dengan mengisi email dan nama Anda."],
  ["Account Not Found", "Akun Tidak Ditemukan"],
  ["We couldn't find an account associated with your identity provider credentials.", "Kami tidak menemukan akun yang terhubung dengan kredensial penyedia identitas Anda."],
  ["No existing account was found. Please sign in with an existing account or contact your administrator for assistance.", "Tidak ada akun yang cocok. Silakan masuk dengan akun yang sudah ada atau hubungi administrator Anda."],
  ["Back to Login", "Kembali ke Login"],
  ["We couldn't complete the registration process.", "Kami tidak dapat menyelesaikan proses pendaftaran."],
  ["Processing authentication...", "Memproses autentikasi..."],
  ["No redirect or error returned from server", "Server tidak mengembalikan redirect atau pesan kesalahan."],
  ["LDAP Login", "Masuk dengan LDAP"],
  ["Enter your LDAP credentials.", "Masukkan kredensial LDAP Anda."],
  ["Verify your identity", "Verifikasi identitas Anda"],
  ["Choose one of the following factors.", "Pilih salah satu faktor berikut."],
  ["No second factors available to setup.", "Tidak ada faktor kedua yang tersedia untuk disiapkan."],
  ["Set up 2-Factor", "Atur Verifikasi 2 Langkah"],
  ["Choose one of the following second factors.", "Pilih salah satu faktor kedua berikut."],
  ["Skip", "Lewati"],
  ["Verify 2-Factor", "Verifikasi 2 Langkah"],
  ["Enter the code from your authenticator app.", "Masukkan kode dari aplikasi autentikator Anda."],
  ["Enter the code you received via SMS.", "Masukkan kode yang Anda terima lewat SMS."],
  ["Enter the code you received via email.", "Masukkan kode yang Anda terima lewat email."],
  ["Scan the QR code with your authenticator app.", "Pindai kode QR dengan aplikasi autentikator Anda."],
  ["Enter your phone number to receive a code via SMS.", "Masukkan nomor telepon untuk menerima kode lewat SMS."],
  ["Enter your email address to receive a code via email.", "Masukkan alamat email untuk menerima kode lewat email."],
  ["Scan the QR Code or navigate to the URL manually.", "Pindai kode QR atau buka URL secara manual."],
  ["Authenticate with a passkey", "Autentikasi dengan passkey"],
  ["Your device will ask for your fingerprint, face, or screen lock", "Perangkat Anda akan meminta sidik jari, wajah, atau kunci layar."],
  ["Use password", "Gunakan kata sandi"],
  ["Setup a passkey", "Atur passkey"],
  ["A passkey is an authentication method on a device like your fingerprint, Apple FaceID or similar. ", "Passkey adalah metode autentikasi di perangkat seperti sidik jari, Face ID, atau sejenisnya. "],
  ["Passwordless Authentication", "Autentikasi tanpa kata sandi"],
  ["Verify your account with your device.", "Verifikasi akun Anda dengan perangkat Anda."],
  ["Set up a device as a second factor.", "Siapkan perangkat sebagai faktor kedua."],
  ["Your settings do not allow you to invite users.", "Pengaturan Anda tidak mengizinkan untuk mengundang pengguna."],
  ["The user has been invited and has already verified his email.", "Pengguna sudah diundang dan emailnya sudah terverifikasi."],
  ["The user has been invited. They will receive an email with further instructions.", "Pengguna telah diundang. Mereka akan menerima email dengan petunjuk lanjutan."],
  ["Invite another user", "Undang pengguna lain"],
  ["Setup authenticator", "Siapkan autentikator"],
  ["No authentication methods available", "Tidak ada metode autentikasi yang tersedia."],
  ["You have already setup an authenticator!", "Anda sudah menyiapkan autentikator."],
  ["or link with an Identity Provider", "atau hubungkan dengan penyedia identitas"],
  ["Enter the code displayed on your app or device.", "Masukkan kode yang tampil di aplikasi atau perangkat Anda."],
  ["{appName} would like to connect", "{appName} ingin terhubung"],
  ["{appName} will have access to:", "{appName} akan mendapatkan akses ke:"],
  ["By clicking Allow, you allow {appName} and Dev-SSO to use your information in accordance with their respective terms of service and privacy policies. You can revoke this access at any time.", "Dengan menekan Izinkan, Anda mengizinkan {appName} dan Dev-SSO menggunakan informasi Anda sesuai syarat layanan dan kebijakan privasi masing-masing. Akses ini dapat dicabut kapan saja."],
  ["Verify your identity.", "Verifikasi identitas Anda."],
  ["View your email address.", "Lihat alamat email Anda."],
  ["View your full profile information.", "Lihat informasi profil lengkap Anda."],
  ["Allow offline access to your account.", "Izinkan akses offline ke akun Anda."],
  ["A device code is required to continue.", "Kode perangkat diperlukan untuk melanjutkan."],
  ["Contact your administrator to unlock your account", "Hubungi administrator Anda untuk membuka kembali akun ini"],
];

const englishExactValueReplacements = [
  ["Login with Zitadel", "Sign in to Dev-SSO"],
  ["Welcome back!", "Sign in to Dev-SSO"],
  ["Enter your login data.", "Use your account to sign in securely."],
  ["Loginname", "Email or username"],
  ["Register new user", "Create new account"],
  ["Register", "Create account"],
  ["Create your ZITADEL account.", "Create your Dev-SSO account."],
  ["Create your Zitadel account.", "Create your Dev-SSO account."],
  ["Select the method you would like to authenticate", "Choose the sign-in method you want to use"],
  ["E-mail", "Email"],
  ["Reset Password", "Reset password"],
  ["Set Password", "Set password"],
  ["Change Password", "Change password"],
  ["New Password", "New password"],
  ["Confirm Password", "Confirm password"],
  ["Allow", "Allow"],
  ["Deny", "Deny"],
  ["Back", "Back"],
  ["Continue", "Continue"],
];

export const localeExactValueReplacements = {
  en: englishExactValueReplacements,
  id: indonesianExactValueReplacements,
};

export const fallbackErrorCatalog = {
  autoLinkingFailed: "We could not finish account setup automatically. Please try again.",
  codeOrVerificationRequired: "Additional verification is required to continue.",
  contextMissing: "We could not continue this request. Please try again.",
  couldNotChangePassword: "We could not change your password. Please try again.",
  couldNotContinueSession: "We could not continue this sign-in session. Please start again.",
  couldNotCreateSession: "Your account is ready, but we could not complete sign-in. Please sign in to continue.",
  couldNotCreateSessionForUser: "We could not complete sign-in for this account. Please try again.",
  couldNotCreateUser: "We could not create your account. Please review your details and try again.",
  couldNotDetermineRedirect: "We could not complete passkey sign-in. Please try again.",
  couldNotFindIdentityProvider: "We could not load the selected sign-in method. Please try again.",
  couldNotFindSession: "We could not continue this sign-in session. Please try again.",
  couldNotGetDomain: "We could not continue sign-in. Please try again.",
  couldNotGetHost: "We could not continue sign-in. Please try again.",
  couldNotGetLoginSettings: "We could not prepare secure sign-in. Please try again.",
  couldNotLinkIDP: "We could not finish account setup with the selected sign-in method. Please try again.",
  couldNotLoadAuthenticators: "We could not load the available verification methods. Please try again.",
  couldNotLoadAuthMethods: "We could not load the available sign-in methods. Please try again.",
  couldNotLoadSession: "We could not continue sign-in. Please try again.",
  couldNotLoadUser: "We could not load this account. Please try again.",
  couldNotRegisterUser: "We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.",
  couldNotResendEmail: "We could not resend the verification email. Please try again.",
  couldNotResendInvite: "We could not resend the invitation. Please try again.",
  couldNotResetPassword: "We could not start password reset. Please try again.",
  couldNotRetrievePasskey: "We could not access passkey sign-in. Please try again.",
  couldNotSearchUsers: "We could not continue sign-in. Review your details and try again.",
  couldNotSendResetLink: "We could not start password reset. Please try again.",
  couldNotSetPassword: "We could not set your password. Please try again.",
  couldNotStartIDPFlow: "We could not continue with the selected sign-in method. Please try again.",
  couldNotUpdateSession: "We could not continue this sign-in session. Please try again.",
  couldNotVerify: "We could not verify this request. Please try again.",
  couldNotVerifyEmail: "We could not verify this email. Please try again.",
  couldNotVerifyInvite: "We could not verify this invitation. Please try again.",
  couldNotVerifyPassword: "We could not verify your sign-in details. Please try again.",
  couldNotVerifyUser: "We could not verify this account. Please try again.",
  emailSendFailed: "We could not send the verification email. Please try again.",
  errorOccured: "We could not complete your request",
  failedPrecondition: "We could not complete your request. Please try again.",
  failedToAuthenticate: "We could not verify your sign-in details. Please try again.",
  failedToAuthenticateNoLimit: "We could not verify your sign-in details. Please try again.",
  idpNotFound: "We could not load the selected sign-in method. Please try again.",
  initialUserNotSupported: "This sign-in path is not available for this account. Contact your administrator.",
  internalError: "We could not complete your request. Please try again.",
  inviteSendFailed: "We could not send the invitation email. Please try again.",
  linkingFailed: "We could not connect the selected sign-in method to this account. Please try again.",
  linkingNotAllowed: "This sign-in method is not available for this account. Contact your administrator.",
  lockoutMessage: "Too many attempts were detected. Please wait a moment before trying again.",
  localAuthenticationNotAllowed: "Password sign-in is not available for this account. Contact your administrator.",
  missingIdpInfo: "We could not load the selected sign-in method. Please try again.",
  missingParameters: "We could not continue this request. Please start again.",
  moreThanOneUserFound: "We could not continue sign-in. Use a more specific sign-in identifier.",
  multipleUsersFound: "We found more than one account with these details. Use a more specific sign-in identifier.",
  noDeviceRequest: "We could not find this device sign-in request. Start again to continue.",
  noHostFound: "We could not continue this request. Please try again.",
  noUserCode: "A device code is required to continue.",
  orgResolutionFailed: "We could not continue sign-up with the provided details. Please start again.",
  passkeysNotAllowed: "Passkey sign-in is not available for this account. Contact your administrator.",
  passwordVerificationMissing: "Please verify your password again to continue.",
  passwordVerificationTooOld: "Please verify your password again to continue.",
  sessionCreationFailed: "Your account is ready, but we could not complete sign-in. Please sign in to continue.",
  sessionExpired: "Your sign-in session has expired. Start again to continue.",
  sessionNotValid: "This sign-in session is no longer valid. Start again to continue.",
  unexpectedError: "We could not complete your request. Please try again.",
  unknownContext: "We could not continue sign-in. Start again and enter your sign-in details first.",
  unknownError: "We could not complete your request. Please try again.",
  userAlreadyVerified: "This account is already verified.",
  userCreationFailed: "We could not create your account. Please review your details and try again.",
  userIdMissing: "We could not continue this request. Please start again.",
  userInitialStateNotSupported: "This account is not available for this sign-in flow. Contact your administrator.",
  userNotActive: "This account is not active. Contact your administrator.",
  userNotFound: "We could not complete this step. Please start again.",
  verificationCancelled: "Passkey sign-in was canceled.",
  verificationFailed: "We could not complete passkey sign-in. Please try again.",
  verificationRequired: "Additional verification is required to continue.",
};

export const localeErrorCatalog = {
  de: {
    couldNotRegisterUser:
      "Wir konnten die Registrierung nicht abschließen. Mit diesen Angaben besteht möglicherweise bereits ein Konto. Melden Sie sich an oder setzen Sie Ihr Passwort zurück.",
    couldNotVerifyPassword:
      "Wir konnten Ihre Anmeldedaten nicht bestätigen. Bitte versuchen Sie es erneut.",
    couldNotResetPassword:
      "Wir konnten das Zurücksetzen des Passworts nicht starten. Bitte versuchen Sie es erneut.",
    couldNotResendEmail:
      "Wir konnten die Bestätigungs-E-Mail nicht erneut senden. Bitte versuchen Sie es erneut.",
    couldNotResendInvite:
      "Wir konnten die Einladung nicht erneut senden. Bitte versuchen Sie es erneut.",
    couldNotVerifyEmail:
      "Wir konnten diese E-Mail-Adresse nicht bestätigen. Bitte versuchen Sie es erneut.",
    couldNotVerifyInvite:
      "Wir konnten diese Einladung nicht bestätigen. Bitte versuchen Sie es erneut.",
    internalError:
      "Wir konnten Ihre Anfrage nicht abschließen. Bitte versuchen Sie es erneut.",
    failedToAuthenticate:
      "Wir konnten Ihre Anmeldedaten nicht bestätigen. Bitte versuchen Sie es erneut.",
    inviteSendFailed:
      "Wir konnten die Einladungs-E-Mail nicht senden. Bitte versuchen Sie es erneut.",
    localAuthenticationNotAllowed:
      "Die Anmeldung mit Passwort ist für dieses Konto nicht verfügbar. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    lockoutMessage:
      "Es wurden zu viele Versuche erkannt. Bitte warten Sie einen Moment, bevor Sie es erneut versuchen.",
    passkeysNotAllowed:
      "Die Anmeldung mit Passkey ist für dieses Konto nicht verfügbar. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    linkingNotAllowed:
      "Diese Anmeldemethode ist für dieses Konto nicht verfügbar. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    multipleUsersFound:
      "Wir haben mehr als ein Konto mit diesen Angaben gefunden. Verwenden Sie eine eindeutigere Anmeldekennung.",
    passwordVerificationMissing:
      "Bitte bestätigen Sie Ihr Passwort erneut, um fortzufahren.",
    passwordVerificationTooOld:
      "Bitte bestätigen Sie Ihr Passwort erneut, um fortzufahren.",
    sessionExpired:
      "Ihre Anmeldesitzung ist abgelaufen. Starten Sie den Vorgang erneut, um fortzufahren.",
    userNotActive:
      "Dieses Konto ist nicht aktiv. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    userAlreadyVerified: "Dieses Konto ist bereits bestätigt.",
    userInitialStateNotSupported:
      "Dieses Konto ist für diesen Anmeldeablauf nicht verfügbar. Wenden Sie sich an Ihre Administratorin oder Ihren Administrator.",
    verificationRequired:
      "Eine zusätzliche Bestätigung ist erforderlich, um fortzufahren.",
  },
  es: {
    couldNotRegisterUser:
      "No pudimos completar el registro. Es posible que ya exista una cuenta con estos datos. Inicia sesión o restablece tu contraseña.",
    couldNotVerifyPassword:
      "No pudimos verificar tus datos de acceso. Inténtalo de nuevo.",
    couldNotResetPassword:
      "No pudimos iniciar el restablecimiento de la contraseña. Inténtalo de nuevo.",
    couldNotResendEmail:
      "No pudimos reenviar el correo de verificación. Inténtalo de nuevo.",
    couldNotResendInvite:
      "No pudimos reenviar la invitación. Inténtalo de nuevo.",
    couldNotVerifyEmail:
      "No pudimos verificar este correo electrónico. Inténtalo de nuevo.",
    couldNotVerifyInvite:
      "No pudimos verificar esta invitación. Inténtalo de nuevo.",
    internalError:
      "No pudimos completar tu solicitud. Inténtalo de nuevo.",
    failedToAuthenticate:
      "No pudimos verificar tus datos de acceso. Inténtalo de nuevo.",
    inviteSendFailed:
      "No pudimos enviar el correo de invitación. Inténtalo de nuevo.",
    localAuthenticationNotAllowed:
      "El acceso con contraseña no está disponible para esta cuenta. Ponte en contacto con tu administrador.",
    lockoutMessage:
      "Detectamos demasiados intentos. Espera un momento antes de volver a intentarlo.",
    passkeysNotAllowed:
      "El acceso con passkey no está disponible para esta cuenta. Ponte en contacto con tu administrador.",
    linkingNotAllowed:
      "Este método de acceso no está disponible para esta cuenta. Ponte en contacto con tu administrador.",
    multipleUsersFound:
      "Hemos encontrado más de una cuenta con estos datos. Utiliza un identificador de acceso más específico.",
    passwordVerificationMissing:
      "Vuelve a verificar tu contraseña para continuar.",
    passwordVerificationTooOld:
      "Vuelve a verificar tu contraseña para continuar.",
    sessionExpired:
      "Tu sesión de acceso ha expirado. Empieza de nuevo para continuar.",
    userNotActive:
      "Esta cuenta no está activa. Ponte en contacto con tu administrador.",
    userAlreadyVerified: "Esta cuenta ya está verificada.",
    userInitialStateNotSupported:
      "Esta cuenta no está disponible para este flujo de acceso. Ponte en contacto con tu administrador.",
    verificationRequired:
      "Se requiere una verificación adicional para continuar.",
  },
  fr: {
    couldNotRegisterUser:
      "Nous n avons pas pu terminer l inscription. Un compte existe peut-être déjà avec ces informations. Connectez-vous ou réinitialisez votre mot de passe.",
    couldNotVerifyPassword:
      "Nous n avons pas pu vérifier vos informations de connexion. Veuillez réessayer.",
    couldNotResetPassword:
      "Nous n avons pas pu démarrer la réinitialisation du mot de passe. Veuillez réessayer.",
    couldNotResendEmail:
      "Nous n avons pas pu renvoyer l email de vérification. Veuillez réessayer.",
    couldNotResendInvite:
      "Nous n avons pas pu renvoyer l invitation. Veuillez réessayer.",
    couldNotVerifyEmail:
      "Nous n avons pas pu vérifier cette adresse e-mail. Veuillez réessayer.",
    couldNotVerifyInvite:
      "Nous n avons pas pu vérifier cette invitation. Veuillez réessayer.",
    internalError:
      "Nous n avons pas pu terminer votre demande. Veuillez réessayer.",
    failedToAuthenticate:
      "Nous n avons pas pu vérifier vos informations de connexion. Veuillez réessayer.",
    inviteSendFailed:
      "Nous n avons pas pu envoyer l email d invitation. Veuillez réessayer.",
    localAuthenticationNotAllowed:
      "La connexion par mot de passe n est pas disponible pour ce compte. Contactez votre administrateur.",
    lockoutMessage:
      "Nous avons détecté trop de tentatives. Veuillez patienter un instant avant de réessayer.",
    passkeysNotAllowed:
      "La connexion avec passkey n est pas disponible pour ce compte. Contactez votre administrateur.",
    linkingNotAllowed:
      "Cette méthode de connexion n est pas disponible pour ce compte. Contactez votre administrateur.",
    multipleUsersFound:
      "Nous avons trouvé plusieurs comptes correspondant à ces informations. Utilisez un identifiant de connexion plus précis.",
    passwordVerificationMissing:
      "Veuillez vérifier à nouveau votre mot de passe pour continuer.",
    passwordVerificationTooOld:
      "Veuillez vérifier à nouveau votre mot de passe pour continuer.",
    sessionExpired:
      "Votre session de connexion a expiré. Recommencez pour continuer.",
    userNotActive:
      "Ce compte n est pas actif. Contactez votre administrateur.",
    userAlreadyVerified: "Ce compte est déjà vérifié.",
    userInitialStateNotSupported:
      "Ce compte n est pas disponible pour ce parcours de connexion. Contactez votre administrateur.",
    verificationRequired:
      "Une vérification supplémentaire est requise pour continuer.",
  },
  id: {
    autoLinkingFailed: "Kami tidak dapat menyelesaikan pengaturan akun secara otomatis. Silakan coba lagi.",
    codeOrVerificationRequired: "Verifikasi tambahan diperlukan untuk melanjutkan.",
    contextMissing: "Kami tidak dapat melanjutkan permintaan ini. Silakan coba lagi.",
    couldNotChangePassword: "Kami tidak dapat mengubah kata sandi Anda. Silakan coba lagi.",
    couldNotContinueSession: "Kami tidak dapat melanjutkan sesi masuk ini. Silakan mulai lagi.",
    couldNotCreateSession: "Akun Anda sudah siap, tetapi kami tidak dapat menyelesaikan proses masuk. Silakan masuk untuk melanjutkan.",
    couldNotCreateSessionForUser: "Kami tidak dapat menyelesaikan proses masuk untuk akun ini. Silakan coba lagi.",
    couldNotCreateUser: "Kami tidak dapat membuat akun Anda. Periksa kembali data Anda dan coba lagi.",
    couldNotDetermineRedirect: "Kami tidak dapat menyelesaikan proses masuk dengan passkey. Silakan coba lagi.",
    couldNotFindIdentityProvider: "Kami tidak dapat memuat metode masuk yang dipilih. Silakan coba lagi.",
    couldNotFindSession: "Kami tidak dapat melanjutkan sesi masuk ini. Silakan coba lagi.",
    couldNotGetDomain: "Kami tidak dapat melanjutkan proses masuk. Silakan coba lagi.",
    couldNotGetHost: "Kami tidak dapat melanjutkan proses masuk. Silakan coba lagi.",
    couldNotGetLoginSettings: "Kami tidak dapat menyiapkan proses masuk yang aman. Silakan coba lagi.",
    couldNotLinkIDP: "Kami tidak dapat menyelesaikan pengaturan akun dengan metode masuk yang dipilih. Silakan coba lagi.",
    couldNotLoadAuthenticators: "Kami tidak dapat memuat metode verifikasi yang tersedia. Silakan coba lagi.",
    couldNotLoadAuthMethods: "Kami tidak dapat memuat metode masuk yang tersedia. Silakan coba lagi.",
    couldNotLoadSession: "Kami tidak dapat melanjutkan proses masuk. Silakan coba lagi.",
    couldNotLoadUser: "Kami tidak dapat memuat akun ini. Silakan coba lagi.",
    couldNotRegisterUser:
      "Kami tidak dapat menyelesaikan pendaftaran. Akun dengan detail ini mungkin sudah ada. Silakan masuk atau atur ulang kata sandi Anda.",
    couldNotResendEmail:
      "Kami tidak dapat mengirim ulang email verifikasi. Silakan coba lagi.",
    couldNotResendInvite:
      "Kami tidak dapat mengirim ulang undangan. Silakan coba lagi.",
    couldNotResetPassword:
      "Kami tidak dapat memulai proses atur ulang kata sandi. Silakan coba lagi.",
    couldNotRetrievePasskey: "Kami tidak dapat mengakses proses masuk dengan passkey. Silakan coba lagi.",
    couldNotSearchUsers: "Kami tidak dapat melanjutkan proses masuk. Periksa kembali data Anda dan coba lagi.",
    couldNotSendResetLink: "Kami tidak dapat memulai proses atur ulang kata sandi. Silakan coba lagi.",
    couldNotSetPassword: "Kami tidak dapat mengatur kata sandi Anda. Silakan coba lagi.",
    couldNotStartIDPFlow: "Kami tidak dapat melanjutkan dengan metode masuk yang dipilih. Silakan coba lagi.",
    couldNotUpdateSession: "Kami tidak dapat melanjutkan sesi masuk ini. Silakan coba lagi.",
    couldNotVerify: "Kami tidak dapat memverifikasi permintaan ini. Silakan coba lagi.",
    couldNotVerifyEmail:
      "Kami tidak dapat memverifikasi email ini. Silakan coba lagi.",
    couldNotVerifyInvite:
      "Kami tidak dapat memverifikasi undangan ini. Silakan coba lagi.",
    couldNotVerifyPassword:
      "Kami tidak dapat memverifikasi detail masuk Anda. Silakan coba lagi.",
    couldNotVerifyUser: "Kami tidak dapat memverifikasi akun ini. Silakan coba lagi.",
    emailSendFailed: "Kami tidak dapat mengirim email verifikasi. Silakan coba lagi.",
    errorOccured: "Kami tidak dapat menyelesaikan permintaan Anda",
    failedPrecondition: "Kami tidak dapat menyelesaikan permintaan Anda. Silakan coba lagi.",
    failedToAuthenticate:
      "Kami tidak dapat memverifikasi detail masuk Anda. Silakan coba lagi.",
    failedToAuthenticateNoLimit:
      "Kami tidak dapat memverifikasi detail masuk Anda. Silakan coba lagi.",
    idpNotFound: "Kami tidak dapat memuat metode masuk yang dipilih. Silakan coba lagi.",
    initialUserNotSupported: "Alur masuk ini tidak tersedia untuk akun ini. Hubungi administrator Anda.",
    internalError:
      "Kami tidak dapat menyelesaikan permintaan Anda. Silakan coba lagi.",
    inviteSendFailed:
      "Kami tidak dapat mengirim email undangan. Silakan coba lagi.",
    linkingFailed: "Kami tidak dapat menghubungkan metode masuk yang dipilih ke akun ini. Silakan coba lagi.",
    linkingNotAllowed:
      "Metode masuk ini tidak tersedia untuk akun ini. Hubungi administrator Anda.",
    localAuthenticationNotAllowed:
      "Masuk dengan kata sandi tidak tersedia untuk akun ini. Hubungi administrator Anda.",
    lockoutMessage:
      "Terlalu banyak percobaan terdeteksi. Mohon tunggu sebentar sebelum mencoba lagi.",
    missingIdpInfo: "Kami tidak dapat memuat metode masuk yang dipilih. Silakan coba lagi.",
    missingParameters: "Kami tidak dapat melanjutkan permintaan ini. Silakan mulai lagi.",
    moreThanOneUserFound: "Kami tidak dapat melanjutkan proses masuk. Gunakan identitas masuk yang lebih spesifik.",
    multipleUsersFound:
      "Kami menemukan lebih dari satu akun dengan detail ini. Gunakan identitas masuk yang lebih spesifik.",
    noDeviceRequest: "Kami tidak dapat menemukan permintaan masuk perangkat ini. Mulai lagi untuk melanjutkan.",
    noHostFound: "Kami tidak dapat melanjutkan permintaan ini. Silakan coba lagi.",
    noUserCode: "Kode perangkat diperlukan untuk melanjutkan.",
    orgResolutionFailed: "Kami tidak dapat melanjutkan pendaftaran dengan data yang diberikan. Silakan mulai lagi.",
    passkeysNotAllowed:
      "Masuk dengan passkey tidak tersedia untuk akun ini. Hubungi administrator Anda.",
    passwordVerificationMissing:
      "Silakan verifikasi kembali kata sandi Anda untuk melanjutkan.",
    passwordVerificationTooOld:
      "Silakan verifikasi kembali kata sandi Anda untuk melanjutkan.",
    sessionCreationFailed: "Akun Anda sudah siap, tetapi kami tidak dapat menyelesaikan proses masuk. Silakan masuk untuk melanjutkan.",
    sessionExpired:
      "Sesi masuk Anda telah berakhir. Mulai lagi untuk melanjutkan.",
    sessionNotValid: "Sesi masuk ini tidak lagi berlaku. Mulai lagi untuk melanjutkan.",
    unexpectedError: "Kami tidak dapat menyelesaikan permintaan Anda. Silakan coba lagi.",
    unknownContext: "Kami tidak dapat melanjutkan proses masuk. Mulai lagi dan masukkan detail masuk Anda terlebih dahulu.",
    unknownError: "Kami tidak dapat menyelesaikan permintaan Anda. Silakan coba lagi.",
    userAlreadyVerified: "Akun ini sudah terverifikasi.",
    userCreationFailed: "Kami tidak dapat membuat akun Anda. Periksa kembali data Anda dan coba lagi.",
    userIdMissing: "Kami tidak dapat melanjutkan permintaan ini. Silakan mulai lagi.",
    userInitialStateNotSupported:
      "Akun ini tidak tersedia untuk alur masuk ini. Hubungi administrator Anda.",
    userNotActive:
      "Akun ini tidak aktif. Hubungi administrator Anda.",
    userNotFound: "Kami tidak dapat menyelesaikan langkah ini. Silakan mulai lagi.",
    verificationCancelled: "Proses masuk dengan passkey dibatalkan.",
    verificationFailed: "Kami tidak dapat menyelesaikan proses masuk dengan passkey. Silakan coba lagi.",
    verificationRequired:
      "Verifikasi tambahan diperlukan untuk melanjutkan.",
  },
  ru: {
    couldNotRegisterUser:
      "Мы не смогли завершить регистрацию. Возможно, учетная запись с этими данными уже существует. Войдите в систему или сбросьте пароль.",
    couldNotVerifyPassword:
      "Мы не смогли проверить ваши данные для входа. Попробуйте еще раз.",
    couldNotResetPassword:
      "Мы не смогли начать сброс пароля. Попробуйте еще раз.",
    couldNotResendEmail:
      "Мы не смогли повторно отправить письмо для подтверждения. Попробуйте еще раз.",
    couldNotResendInvite:
      "Мы не смогли повторно отправить приглашение. Попробуйте еще раз.",
    couldNotVerifyEmail:
      "Мы не смогли подтвердить этот адрес электронной почты. Попробуйте еще раз.",
    couldNotVerifyInvite:
      "Мы не смогли подтвердить это приглашение. Попробуйте еще раз.",
    internalError:
      "Мы не смогли завершить ваш запрос. Попробуйте еще раз.",
    failedToAuthenticate:
      "Мы не смогли проверить ваши данные для входа. Попробуйте еще раз.",
    inviteSendFailed:
      "Мы не смогли отправить письмо с приглашением. Попробуйте еще раз.",
    localAuthenticationNotAllowed:
      "Вход по паролю недоступен для этой учетной записи. Обратитесь к администратору.",
    lockoutMessage:
      "Обнаружено слишком много попыток. Подождите немного, прежде чем попробовать снова.",
    passkeysNotAllowed:
      "Вход с passkey недоступен для этой учетной записи. Обратитесь к администратору.",
    linkingNotAllowed:
      "Этот способ входа недоступен для этой учетной записи. Обратитесь к администратору.",
    multipleUsersFound:
      "Мы нашли несколько учетных записей с этими данными. Используйте более точный идентификатор для входа.",
    passwordVerificationMissing:
      "Подтвердите пароль еще раз, чтобы продолжить.",
    passwordVerificationTooOld:
      "Подтвердите пароль еще раз, чтобы продолжить.",
    sessionExpired:
      "Срок действия сеанса входа истек. Начните снова, чтобы продолжить.",
    userNotActive:
      "Эта учетная запись не активна. Обратитесь к администратору.",
    userAlreadyVerified: "Эта учетная запись уже подтверждена.",
    userInitialStateNotSupported:
      "Эта учетная запись недоступна для данного сценария входа. Обратитесь к администратору.",
    verificationRequired:
      "Для продолжения требуется дополнительная проверка.",
  },
};

export const literalReplacements = [
  [
    "An error occurred while trying to login.",
    "Kami tidak dapat menyelesaikan proses masuk. Silakan coba lagi.",
  ],
  [
    "An error occurred while trying to link your account.",
    "Kami tidak dapat menghubungkan akun Anda. Silakan coba lagi.",
  ],
  [
    "Unable to determine the organization for registration. Please contact your administrator for assistance.",
    "Pendaftaran tidak tersedia untuk alur masuk ini. Hubungi administrator Anda.",
  ],
  [
    "Failed to load data. Please try again.",
    "Kami tidak dapat memuat data. Silakan coba lagi.",
  ],
];

export const directReplacements = [
  [
    "catch(e){D(\"Could not register user\")}",
    "catch(e){D(\"We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.\")}",
  ],
  [
    "catch(()=>{v(\"Could not register user\")})",
    "catch(()=>{v(\"We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.\")})",
  ],
  [
    "catch{D(\"Could not register user\")}",
    "catch{D(\"We could not complete sign-up. An account may already exist with these details. Sign in or reset your password.\")}",
  ],
];
