"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/account/password/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="grid max-w-sm gap-6">
      <Field label="Current password">
        <input className={inputClass} name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint="At least 10 characters.">
        <input className={inputClass} name="next" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" error={state.error}>
        <input className={inputClass} name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
