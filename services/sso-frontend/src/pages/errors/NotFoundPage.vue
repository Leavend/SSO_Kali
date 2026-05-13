<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
</script>

<template>
  <Card>
    <CardHeader class="items-center text-center">
      <span class="bg-destructive/15 text-destructive grid size-10 place-items-center rounded-full">
        <AlertTriangle class="size-5" />
      </span>
      <CardTitle class="text-xl">404 — Halaman tidak ditemukan</CardTitle>
      <CardDescription>URL tidak terdaftar di portal. Kembali ke beranda atau login.</CardDescription>
    </CardHeader>
    <CardContent class="flex justify-center gap-3">
      <Button as-child variant="default">
        <router-link to="/home">Beranda</router-link>
      </Button>
      <Button as-child variant="outline">
        <router-link to="/">Login</router-link>
      </Button>
    </CardContent>
  </Card>
</template>
