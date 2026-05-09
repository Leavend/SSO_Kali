<?php

declare(strict_types=1);

it('locks production hardening code quality guardrails from the backend standard', function (): void {
    $violations = [
        ...files_exceeding_line_limit(quality_php_files(), 500),
        ...admin_controllers_exceeding_line_limit(100),
        ...request_all_usages(),
        ...mutable_static_state_usages(),
    ];

    expect($violations)->toBe([]);
});

it('keeps this quality guardrail wired into root ci', function (): void {
    $ci = quality_file_contents('../../.github/workflows/ci.yml');

    expect($ci)->toContain('ProductionCodeQualityGuardrailEvidenceTest.php');
});

/**
 * @return list<string>
 */
function quality_php_files(): array
{
    return array_values(array_filter([
        ...glob(base_path('app/**/*.php')) ?: [],
        ...glob(base_path('tests/Feature/DevOps/*.php')) ?: [],
    ], 'is_file'));
}

/**
 * @param  list<string>  $files
 * @return list<string>
 */
function files_exceeding_line_limit(array $files, int $limit): array
{
    return array_values(array_filter(array_map(
        fn (string $path): ?string => line_count($path) > $limit
            ? relative_quality_path($path).' exceeds '.$limit.' lines'
            : null,
        $files,
    )));
}

/**
 * @return list<string>
 */
function admin_controllers_exceeding_line_limit(int $limit): array
{
    $files = glob(base_path('app/Http/Controllers/Admin/*.php')) ?: [];

    return files_exceeding_line_limit($files, $limit);
}

/**
 * @return list<string>
 */
function request_all_usages(): array
{
    return forbidden_pattern_usages([
        base_path('app/Http/Controllers'),
        base_path('app/Http/Requests'),
    ], '/(request\(\)->all|\$request->all|Request::all)/');
}

/**
 * @return list<string>
 */
function mutable_static_state_usages(): array
{
    return forbidden_pattern_usages([
        base_path('app/Services/Admin'),
        base_path('app/Services/Oidc'),
        base_path('app/Services/ExternalIdp'),
        base_path('app/Actions/Admin'),
        base_path('app/Actions/Oidc'),
        base_path('app/Actions/ExternalIdp'),
    ], '/\b(public|protected|private)\s+static\s+(?!function)/');
}

/**
 * @param  list<string>  $directories
 * @return list<string>
 */
function forbidden_pattern_usages(array $directories, string $pattern): array
{
    $violations = [];

    foreach (php_files_in($directories) as $path) {
        foreach (file($path) ?: [] as $index => $line) {
            if (preg_match($pattern, $line) === 1) {
                $violations[] = relative_quality_path($path).':'.($index + 1);
            }
        }
    }

    return $violations;
}

/**
 * @param  list<string>  $directories
 * @return list<string>
 */
function php_files_in(array $directories): array
{
    $files = [];

    foreach ($directories as $directory) {
        if (! is_dir($directory)) {
            continue;
        }

        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory));

        foreach ($iterator as $file) {
            if ($file instanceof SplFileInfo && $file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }
    }

    return $files;
}

function line_count(string $path): int
{
    return count(file($path) ?: []);
}

function relative_quality_path(string $path): string
{
    return str_replace(base_path().DIRECTORY_SEPARATOR, '', $path);
}

function quality_file_contents(string $relativePath): string
{
    $path = base_path($relativePath);

    if (! is_file($path)) {
        $path = dirname(base_path(), 2).DIRECTORY_SEPARATOR.ltrim($relativePath, './');
    }

    return (string) file_get_contents($path);
}
