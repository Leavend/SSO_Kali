"use client";

import { useCallback, useState, useTransition } from "react";
import type { AdminActionResult } from "@/app/actions";
import { revokeAllUserSessionsAction, revokeSessionAction } from "@/app/actions";
import ReAuthInterstitial from "@/components/ReAuthInterstitial";
import { requiresSensitiveActionStepUp } from "@/lib/admin-freshness";

type FeedbackState = "idle" | "confirming" | "success" | "error";

type SensitiveActionProps = {
  readonly authTime: number | null;
  readonly returnTo: string;
};

type RevokeSessionButtonProps = SensitiveActionProps & {
  readonly sessionId: string;
};

type RevokeAllButtonProps = SensitiveActionProps & {
  readonly subjectId: string;
};

export function RevokeSessionButton(props: RevokeSessionButtonProps) {
  const model = useSensitiveActionModel(
    props.authTime,
    () => revokeSessionAction(props.sessionId),
  );

  return (
    <>
      <ReAuthInterstitial
        open={model.interstitialOpen}
        returnTo={props.returnTo}
        onClose={model.closeInterstitial}
      />
      <ActionFeedback
        confirmingLabel="Confirm"
        errorMsg={model.errorMsg}
        isPending={model.isPending}
        pendingLabel="Revoking…"
        revokeLabel="Revoke"
        state={model.state}
        successLabel="✓ Revoked"
        onCancel={model.cancel}
        onConfirm={model.confirm}
        onStart={model.requestConfirm}
      />
    </>
  );
}

export function RevokeAllButton(props: RevokeAllButtonProps) {
  const model = useSensitiveActionModel(
    props.authTime,
    () => revokeAllUserSessionsAction(props.subjectId),
  );

  return (
    <>
      <ReAuthInterstitial
        open={model.interstitialOpen}
        returnTo={props.returnTo}
        onClose={model.closeInterstitial}
        description="Revoking every active session needs a newly verified admin identity."
      />
      <ActionFeedback
        confirmingLabel="Confirm Global Logout"
        confirmNote="⚠ This will revoke ALL sessions"
        errorMsg={model.errorMsg}
        isPending={model.isPending}
        pendingLabel="Revoking…"
        revokeLabel="Revoke All Sessions"
        state={model.state}
        successLabel="✓ All sessions revoked"
        onCancel={model.cancel}
        onConfirm={model.confirm}
        onStart={model.requestConfirm}
      />
    </>
  );
}

function useSensitiveActionModel(
  authTime: number | null,
  action: () => Promise<AdminActionResult>,
) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FeedbackState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [interstitialOpen, setInterstitialOpen] = useState(false);

  const cancel = useCallback(() => setState("idle"), []);
  const closeInterstitial = useCallback(() => setInterstitialOpen(false), []);

  const requestConfirm = useCallback(
    () => openStepUpOrConfirm(authTime, setInterstitialOpen, setState),
    [authTime],
  );

  const confirm = useCallback(() => {
    confirmOrStepUp(authTime, action, setErrorMsg, setInterstitialOpen, setState, startTransition);
  }, [action, authTime, startTransition]);

  return { isPending, state, errorMsg, interstitialOpen, cancel, closeInterstitial, requestConfirm, confirm };
}

function confirmOrStepUp(
  authTime: number | null,
  action: () => Promise<AdminActionResult>,
  setErrorMsg: (v: string) => void,
  setInterstitialOpen: (v: boolean) => void,
  setState: (v: FeedbackState) => void,
  startTransition: (cb: () => void) => void,
) {
  if (requiresSensitiveActionStepUp(authTime)) {
    return reopenStepUp(setInterstitialOpen, setState);
  }
  startTransition(() => executeSensitiveAction(action, setErrorMsg, setInterstitialOpen, setState));
}

async function executeSensitiveAction(
  action: () => Promise<AdminActionResult>,
  setErrorMsg: (value: string) => void,
  setInterstitialOpen: (value: boolean) => void,
  setState: (value: FeedbackState) => void,
) {
  const result = await action();

  if (result.ok) {
    return markTransientState(setState, "success", 2000);
  }

  if (result.code === "reauth_required") {
    return reopenStepUp(setInterstitialOpen, setState);
  }

  setErrorMsg(result.error ?? "Unknown error");
  markTransientState(setState, "error", 3000);
}

function openStepUpOrConfirm(
  authTime: number | null,
  setInterstitialOpen: (value: boolean) => void,
  setState: (value: FeedbackState) => void,
) {
  if (requiresSensitiveActionStepUp(authTime)) {
    return setInterstitialOpen(true);
  }

  setState("confirming");
}

function reopenStepUp(
  setInterstitialOpen: (value: boolean) => void,
  setState: (value: FeedbackState) => void,
) {
  setState("idle");
  setInterstitialOpen(true);
}

function markTransientState(
  setState: (value: FeedbackState) => void,
  state: FeedbackState,
  delayMs: number,
) {
  setState(state);
  setTimeout(() => setState("idle"), delayMs);
}

type ActionFeedbackProps = {
  readonly state: FeedbackState;
  readonly revokeLabel: string;
  readonly confirmingLabel: string;
  readonly pendingLabel: string;
  readonly successLabel: string;
  readonly errorMsg: string;
  readonly isPending: boolean;
  readonly confirmNote?: string;
  readonly onStart: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

function ActionFeedback(props: ActionFeedbackProps) {
  if (props.state === "success") {
    return <SuccessBadge label={props.successLabel} />;
  }

  if (props.state === "error") {
    return <ErrorBadge label={props.errorMsg} />;
  }

  if (props.state === "confirming") {
    return (
      <ConfirmActions
        isPending={props.isPending}
        confirmLabel={props.confirmingLabel}
        pendingLabel={props.pendingLabel}
        {...withOptionalNote(props.confirmNote)}
        onCancel={props.onCancel}
        onConfirm={props.onConfirm}
      />
    );
  }

  return <StartActionButton label={props.revokeLabel} onClick={props.onStart} />;
}

function SuccessBadge(props: { readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-3 py-1.5 text-xs font-medium text-success">
      {props.label}
    </span>
  );
}

function ErrorBadge(props: { readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
      ✕ {props.label}
    </span>
  );
}

function ConfirmActions(props: {
  readonly isPending: boolean;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly note?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {props.note ? <span className="text-xs text-danger">{props.note}</span> : null}
      <button
        className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
        disabled={props.isPending}
        onClick={props.onConfirm}
        type="button"
      >
        {props.isPending ? props.pendingLabel : props.confirmLabel}
      </button>
      <button
        className="rounded-md bg-card-hover px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        onClick={props.onCancel}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}

function StartActionButton(props: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className="rounded-md bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white"
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

function withOptionalNote(note: string | undefined) {
  return note ? { note } : {};
}
