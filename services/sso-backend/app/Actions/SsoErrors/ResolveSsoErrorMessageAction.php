<?php

declare(strict_types=1);

namespace App\Actions\SsoErrors;

use App\Enums\SsoErrorCode;
use App\Models\SsoErrorMessageTemplate;
use App\Services\SsoErrors\SsoErrorCatalog;
use App\Support\SsoErrors\SsoErrorMessage;
use Illuminate\Support\Facades\Schema;

final class ResolveSsoErrorMessageAction
{
    public function __construct(private readonly SsoErrorCatalog $catalog) {}

    public function execute(SsoErrorCode $code, string $locale = 'id'): SsoErrorMessage
    {
        if (! Schema::hasTable('sso_error_message_templates')) {
            return $this->catalog->message($code);
        }

        $template = SsoErrorMessageTemplate::query()
            ->where('error_code', $code->value)
            ->where('locale', $this->locale($locale))
            ->where('is_enabled', true)
            ->first();

        return $template instanceof SsoErrorMessageTemplate
            ? $this->fromTemplate($template)
            : $this->catalog->message($code);
    }

    private function fromTemplate(SsoErrorMessageTemplate $template): SsoErrorMessage
    {
        return new SsoErrorMessage(
            title: (string) $template->title,
            message: (string) $template->message,
            actionLabel: (string) $template->action_label,
            retryAllowed: (bool) $template->retry_allowed,
            alternativeLoginAllowed: (bool) $template->alternative_login_allowed,
        );
    }

    private function locale(string $locale): string
    {
        return in_array($locale, ['id', 'en'], true) ? $locale : 'id';
    }
}
