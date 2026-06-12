# Integrasi Laravel

Panduan ini memakai Laravel sebagai **confidential client**. Authorization code, token, refresh token, dan client secret hanya diproses di server.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini, termasuk untuk confidential client.

Detail parameter dan response endpoint tersedia di [API Reference](../api-reference.md).

## 1. Install Dependencies

Gunakan HTTP client bawaan Laravel. Untuk validasi JWT lokal, tambahkan library JOSE yang mendukung ES256:

```bash
composer require firebase/php-jwt
```

## 2. Konfigurasi Environment

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/sso/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
```

Jangan memakai prefix frontend atau mengirim `SSO_CLIENT_SECRET` ke Blade/JavaScript.

```php
// config/services.php
'sso' => [
    'issuer' => env('SSO_ISSUER'),
    'client_id' => env('SSO_CLIENT_ID'),
    'client_secret' => env('SSO_CLIENT_SECRET'),
    'redirect_uri' => env('SSO_REDIRECT_URI'),
    'post_logout_uri' => env('SSO_POST_LOGOUT_URI'),
],
```

## 3. Authorize + PKCE

Simpan verifier, state, dan nonce di session server:

```php
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Str;

public function redirect(): RedirectResponse
{
    $verifier = Str::random(64);
    $state = Str::random(40);
    $nonce = Str::random(40);

    session([
        'oidc.verifier' => $verifier,
        'oidc.state' => $state,
        'oidc.nonce' => $nonce,
    ]);

    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    $query = http_build_query([
        'client_id' => config('services.sso.client_id'),
        'redirect_uri' => config('services.sso.redirect_uri'),
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ]);

    return redirect(config('services.sso.issuer').'/authorize?'.$query);
}
```

## 4. Callback dan Exchange

```php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

public function callback(Request $request): RedirectResponse
{
    abort_unless(
        is_string($request->state) && hash_equals((string) session()->pull('oidc.state'), $request->state),
        403,
    );

    $tokens = Http::asForm()->post(config('services.sso.issuer').'/token', [
        'grant_type' => 'authorization_code',
        'client_id' => config('services.sso.client_id'),
        'client_secret' => config('services.sso.client_secret'),
        'code' => $request->string('code')->toString(),
        'redirect_uri' => config('services.sso.redirect_uri'),
        'code_verifier' => session()->pull('oidc.verifier'),
    ])->throw()->json();

    // Validasi signature, iss, aud, exp, dan nonce ID token sebelum membuat session lokal.
    // Simpan refresh token terenkripsi di server; browser hanya menerima cookie session.
    return redirect('/dashboard');
}
```

## 5. Refresh

```php
$tokens = Http::asForm()->post(config('services.sso.issuer').'/token', [
    'grant_type' => 'refresh_token',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'refresh_token' => $encryptedRefreshToken,
])->throw()->json();
```

Ganti refresh token lama secara atomik dengan token baru karena rotasi wajib.

## 6. Logout

Cabut refresh token dari server, hapus session lokal, lalu redirect browser ke RP-initiated logout:

```php
Http::asForm()->post(config('services.sso.issuer').'/revocation', [
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'token' => $refreshToken,
    'token_type_hint' => 'refresh_token',
]);

return redirect(config('services.sso.issuer').'/connect/logout?'.http_build_query([
    'id_token_hint' => $idToken,
    'post_logout_redirect_uri' => config('services.sso.post_logout_uri'),
    'state' => Str::random(40),
]));
```

## 7. Troubleshooting

| Gejala | Periksa |
|---|---|
| `invalid_client` | Secret server, client ID, dan status client. |
| `invalid_grant` | TTL code, exact redirect URI, dan verifier PKCE yang sama. |
| State mismatch | Session/cookie hilang atau callback berasal dari flow lama. |
| Refresh replay | Pastikan hanya satu proses refresh dan update token atomik. |
