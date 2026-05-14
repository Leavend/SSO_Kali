import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const sourceAlias = (path: string): string =>
	fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": sourceAlias("./src"),
			"@shared": sourceAlias("./src/shared"),
			"@parent-ui": sourceAlias("../../packages/dev-sso-parent-ui"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.{test,spec}.ts"],
		alias: {
			"@/components/FloatingActions.vue": sourceAlias(
				"./src/web/components/FloatingActions.vue",
			),
			"@/components/auth/AuthFooter.vue": sourceAlias(
				"./src/web/components/auth/AuthFooter.vue",
			),
			"@/components/auth/AuthShell.vue": sourceAlias(
				"./src/web/components/auth/AuthShell.vue",
			),
			"@/components/layout/AdminHeader.vue": sourceAlias(
				"./src/web/components/layout/AdminHeader.vue",
			),
			"@/components/layout/BottomNav.vue": sourceAlias(
				"./src/web/components/layout/BottomNav.vue",
			),
			"@/components/layout/CommandPalette.vue": sourceAlias(
				"./src/web/components/layout/CommandPalette.vue",
			),
			"@/components/PageHeader.vue": sourceAlias(
				"./src/web/components/PageHeader.vue",
			),
			"@/components/ScrollToTop.vue": sourceAlias(
				"./src/web/components/ScrollToTop.vue",
			),
			"@/components/StatusPanel.vue": sourceAlias(
				"./src/web/components/StatusPanel.vue",
			),
			"@/components/ThemeToggle.vue": sourceAlias(
				"./src/web/components/ThemeToggle.vue",
			),
			"@/components/ui/Badge.vue": sourceAlias(
				"./src/web/components/ui/Badge.vue",
			),
			"@/components/ui/BulkActionBar.vue": sourceAlias(
				"./src/web/components/ui/BulkActionBar.vue",
			),
			"@/components/ui/ConfirmDialog.vue": sourceAlias(
				"./src/web/components/ui/ConfirmDialog.vue",
			),
			"@/components/ui/DashboardSurface.vue": sourceAlias(
				"./src/web/components/ui/DashboardSurface.vue",
			),
			"@/components/ui/DataTable.vue": sourceAlias(
				"./src/web/components/ui/DataTable.vue",
			),
			"@/components/ui/FilterBar.vue": sourceAlias(
				"./src/web/components/ui/FilterBar.vue",
			),
			"@/components/ui/SlideOver.vue": sourceAlias(
				"./src/web/components/ui/SlideOver.vue",
			),
			"@/components/ui/TablePagination.vue": sourceAlias(
				"./src/web/components/ui/TablePagination.vue",
			),
			"@/components/ui/ToastContainer.vue": sourceAlias(
				"./src/web/components/ui/ToastContainer.vue",
			),
			"@/stores/admin": sourceAlias("./src/web/stores/admin.ts"),
			"@/stores/session": sourceAlias("./src/web/stores/session.ts"),
			"@/views/AppsView.vue": sourceAlias("./src/web/views/AppsView.vue"),
			"@/views/ConnectedAppsView.vue": sourceAlias(
				"./src/web/views/ConnectedAppsView.vue",
			),
			"@/views/ConsentView.vue": sourceAlias("./src/web/views/ConsentView.vue"),
			"@/views/DashboardView.vue": sourceAlias(
				"./src/web/views/DashboardView.vue",
			),
			"@/views/HomeView.vue": sourceAlias("./src/web/views/HomeView.vue"),
			"@/views/LegalView.vue": sourceAlias("./src/web/views/LegalView.vue"),
			"@/views/LoginView.vue": sourceAlias("./src/web/views/LoginView.vue"),
			"@/views/MySessionsView.vue": sourceAlias(
				"./src/web/views/MySessionsView.vue",
			),
			"@/views/NotFoundView.vue": sourceAlias(
				"./src/web/views/NotFoundView.vue",
			),
			"@/views/ProfileView.vue": sourceAlias("./src/web/views/ProfileView.vue"),
			"@/views/SecurityView.vue": sourceAlias(
				"./src/web/views/SecurityView.vue",
			),
			"@/views/SessionsView.vue": sourceAlias(
				"./src/web/views/SessionsView.vue",
			),
			"@/views/StatusView.vue": sourceAlias("./src/web/views/StatusView.vue"),
			"@/views/UserDetailView.vue": sourceAlias(
				"./src/web/views/UserDetailView.vue",
			),
			"@/views/UsersView.vue": sourceAlias("./src/web/views/UsersView.vue"),
		},
		exclude: [
			".next/**",
			".codex-temp/**",
			"out/**",
			"build/**",
			"dist/**",
			"coverage/**",
			"node_modules/**",
			"test-results/**",
			"e2e/**",
			"src/web/**/*.spec.ts",
			"src/__tests__/admin-auth-boundary.test.ts",
			"src/components/molecules/__tests__/SessionCard.spec.ts",
			"src/components/organisms/__tests__/PortalHeader.spec.ts",
			"src/layouts/__tests__/PortalLayout.spec.ts",
			"src/pages/portal/__tests__/ConnectedAppsPage.spec.ts",
			"src/pages/portal/__tests__/SecurityPage.spec.ts",
			"src/pages/portal/__tests__/SessionsPage.spec.ts",
		],
		globals: true,
	},
});
