import AuthExperienceShell from "@/components/AuthExperienceShell";

export default function SecureAdminSignInScreen() {
  return (
    <AuthExperienceShell
      badge="ADMIN"
      title="Masuk ke Panel Admin"
      description="Lanjutkan ke login resmi untuk verifikasi identitas sebelum membuka panel sesi."
      accent="accent"
      actions={[{
        href: "/auth/login",
        label: "Lanjut ke Login",
        tone: "primary",
      }]}
      note="Login ulang diperlukan untuk setiap sesi admin."
    >
      <div className="grid gap-3 text-left">
        <SecurityExpectation
          label="Login Resmi"
          value="Password hanya dimasukkan di halaman login resmi, bukan di panel ini."
        />
        <SecurityExpectation
          label="Verifikasi Baru"
          value="Akses admin memerlukan login yang baru diverifikasi sebelum dashboard dibuka."
        />
        <SecurityExpectation
          label="Aksi Sensitif"
          value="Beberapa tindakan penting dapat meminta verifikasi ulang sebelum dilanjutkan."
        />
      </div>
    </AuthExperienceShell>
  );
}

function SecurityExpectation(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-card-hover px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
        {props.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {props.value}
      </p>
    </div>
  );
}
