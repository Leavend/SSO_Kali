import { describe, expect, it, vi } from "vitest";

const ensureSession = vi.fn();

vi.mock("@/stores/session.store", () => ({
	useSessionStore: () => ({
		ensureSession,
		isAuthenticated: false,
		roles: [],
	}),
}));

describe("frontend router public portal routes", () => {
	it("registers active src/pages portal routes", async () => {
		const router = (await import("../router")).default;

		expect(router.resolve("/").name).toBe("auth.login");
		expect(router.resolve("/auth/register").name).toBe("auth.register");
		expect(router.resolve("/auth/callback").name).toBe("auth.callback");
		expect(router.resolve("/home").name).toBe("portal.home");
		expect(router.resolve("/profile").name).toBe("portal.profile");
		expect(router.resolve("/sessions").name).toBe("portal.sessions");
		expect(router.resolve("/apps").name).toBe("portal.apps");
		expect(router.resolve("/security").name).toBe("portal.security");
	});

	it("does not register legacy web admin routes in active production router", async () => {
		const router = (await import("../router")).default;

		expect(router.resolve("/dashboard").name).toBe("error.not-found");
		expect(router.resolve("/admin/sessions").name).toBe("error.not-found");
		expect(router.resolve("/admin/apps").name).toBe("error.not-found");
	});
});
