"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon } from "@/components/nav/icons";
import { cn } from "@/lib/cn";

/**
 * A form in a dialog: a sheet rising from the bottom on a phone, a panel
 * in the middle of the screen on a desk.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content
          className={cn(
            "sheet-up pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[4px] border-t border-rule bg-paper-raised",
            "md:bottom-auto md:left-1/2 md:top-[8vh] md:max-h-[84vh] md:-translate-x-1/2 md:rounded-[2px] md:border md:border-ink md:[animation:none]",
            wide ? "md:w-[40rem]" : "md:w-[32rem]",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-4 pt-3 sm:px-6 md:pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center" aria-label="Close">
              <CloseIcon className="size-5" />
            </Dialog.Close>
          </div>
          <div className="px-4 pb-6 pt-4 sm:px-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
