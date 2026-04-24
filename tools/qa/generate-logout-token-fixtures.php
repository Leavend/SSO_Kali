<?php

declare(strict_types=1);

const EVENT_NAME = 'http://schemas.openid.net/event/backchannel-logout';
const DEFAULT_KID = 'broker-kid';
const PRIVATE_KEY = <<<'PEM'
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

exit(main($argv));

function main(array $argv): int
{
    $outputDir = resolveOutputDir($argv);
    $fixtures = buildFixtures(configValues());

    ensureDirectory($outputDir);
    persistFixtures($outputDir, $fixtures);
    fwrite(STDOUT, sprintf("Generated %d logout token fixtures in %s\n", count($fixtures), $outputDir));

    return 0;
}

/**
 * @return array{issuer: string, audience: string, subject: string, sid: string}
 */
function configValues(): array
{
    return [
        'issuer' => envValue('LOGOUT_FIXTURE_ISSUER', 'http://sso.example'),
        'audience' => envValue('LOGOUT_FIXTURE_AUDIENCE', 'prototype-app-b'),
        'subject' => envValue('LOGOUT_FIXTURE_SUBJECT', 'subject-123'),
        'sid' => envValue('LOGOUT_FIXTURE_SID', 'shared-sid'),
    ];
}

function envValue(string $name, string $fallback): string
{
    $value = getenv($name);

    return is_string($value) && $value !== '' ? $value : $fallback;
}

function resolveOutputDir(array $argv): string
{
    if (isset($argv[1]) && is_string($argv[1]) && $argv[1] !== '') {
        return $argv[1];
    }

    return getcwd().'/test-results/logout-token-fixtures';
}

function ensureDirectory(string $outputDir): void
{
    if (is_dir($outputDir)) {
        return;
    }

    mkdir($outputDir, 0777, true);
}

/**
 * @param array{issuer: string, audience: string, subject: string, sid: string} $config
 * @return array<string, array{claims: array<string, mixed>, token: string}>
 */
function buildFixtures(array $config): array
{
    $now = time();
    $scenarios = ['valid', 'expired', 'missing-exp', 'missing-events', 'nonce-present', 'replay-a', 'replay-b'];
    $fixtures = [];

    foreach ($scenarios as $scenario) {
        $claims = claimsForScenario($scenario, $config, $now);
        $fixtures[$scenario] = ['claims' => $claims, 'token' => signJwt($claims)];
    }

    return $fixtures;
}

/**
 * @param array{issuer: string, audience: string, subject: string, sid: string} $config
 * @return array<string, mixed>
 */
function claimsForScenario(string $scenario, array $config, int $now): array
{
    return match ($scenario) {
        'expired' => expiredClaims($config, $now),
        'missing-exp' => withoutClaim(baseClaims($config, $now), 'exp'),
        'missing-events' => withoutClaim(baseClaims($config, $now), 'events'),
        'nonce-present' => withClaim(baseClaims($config, $now), 'nonce', 'forbidden'),
        'replay-a', 'replay-b' => withClaim(baseClaims($config, $now), 'jti', 'logout-jti-replay'),
        default => baseClaims($config, $now),
    };
}

/**
 * @param array{issuer: string, audience: string, subject: string, sid: string} $config
 * @return array<string, mixed>
 */
function baseClaims(array $config, int $now): array
{
    return [
        'iss' => $config['issuer'],
        'aud' => $config['audience'],
        'sub' => $config['subject'],
        'sid' => $config['sid'],
        'jti' => 'logout-jti-default',
        'events' => [EVENT_NAME => new stdClass()],
        'iat' => $now,
        'exp' => $now + 300,
    ];
}

/**
 * @param array<string, mixed> $claims
 * @return array<string, mixed>
 */
function withoutClaim(array $claims, string $claim): array
{
    unset($claims[$claim]);

    return $claims;
}

/**
 * @param array<string, mixed> $claims
 * @param mixed $value
 * @return array<string, mixed>
 */
function withClaim(array $claims, string $claim, mixed $value): array
{
    $claims[$claim] = $value;

    return $claims;
}

/**
 * @param array{issuer: string, audience: string, subject: string, sid: string} $config
 * @return array<string, mixed>
 */
function expiredClaims(array $config, int $now): array
{
    return withClaim(withClaim(baseClaims($config, $now), 'iat', $now - 600), 'exp', $now - 300);
}

/**
 * @param array<string, mixed> $claims
 */
function signJwt(array $claims): string
{
    $header = ['typ' => 'JWT', 'alg' => 'RS256', 'kid' => DEFAULT_KID];
    $payload = encodeSegment($header).'.'.encodeSegment($claims);

    openssl_sign($payload, $signature, PRIVATE_KEY, OPENSSL_ALGO_SHA256);

    return $payload.'.'.base64UrlEncode($signature);
}

/**
 * @param array<string, mixed> $value
 */
function encodeSegment(array $value): string
{
    return base64UrlEncode(json_encode($value, JSON_THROW_ON_ERROR));
}

function base64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

/**
 * @param array<string, array{claims: array<string, mixed>, token: string}> $fixtures
 */
function persistFixtures(string $outputDir, array $fixtures): void
{
    foreach ($fixtures as $scenario => $fixture) {
        file_put_contents($outputDir.'/'.$scenario.'.jwt', $fixture['token']);
    }

    file_put_contents($outputDir.'/manifest.json', manifest($fixtures));
}

/**
 * @param array<string, array{claims: array<string, mixed>, token: string}> $fixtures
 */
function manifest(array $fixtures): string
{
    $manifest = [];

    foreach ($fixtures as $scenario => $fixture) {
        $manifest[] = summarizeFixture($scenario, $fixture['claims'], $fixture['token']);
    }

    return json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

/**
 * @param array<string, mixed> $claims
 * @return array<string, mixed>
 */
function summarizeFixture(string $scenario, array $claims, string $token): array
{
    return [
        'scenario' => $scenario,
        'token_file' => $scenario.'.jwt',
        'sha256' => hash('sha256', $token),
        'has_events' => array_key_exists('events', $claims),
        'has_nonce' => array_key_exists('nonce', $claims),
        'exp' => $claims['exp'] ?? null,
        'iat' => $claims['iat'] ?? null,
        'jti' => $claims['jti'] ?? null,
    ];
}
