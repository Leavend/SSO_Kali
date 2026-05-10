<?php

declare(strict_types=1);

namespace App\Services\SsoErrors;

use App\Enums\SsoErrorCode;
use App\Support\SsoErrors\SsoErrorMessage;

final class SsoErrorCatalog
{
    public function message(SsoErrorCode $code): SsoErrorMessage
    {
        return match ($code) {
            SsoErrorCode::InvalidGrant => $this->entry('Sesi Kedaluwarsa', 'Sesi autentikasi kedaluwarsa atau tidak valid. Silakan login ulang.', 'Login ulang'),
            SsoErrorCode::InvalidRequest => $this->entry('Permintaan Tidak Valid', 'Permintaan login tidak valid. Coba ulang dari aplikasi asal.', 'Coba ulang'),
            SsoErrorCode::AccessDenied => $this->entry('Akses Ditolak', 'Akses ditolak atau persetujuan aplikasi dibatalkan.', 'Kembali ke aplikasi'),
            SsoErrorCode::LoginRequired => $this->entry('Login Diperlukan', 'Silakan login untuk melanjutkan proses autentikasi.', 'Login'),
            SsoErrorCode::InteractionRequired => $this->entry('Konfirmasi Diperlukan', 'Proses ini memerlukan interaksi tambahan sebelum dapat dilanjutkan.', 'Lanjutkan'),
            SsoErrorCode::TemporarilyUnavailable => $this->entry('Layanan Sementara Tidak Tersedia', 'Layanan login sedang tidak tersedia. Coba lagi atau gunakan metode login alternatif.', 'Coba lagi', true, true),
            SsoErrorCode::NetworkError => $this->entry('Koneksi Bermasalah', 'Koneksi ke penyedia identitas gagal. Coba lagi atau gunakan metode login alternatif.', 'Coba lagi', true, true),
            SsoErrorCode::ServerError => $this->entry('Kendala Sistem', 'Terjadi kendala sistem. Hubungi administrator dengan kode referensi yang ditampilkan.', 'Hubungi admin'),
            SsoErrorCode::ConfigurationError => $this->entry('Konfigurasi Bermasalah', 'Konfigurasi login belum siap. Hubungi administrator dengan kode referensi.', 'Hubungi admin'),
            SsoErrorCode::SessionExpired => $this->entry('Session Berakhir', 'Session login Anda sudah berakhir. Silakan login ulang.', 'Login ulang'),
            SsoErrorCode::CsrfFailed => $this->entry('Validasi Keamanan Gagal', 'Permintaan tidak dapat diverifikasi. Muat ulang halaman lalu coba lagi.', 'Muat ulang'),
        };
    }

    private function entry(
        string $title,
        string $message,
        string $actionLabel,
        bool $retryAllowed = false,
        bool $alternativeLoginAllowed = false,
    ): SsoErrorMessage {
        return new SsoErrorMessage($title, $message, $actionLabel, $retryAllowed, $alternativeLoginAllowed);
    }
}
