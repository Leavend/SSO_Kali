<?php

declare(strict_types=1);

namespace App\Actions\SsoErrors;

use App\Enums\SsoErrorCode;
use App\Models\SsoErrorMessageTemplate;
use App\Services\SsoErrors\SsoErrorCatalog;

final class ManageSsoErrorTemplateAction
{
    public function __construct(private readonly SsoErrorCatalog $catalog) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function list(string $locale = 'id'): array
    {
        return array_map(
            fn (SsoErrorCode $code): array => $this->templatePayload($code, $this->locale($locale)),
            SsoErrorCode::cases(),
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function show(string $errorCode, string $locale = 'id'): ?array
    {
        $code = SsoErrorCode::tryFrom($errorCode);

        return $code instanceof SsoErrorCode ? $this->templatePayload($code, $this->locale($locale)) : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>|null
     */
    public function update(string $errorCode, array $payload, ?string $updatedBy): ?array
    {
        $code = SsoErrorCode::tryFrom($errorCode);
        if (! $code instanceof SsoErrorCode) {
            return null;
        }

        $template = SsoErrorMessageTemplate::query()->updateOrCreate(
            ['error_code' => $code->value, 'locale' => (string) $payload['locale']],
            [...$payload, 'updated_by' => $updatedBy]
        );

        return $this->modelPayload($template);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function reset(string $errorCode, string $locale, ?string $updatedBy): ?array
    {
        $code = SsoErrorCode::tryFrom($errorCode);
        if (! $code instanceof SsoErrorCode) {
            return null;
        }

        $template = SsoErrorMessageTemplate::query()->updateOrCreate(
            ['error_code' => $code->value, 'locale' => $this->locale($locale)],
            [...$this->defaultPayload($code), 'is_enabled' => false, 'updated_by' => $updatedBy]
        );

        return $this->modelPayload($template);
    }

    /**
     * @return array<string, mixed>
     */
    private function templatePayload(SsoErrorCode $code, string $locale): array
    {
        $template = SsoErrorMessageTemplate::query()
            ->where('error_code', $code->value)
            ->where('locale', $locale)
            ->first();

        return $template instanceof SsoErrorMessageTemplate
            ? $this->modelPayload($template)
            : ['error_code' => $code->value, 'locale' => $locale, ...$this->defaultPayload($code), 'is_enabled' => false];
    }

    /**
     * @return array<string, mixed>
     */
    private function defaultPayload(SsoErrorCode $code): array
    {
        $message = $this->catalog->message($code);

        return [
            'title' => $message->title,
            'message' => $message->message,
            'action_label' => $message->actionLabel,
            'action_url' => null,
            'retry_allowed' => $message->retryAllowed,
            'alternative_login_allowed' => $message->alternativeLoginAllowed,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function modelPayload(SsoErrorMessageTemplate $template): array
    {
        return [
            'error_code' => $template->error_code,
            'locale' => $template->locale,
            'title' => $template->title,
            'message' => $template->message,
            'action_label' => $template->action_label,
            'action_url' => $template->action_url,
            'retry_allowed' => $template->retry_allowed,
            'alternative_login_allowed' => $template->alternative_login_allowed,
            'is_enabled' => $template->is_enabled,
        ];
    }

    private function locale(string $locale): string
    {
        return in_array($locale, ['id', 'en'], true) ? $locale : 'id';
    }
}
