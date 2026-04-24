"use client";

import { useReducer } from "react";
import {
  initialAdminAuthState,
  transitionAdminAuthState,
  type AdminAuthEvent,
  type AdminAuthState,
} from "@/lib/auth-state-machine";

export function useAuthStateMachine(initialState?: AdminAuthState) {
  const [state, dispatch] = useReducer(
    transitionAdminAuthState,
    initialState ?? initialAdminAuthState(),
  );

  return {
    state,
    status: state.status,
    dispatch(event: AdminAuthEvent) {
      dispatch(event);
    },
  };
}
