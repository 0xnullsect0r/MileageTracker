"use client";

import { useActionState, useState } from "react";
import {
  createUser,
  deleteUser,
  resetPassword,
  setRole,
  type AdminState,
} from "@/app/(app)/admin/users/actions";
import { Button, Field, Label, Rule, inputClass } from "@/components/ui";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  isSelf: boolean;
}

export function AdminUsers({ rows }: { rows: AdminUserRow[] }) {
  const [createState, createAction, creating] = useActionState<AdminState, FormData>(createUser, {});
  const [resetState, resetAction, resetting] = useActionState<AdminState, FormData>(resetPassword, {});
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  return (
    <div>
      {/* Deliberately the quietest screen in the app. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem]">
        <thead>
          <tr className="border-b border-rule text-left text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            <th className="py-2 pr-4 font-semibold">Name</th>
            <th className="py-2 pr-4 font-semibold">Email</th>
            <th className="py-2 pr-4 font-semibold">Role</th>
            <th className="hidden py-2 pr-4 font-semibold sm:table-cell">Last signed in</th>
            <th className="py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="group border-b border-rule align-baseline">
              <td className="py-3 pr-4 text-sm">
                {u.name}
                {u.mustChangePassword && (
                  <span className="ml-2 text-[0.75rem] text-ink-muted">(must set a password)</span>
                )}
              </td>
              <td className="num py-3 pr-4 text-[0.8125rem] text-ink-muted">{u.email}</td>
              <td className="py-3 pr-4">
                <form action={setRole}>
                  <input type="hidden" name="id" value={u.id} />
                  {/* Plain text, not a badge — even here, where it is most tempting. */}
                  <select
                    name="role"
                    defaultValue={u.role}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    className="min-h-11 border-0 bg-transparent px-0 text-sm text-ink-muted focus:text-ink focus:outline-none"
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </form>
              </td>
              <td className="num hidden py-3 pr-4 text-[0.8125rem] text-ink-muted sm:table-cell">
                {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : "never"}
              </td>
              <td className="py-3 text-right">
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setResetFor(resetFor === u.id ? null : u.id)}
                    className="min-h-11 text-sm text-ink-muted hover:text-ink"
                  >
                    Reset password
                  </button>
                  {!u.isSelf && (
                    <button
                      type="button"
                      onClick={() => setConfirmFor(u.id)}
                      className="min-h-11 text-sm text-ink-muted hover:text-[var(--signal)]"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {resetFor === u.id && (
                  <form action={resetAction} className="mt-2 flex flex-wrap items-end justify-end gap-3">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      className={`${inputClass} max-w-56`}
                      name="password"
                      type="password"
                      placeholder="New password"
                      autoComplete="new-password"
                      required
                    />
                    <Button type="submit" disabled={resetting}>
                      {resetting ? "Saving…" : "Set"}
                    </Button>
                  </form>
                )}

                {confirmFor === u.id && (
                  <div className="mt-2 border-l-[3px] border-[var(--signal)] bg-paper-raised p-3 text-left text-sm">
                    <p>
                      Delete <strong>{u.name}</strong> ({u.email})? They are signed out of every
                      device immediately and this cannot be undone.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <form action={deleteUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <Button type="submit" variant="danger">Delete</Button>
                      </form>
                      <Button type="button" variant="quiet" onClick={() => setConfirmFor(null)}>
                        Keep
                      </Button>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>

      {(resetState.error || resetState.ok) && (
        <p className="mt-4 text-sm" style={resetState.error ? { color: "var(--signal)" } : undefined}>
          {resetState.error ?? resetState.ok}
        </p>
      )}

      <Rule className="my-10" />
      <Label>Add someone</Label>
      <form action={createAction} className="mt-4 grid max-w-2xl gap-6 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} name="name" required /></Field>
        <Field label="Email"><input className={inputClass} name="email" type="email" required /></Field>
        <Field label="Temporary password" hint="They set their own when they first sign in.">
          <input className={inputClass} name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Role">
          <select className={inputClass} name="role" defaultValue="USER">
            <option value="USER">User</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          {createState.error && (
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--signal)" }}>{createState.error}</p>
          )}
          {createState.ok && <p className="mb-3 text-sm text-ink-muted">{createState.ok}</p>}
          <Button type="submit" variant="primary" disabled={creating}>
            {creating ? "Adding…" : "Add user"}
          </Button>
        </div>
      </form>
    </div>
  );
}
