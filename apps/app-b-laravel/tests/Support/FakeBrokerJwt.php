<?php

declare(strict_types=1);

namespace Tests\Support;

use Firebase\JWT\JWT;

final class FakeBrokerJwt
{
    private const PRIVATE_KEY = <<<'PEM'
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC51JkZm5Nr2P4s
2LXoLtaJ4R+VnGNJFN94jXn5aHfjq8wx4tozV+R0EjNXBbPhpk6elkCvz9kz8xYM
O30jQGZT6CZolgU7ZKvKqdu+Gutnd0wvm29mN1fAu8Dc0UPFgbThhY1UVygLgnVR
+WP5g4rkCDEorZjk+wGMB0xb/VFxLuM+dLEa2Nh326SW3hgzVyyfgoNNe8Xv7c1t
15Y6Mu1Tam/boiARo0V593lX1h6Qg61a5b9y8oUQjihyfjB16br7e3/zVYassr87
nMyJgN2ep78VDNxrdsmtwtOaRJ/esMreCxNAee994hF9k5QGsXHe5H/vulzeW3JA
QD6NHis7AgMBAAECggEAO9ChwytfpXxAPGE5FFZXOiRbjUW8c56jW+N2GoC07nSz
Em+pupMU9wOQwPcV8pEch1Fn2u91Q5KAS0muuvUUuvdjvZBkeLyry10nXSa/FRvC
SySmE+nGdkQ5DRrSzLU2as0ZM8emHSZN6yfyNTNRNpsob6aJK1NcKR2ER6vfViWr
xMAv/wm3pjdaK77hsiBAdamrrdtMoPWEQ5dZAsHcrqIEmnmcjDddSeZfbrvlmtey
RtmpaoLhgr4r2TXVf9Qyi0jXb5CL+7tkAZBB+DPtFAUclswAFIwjYeUOjSOmw1Ro
GC+J5fecnmLbhLc1yf3+3TRl37JcQyubQAGR2r99MQKBgQDpd6OI24EUVogNnDgz
lheXcjvSKAuQLlyvWKENtaOiU3/YsR6SnViDC4JI9IZppqx4u/uTm6ef9WXB1cPb
6H08kqynuABn5S+0yqg2LKUHmZM96OpRi4gSQ30uWFH2jgw+4RlVMW/Zoa6c4lLm
k7WPA/UEm3plAUUhFBhCUs+MqQKBgQDLw/pS/HeW47nvv+lDryxaVR2b4NkqKdu2
UobTu5u25zlfLb1E4rb3YDPb8oHVq6d/yCoP1Hk3V2DfZJrLHwGAg+C2LKYO0VM0
nOhDZflMO7AZfLVAPxW7stZkrov1jQoatRgQx+T61ZG2s7WJehLfaAIlM6afoaxI
j5jok49jQwKBgQDb8OWTDJcxvcM2bzFTB9b5yZgph6g9EDAo0GoJLFEXn2oVjear
YKf97F20tQfbiDV7GD0M9dqYiupuDSASj5dL9THKX0GinvquayzEvJJL8pYQANie
McDi08meW337tB49LnpbE9O3RuXkziIjLowgSy4MRRytAuFJJFEmSjVU4QKBgBDQ
ezed3cB1ykIedAFB00cg/vB9/W2dRqQk6ztNn+vX6MQR4ixtCOwg5CaiPFSFdaz1
t4LW5anLbBMDGkLorBcOytw9kvZmD5en2wK0x32i70UrJUnH6uMyPr7QKHx6xvqt
Nu8rj5mjRgLtkW1mxWfqDUNEn9tMXAsgzl1iz9JBAoGBALMaIuG/m3pENLiB3UHr
rzhz3aDcNyBECeN+rP1UZAceuZ5UcNkPO6npyuIPqH06gxuZCrDkPMu5JHoy2ol3
CblYYsPI3MiZ9QxG7+hjj9KGhYuyFwONu76QrcWJGrZZspsRMQoY8pbOOPYme1Gy
UdoH2sa5F0/pP0uk3nCEAHLn
-----END PRIVATE KEY-----
PEM;

    /**
     * @return array<string, mixed>
     */
    public static function jwks(string $kid = 'broker-kid'): array
    {
        return [
            'keys' => [[
                'kty' => 'RSA',
                'use' => 'sig',
                'kid' => $kid,
                'alg' => 'RS256',
                'n' => 'udSZGZuTa9j-LNi16C7WieEflZxjSRTfeI15-Wh346vMMeLaM1fkdBIzVwWz4aZOnpZAr8_ZM_MWDDt9I0BmU-gmaJYFO2SryqnbvhrrZ3dML5tvZjdXwLvA3NFDxYG04YWNVFcoC4J1Uflj-YOK5AgxKK2Y5PsBjAdMW_1RcS7jPnSxGtjYd9uklt4YM1csn4KDTXvF7-3NbdeWOjLtU2pv26IgEaNFefd5V9YekIOtWuW_cvKFEI4ocn4wdem6-3t_81WGrLK_O5zMiYDdnqe_FQzca3bJrcLTmkSf3rDK3gsTQHnvfeIRfZOUBrFx3uR_77pc3ltyQEA-jR4rOw',
                'e' => 'AQAB',
            ]],
        ];
    }

    public static function accessToken(array $overrides = [], string $kid = 'broker-kid'): string
    {
        return self::encode(array_replace(self::accessClaims(), $overrides), $kid);
    }

    public static function idToken(string $nonce, array $overrides = [], string $kid = 'broker-kid'): string
    {
        return self::encode(array_replace(self::idClaims($nonce), $overrides), $kid);
    }

    public static function logoutToken(array $overrides = [], string $kid = 'broker-kid'): string
    {
        return self::encode(array_replace(self::logoutClaims(), $overrides), $kid);
    }

    public static function expiredLogoutToken(array $overrides = [], string $kid = 'broker-kid'): string
    {
        return self::logoutToken(array_replace([
            'iat' => time() - 600,
            'exp' => time() - 300,
        ], $overrides), $kid);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    public static function algorithmToken(array $claims, string $algorithm): string
    {
        $header = ['typ' => 'JWT', 'alg' => $algorithm];

        return sprintf(
            '%s.%s.%s',
            self::encodeSegment($header),
            self::encodeSegment($claims),
            $algorithm === 'none' ? '' : 'signature',
        );
    }

    public static function tampered(string $token): string
    {
        $parts = explode('.', $token);
        $parts[2] = self::mutate();

        return implode('.', $parts);
    }

    /**
     * @return array<string, mixed>
     */
    private static function accessClaims(): array
    {
        return [
            'iss' => 'http://sso.example',
            'aud' => 'sso-resource-api',
            'sub' => 'subject-123',
            'sid' => 'shared-sid',
            'client_id' => 'prototype-app-b',
            'token_use' => 'access',
            'email' => 'ada@example.com',
            'name' => 'Ada Lovelace',
            'iat' => time(),
            'exp' => time() + 300,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function idClaims(string $nonce): array
    {
        return [
            'iss' => 'http://sso.example',
            'aud' => 'prototype-app-b',
            'sub' => 'subject-123',
            'nonce' => $nonce,
            'token_use' => 'id',
            'iat' => time(),
            'exp' => time() + 300,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function logoutClaims(): array
    {
        return [
            'iss' => 'http://sso.example',
            'aud' => 'prototype-app-b',
            'sub' => 'subject-123',
            'sid' => 'shared-sid',
            'jti' => 'logout-jti-default',
            'events' => [
                'http://schemas.openid.net/event/backchannel-logout' => [],
            ],
            'iat' => time(),
            'exp' => time() + 300,
        ];
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private static function encode(array $claims, string $kid = 'broker-kid'): string
    {
        return JWT::encode($claims, self::PRIVATE_KEY, 'RS256', $kid);
    }

    private static function mutate(): string
    {
        return 'invalid-signature';
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private static function encodeSegment(array $value): string
    {
        return rtrim(strtr(base64_encode(json_encode($value, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    }
}
