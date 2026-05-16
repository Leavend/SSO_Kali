<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
	Activity,
	AppWindow,
	Home,
	LogOut,
	Moon,
	RefreshCcw,
	ShieldCheck,
	Sun,
	UserCircle2,
	UserRound,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/stores/session.store";
import { useThemeStore } from "@/stores/theme.store";

const route = useRoute();
const session = useSessionStore();
const theme = useThemeStore();

const navItems = [
	{ to: "/home", label: "Beranda", icon: Home },
	{ to: "/profile", label: "Profil", icon: UserRound },
	{ to: "/apps", label: "Aplikasi", icon: AppWindow },
	{ to: "/sessions", label: "Sesi Aktif", icon: Activity },
	{ to: "/security", label: "Keamanan", icon: ShieldCheck },
];

const initials = computed(() => {
	const name = session.user?.display_name ?? session.user?.email ?? "";
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((piece) => piece.charAt(0).toUpperCase())
			.join("") || "S"
	);
});

const activePath = computed(() => route.path);
</script>

<template>
  <div data-testid="portal-shell" class="bg-background text-foreground min-h-screen overflow-x-clip">
    <header
      class="bg-background/85 sticky top-0 z-30 border-b backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      <div data-testid="portal-header-inner" class="mx-auto flex h-16 max-w-6xl min-w-0 flex-nowrap items-center gap-4 px-4 sm:px-6">
        <RouterLink to="/home" class="flex items-center gap-2 font-semibold">
          <span
            class="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl shadow-sm"
          >
            <ShieldCheck class="size-5" />
          </span>
          <span class="flex flex-col leading-none">
            <strong class="text-sm font-bold tracking-tight">Dev-SSO</strong>
            <span class="text-muted-foreground text-[11px]">Portal Pengguna</span>
          </span>
        </RouterLink>

        <nav data-testid="portal-primary-nav" class="order-3 hidden w-full flex-wrap items-center gap-1 lg:flex md:order-none md:w-auto md:flex-1 md:justify-center">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="{
              'text-foreground bg-accent': activePath.startsWith(item.to),
            }"
          >
            <component :is="item.icon" class="size-4" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ganti tema"
            @click="theme.toggle"
          >
            <Sun v-if="theme.mode === 'dark'" class="size-4" />
            <Moon v-else class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Muat ulang sesi"
            @click="session.ensureSession"
          >
            <RefreshCcw class="size-4" />
          </Button>
          <div class="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1">
            <Avatar class="size-7">
              <AvatarFallback>{{ initials }}</AvatarFallback>
            </Avatar>
            <div data-testid="portal-account-summary" class="hidden min-w-0 max-w-[8rem] text-xs leading-tight sm:flex sm:flex-col">
              <strong data-testid="portal-account-name" class="truncate font-semibold">{{ session.user?.display_name ?? 'Pengguna' }}</strong>
              <span data-testid="portal-account-email" class="text-muted-foreground truncate">{{ session.user?.email ?? '' }}</span>
            </div>
            <Badge variant="secondary" class="hidden md:inline-flex">
              {{ session.user?.roles?.[0] ?? 'user' }}
            </Badge>
          </div>
          <Button variant="outline" size="icon" aria-label="Keluar" @click="session.logout">
            <LogOut class="size-4" />
          </Button>
        </div>
      </div>
    </header>

    <main id="main" data-testid="portal-main" class="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="border-t py-6 text-center text-xs text-muted-foreground">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
        <span class="flex items-center gap-2">
          <UserCircle2 class="size-4" /> Dev-SSO Portal Pengguna
        </span>
        <span>© {{ new Date().getFullYear() }} Dev-SSO Platform</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
