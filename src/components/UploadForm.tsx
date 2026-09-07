"use client";

import { useActionState } from "react";
import { uploadFile, type UploadState } from "@/app/(app)/import/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function UploadForm({ vehicles }: { vehicles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadFile, {});

  return (
    <form action={action} className="grid max-w-xl gap-6">
      <Field label="Vehicle">
        <select className={inputClass} name="vehicleId" required defaultValue={vehicles[0]?.id}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </Field>
      <Field label="File" hint=".numbers or .csv" error={state.error}>
        <input
          className="min-h-11 w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-sm file:mr-4 file:min-h-9 file:border file:border-ink file:bg-transparent file:px-3 file:text-sm file:text-ink"
          type="file"
          name="file"
          accept=".numbers,.csv,.txt"
          required
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Reading…" : "Read the file"}
        </Button>
      </div>
    </form>
  );
}
