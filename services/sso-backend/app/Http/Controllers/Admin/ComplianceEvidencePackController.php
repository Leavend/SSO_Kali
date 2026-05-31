<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Admin\AdminAuditIntegrityVerifier;
use App\Services\Admin\AdminRetentionStatusService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use ZipArchive;

final class ComplianceEvidencePackController
{
    public function __invoke(
        Request $request,
        AdminAuditIntegrityVerifier $integrity,
        AdminRetentionStatusService $retention,
    ): Response|StreamedResponse {
        $filters = $request->validate([
            'format' => ['nullable', 'in:json,zip'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'correlation_id' => ['nullable', 'string', 'max:128'],
        ]);

        $payload = [
            'generated_at' => now()->toIso8601String(),
            'filters' => array_filter($filters, static fn (mixed $value): bool => $value !== null && $value !== ''),
            'integrity' => $integrity->verify(),
            'retention' => $retention->summary(),
        ];

        if (($filters['format'] ?? 'zip') === 'json' || ! class_exists(ZipArchive::class)) {
            return response($this->json($payload), Response::HTTP_OK, $this->downloadHeaders('application/json; charset=UTF-8', 'compliance-evidence-pack.json'));
        }

        return $this->zipResponse($payload);
    }

    /** @param array<string, mixed> $payload */
    private function zipResponse(array $payload): StreamedResponse
    {
        $archive = tempnam(sys_get_temp_dir(), 'sso-evidence-pack-');
        if ($archive === false) {
            return response()->stream(static fn (): null => null, Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $zip = new ZipArchive;
        $zip->open($archive, ZipArchive::OVERWRITE);
        $zip->addFromString('evidence-pack.json', $this->json($payload));
        $zip->close();

        return response()->streamDownload(function () use ($archive): void {
            readfile($archive);
            @unlink($archive);
        }, 'compliance-evidence-pack.zip', [
            'Content-Type' => 'application/zip',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function json(array $payload): string
    {
        return json_encode($payload, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n";
    }

    /** @return array<string, string> */
    private function downloadHeaders(string $contentType, string $filename): array
    {
        return [
            'Content-Type' => $contentType,
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ];
    }
}
