/**
 * useMfaEnrollment — placeholder composable UC-49 (Enroll TOTP).
 *
 * Status: ON-HOLD. Implementasi akan dilakukan setelah backend
 * endpoint `/api/mfa/totp/enroll` dan `/api/mfa/totp/verify` ready.
 *
 * Composable ini akan mengemas:
 *   - Generate QR code URI dari backend.
 *   - Verify 6-digit TOTP code.
 *   - Store recovery codes.
 *   - Error handling (invalid code, expired enrollment).
 */

import { computed, ref } from "vue";
import { mfaApi } from "@/services/mfa.api";
import type {
	MfaEnrollmentStatus,
	MfaTotpEnrollResponse,
	MfaTotpVerifyPayload,
	MfaTotpVerifyResponse,
} from "@/types/mfa.types";

export function useMfaEnrollment() {
	const status = ref<MfaEnrollmentStatus | null>(null);
	const enrollData = ref<MfaTotpEnrollResponse | null>(null);
	const recoveryCodes = ref<readonly string[]>([]);
	const pending = ref<boolean>(false);
	const error = ref<string | null>(null);
	const step = ref<"idle" | "scanning" | "verifying" | "recovery" | "complete">(
		"idle",
	);

	const isEnrolled = computed<boolean>(() => status.value?.enrolled ?? false);
	const recoveryCodesRemaining = computed<number>(
		() => status.value?.recovery_codes_remaining ?? 0,
	);

	async function fetchStatus(): Promise<void> {
		await run(async () => {
			status.value = await mfaApi.getStatus();
			step.value = "idle";
		});
	}

	async function startEnrollment(): Promise<void> {
		await run(async () => {
			enrollData.value = await mfaApi.startEnrollment();
			step.value = "scanning";
		});
	}

	async function verifyTotp(
		payload: MfaTotpVerifyPayload,
	): Promise<MfaTotpVerifyResponse> {
		let response: MfaTotpVerifyResponse | null = null;
		await run(async () => {
			response = await mfaApi.verifyTotp(payload);
			recoveryCodes.value = response.recovery_codes ?? [];
			step.value = recoveryCodes.value.length > 0 ? "recovery" : "complete";
			await fetchStatus();
		});

		if (response === null) {
			throw new Error("MFA verification failed.");
		}

		return response;
	}

	async function verifyCode(code: string): Promise<void> {
		await verifyTotp({ code });
	}

	async function remove(password: string): Promise<boolean> {
		return runBoolean(async () => {
			await mfaApi.remove({ password });
			await fetchStatus();
			step.value = "idle";
		});
	}

	async function regenerateCodes(password: string): Promise<boolean> {
		return runBoolean(async () => {
			const response = await mfaApi.regenerateRecoveryCodes({ password });
			recoveryCodes.value = response.recovery_codes;
			step.value = "recovery";
			await fetchStatus();
		});
	}

	function completeSetup(): void {
		recoveryCodes.value = [];
		step.value = "complete";
	}

	async function run(callback: () => Promise<void>): Promise<void> {
		pending.value = true;
		error.value = null;
		try {
			await callback();
		} catch (exception) {
			error.value =
				exception instanceof Error ? exception.message : "Gagal memproses MFA.";
			throw exception;
		} finally {
			pending.value = false;
		}
	}

	async function runBoolean(callback: () => Promise<void>): Promise<boolean> {
		try {
			await run(callback);
			return true;
		} catch {
			return false;
		}
	}

	return {
		status,
		enrollData,
		recoveryCodes,
		pending,
		error,
		step,
		isEnrolled,
		recoveryCodesRemaining,
		fetchStatus,
		startEnrollment,
		verifyTotp,
		verifyCode,
		remove,
		regenerateCodes,
		completeSetup,
	};
}
