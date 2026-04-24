export type AdminPermissions = {
  readonly view_admin_panel: boolean;
  readonly manage_sessions: boolean;
};

export type AdminAuthContext = {
  readonly auth_time: number | null;
  readonly amr: readonly string[];
  readonly acr: string | null;
};

export type AdminPrincipal = {
  readonly subject_id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: string;
  readonly last_login_at: string | null;
  readonly auth_context: AdminAuthContext;
  readonly permissions: AdminPermissions;
};
