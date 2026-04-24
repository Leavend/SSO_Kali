<?php

declare(strict_types=1);

exit(main($argv));

/**
 * @param list<string> $argv
 */
function main(array $argv): int
{
    $root = dirname(__DIR__, 2);
    $reportPath = resolveReportPath($argv, $root);
    $policy = loadPolicy($root);
    $checks = buildChecks($root, $policy);

    writeReport($reportPath, $checks, $policy);
    printSummary($checks, $reportPath);

    return allChecksPassed($checks) ? 0 : 1;
}

/**
 * @param list<string> $argv
 */
function resolveReportPath(array $argv, string $root): string
{
    if (isset($argv[1]) && $argv[1] !== '') {
        return $argv[1];
    }

    return $root.'/test-results/argon2id-secret-policy/argon2id-secret-policy-report.json';
}

/**
 * @return array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}}
 */
function loadPolicy(string $root): array
{
    $content = file_get_contents($root.'/docs/security/argon2id-parameters.json');

    return json_decode((string) $content, true, 512, JSON_THROW_ON_ERROR);
}

/**
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 * @return list<array{name:string,ok:bool,details:array<string,mixed>}>
 */
function buildChecks(string $root, array $policy): array
{
    return [
        checkPolicyShape($policy),
        checkBrokerConfigBinding($root),
        checkBackendExampleHash($root, $policy),
        checkComposeBinding($root),
        checkRuntimeHashEnv($policy),
    ];
}

/**
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function checkPolicyShape(array $policy): array
{
    $ok = $policy['algorithm'] === 'argon2id'
        && $policy['memory_cost_kib'] >= $policy['owasp_minimum']['memory_cost_kib']
        && $policy['time_cost'] >= $policy['owasp_minimum']['time_cost']
        && $policy['threads'] >= $policy['owasp_minimum']['threads'];

    return result('policy_file', $ok, [
        'algorithm' => $policy['algorithm'],
        'memory_cost_kib' => $policy['memory_cost_kib'],
        'time_cost' => $policy['time_cost'],
        'threads' => $policy['threads'],
    ]);
}

/**
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function checkBrokerConfigBinding(string $root): array
{
    $path = $root.'/services/sso-backend/config/oidc_clients.php';
    $content = (string) file_get_contents($path);
    $usesHashBinding = str_contains($content, "env('APP_B_CLIENT_SECRET_HASH'");
    $usesPlaintextBinding = str_contains($content, "env('APP_B_CLIENT_SECRET'");

    return result('broker_config_binding', $usesHashBinding && ! $usesPlaintextBinding, [
        'path' => $path,
        'uses_hash_binding' => $usesHashBinding,
        'uses_plaintext_binding' => $usesPlaintextBinding,
    ]);
}

/**
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function checkBackendExampleHash(string $root, array $policy): array
{
    $path = $root.'/services/sso-backend/.env.example';
    $hash = extractEnvValue($path, 'APP_B_CLIENT_SECRET_HASH');
    $error = validateHash($hash, $policy);

    return result('backend_env_example_hash', $error === null, [
        'path' => $path,
        'has_hash' => $hash !== null,
        'error' => $error,
    ]);
}

/**
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function checkComposeBinding(string $root): array
{
    $path = $root.'/docker-compose.dev.yml';
    $content = (string) file_get_contents($path);
    $ok = str_contains($content, 'APP_B_CLIENT_SECRET_HASH: ${APP_B_CLIENT_SECRET_HASH}');

    return result('compose_binding', $ok, ['path' => $path]);
}

/**
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function checkRuntimeHashEnv(array $policy): array
{
    $hash = getenv('APP_B_CLIENT_SECRET_HASH');

    if (! is_string($hash) || $hash === '') {
        return result('runtime_hash_env', true, ['skipped' => true]);
    }

    return result('runtime_hash_env', validateHash($hash, $policy) === null, [
        'skipped' => false,
        'error' => validateHash($hash, $policy),
    ]);
}

function extractEnvValue(string $path, string $key): ?string
{
    $content = (string) file_get_contents($path);
    $pattern = '/^'.preg_quote($key, '/').'=(.+)$/m';

    if (! preg_match($pattern, $content, $matches)) {
        return null;
    }

    return trim((string) $matches[1]);
}

/**
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 */
function validateHash(?string $hash, array $policy): ?string
{
    if (! is_string($hash) || $hash === '') {
        return 'missing_hash';
    }

    if (! str_starts_with($hash, '$argon2id$')) {
        return 'hash_must_use_argon2id';
    }

    $info = password_get_info($hash);

    return validateInfo($info, $policy);
}

/**
 * @param array{algoName:mixed,options:mixed} $info
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 */
function validateInfo(array $info, array $policy): ?string
{
    if (($info['algoName'] ?? null) !== 'argon2id') {
        return 'hash_algorithm_mismatch';
    }

    $options = is_array($info['options'] ?? null) ? $info['options'] : [];

    return firstPolicyError($options, $policy);
}

/**
 * @param array<string,mixed> $options
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 */
function firstPolicyError(array $options, array $policy): ?string
{
    $checks = [
        'memory_cost_kib' => (int) ($options['memory_cost'] ?? 0) >= $policy['owasp_minimum']['memory_cost_kib'],
        'time_cost' => (int) ($options['time_cost'] ?? 0) >= $policy['owasp_minimum']['time_cost'],
        'threads' => (int) ($options['threads'] ?? 0) >= $policy['owasp_minimum']['threads'],
    ];

    foreach ($checks as $key => $ok) {
        if (! $ok) {
            return $key.'_below_policy';
        }
    }

    return null;
}

/**
 * @param array<string,mixed> $details
 * @return array{name:string,ok:bool,details:array<string,mixed>}
 */
function result(string $name, bool $ok, array $details): array
{
    return ['name' => $name, 'ok' => $ok, 'details' => $details];
}

/**
 * @param list<array{name:string,ok:bool,details:array<string,mixed>}> $checks
 * @param array{algorithm:string,memory_cost_kib:int,time_cost:int,threads:int,owasp_minimum:array{memory_cost_kib:int,time_cost:int,threads:int}} $policy
 */
function writeReport(string $path, array $checks, array $policy): void
{
    $directory = dirname($path);

    if (! is_dir($directory)) {
        mkdir($directory, 0777, true);
    }

    $report = ['policy' => $policy, 'checks' => $checks];
    file_put_contents($path, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

/**
 * @param list<array{name:string,ok:bool,details:array<string,mixed>}> $checks
 */
function printSummary(array $checks, string $reportPath): void
{
    foreach ($checks as $check) {
        $status = $check['ok'] ? 'OK' : 'FAIL';
        fwrite(STDOUT, sprintf("[%s] %s\n", $status, $check['name']));
    }

    fwrite(STDOUT, sprintf("Report: %s\n", $reportPath));
}

/**
 * @param list<array{name:string,ok:bool,details:array<string,mixed>}> $checks
 */
function allChecksPassed(array $checks): bool
{
    foreach ($checks as $check) {
        if (! $check['ok']) {
            return false;
        }
    }

    return true;
}
