import { cn } from "@/lib/cn";
import type { CategoryKind } from "@/lib/derive";

export interface CategoryLike {
  code: string;
  name: string;
  kind: CategoryKind;
  color?: string | null;
}

/**
 * Category is never carried by hue alone. Every category shows its letter
 * monogram and, in charts, a fill pattern — which is what makes the app work
 * for colourblind readers and on a monochrome laser printer without either
 * being treated as a later problem.
 */
export function CategoryMark({
  category,
  showName = false,
  className,
}: {
  category: CategoryLike | null;
  showName?: boolean;
  className?: string;
}) {
  if (!category) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-ink-muted", className)}>
        <span className="num w-4 text-center text-[0.75rem]">?</span>
        {showName && <span className="text-sm">Uncategorised</span>}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="num w-4 text-center text-[0.75rem] font-semibold"
        style={{ color: categoryColor(category) }}
      >
        {category.code}
      </span>
      <span className="sr-only">{category.name}</span>
      {showName && <span className="text-sm">{category.name}</span>}
    </span>
  );
}

/** The 3px left border that gives each row its category, printable as weight. */
export function categoryBorder(category: CategoryLike | null): React.CSSProperties {
  return {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: category ? categoryColor(category) : "transparent",
  };
}

export function categoryColor(category: CategoryLike): string {
  if (category.color) return category.color;
  switch (category.code) {
    case "B":
      return "var(--cat-business)";
    case "P":
      return "var(--cat-personal)";
    case "G":
      return "var(--cat-gas)";
    case "S":
      return "var(--cat-service)";
    default:
      return "var(--cat-info)";
  }
}
