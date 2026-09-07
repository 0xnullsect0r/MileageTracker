import { Computed, Delta, Num, Reading } from "@/components/Reading";
import { CategoryMark, categoryBorder } from "@/components/Category";
import { Banner, Button, Field, Label, Rule, Stat, inputClass } from "@/components/ui";
import type { VehicleUnits } from "@/lib/units";

const mi: VehicleUnits = { meterType: "DISTANCE", distanceUnit: "MI", readingPrecision: "WHOLE" };
const miT: VehicleUnits = { meterType: "DISTANCE", distanceUnit: "MI", readingPrecision: "TENTHS" };
const hr: VehicleUnits = { meterType: "HOURS", distanceUnit: "MI", readingPrecision: "WHOLE" };
const hrM: VehicleUnits = { meterType: "HOURS", distanceUnit: "MI", readingPrecision: "HOURS_MINUTES" };

const CATS = [
  { code: "B", name: "Business", kind: "TRIP" as const },
  { code: "P", name: "Personal", kind: "TRIP" as const },
  { code: "G", name: "Gas", kind: "FUEL" as const },
  { code: "S", name: "Service", kind: "SERVICE" as const },
  { code: "I", name: "Info", kind: "NOTE" as const },
];

// A real slice of the 2020 sheet, including the 566698 typo, so the staircase
// and the way it breaks are both visible on this page.
const LADDER = [56632, 56670, 56694, 566698, 56716, 56730, 56738];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="py-10">
      <Label>{title}</Label>
      {note && <p className="mt-1 max-w-prose text-sm text-ink-muted">{note}</p>}
      <div className="mt-4">{children}</div>
      <Rule className="mt-10" />
    </section>
  );
}

export default function Styleguide() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <header className="py-10">
        <h1 className="text-[2rem] font-semibold tracking-tight">Styleguide</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Every token and primitive on one page. This is the screenshot target for the
          design review.
        </p>
      </header>
      <Rule strong />

      <Section
        title="The staircase"
        note="A reading is a row of digits, not a string. Digits shared with the row above recede, so only what changed is dark. The fourth row is the real 2020 typo — because its length differs, nothing recedes, and it breaks the pattern on sight."
      >
        <div className="max-w-sm">
          {LADDER.map((v, i) => {
            const prev = i === 0 ? null : LADDER[i - 1]! * 100;
            const broken = v > (LADDER[i + 1] ?? Infinity);
            return (
              <div
                key={v}
                className="flex items-baseline justify-between border-b border-rule py-2"
                style={broken ? { background: "color-mix(in srgb, var(--signal-bright) 22%, transparent)" } : undefined}
              >
                <Reading ticks={v * 100} units={mi} reference={prev} />
                {broken && <span className="text-sm font-semibold" style={{ color: "var(--signal)" }}>impossible</span>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Typed vs computed"
        note="A reading came from a human thumb. A delta came from arithmetic on two of them. Only one of the two can be wrong on its own, so they do not look alike."
      >
        <div className="flex flex-wrap items-baseline gap-8">
          <Stat label="Typed"><Reading ticks={10562800} units={mi} size="lg" /></Stat>
          <Stat label="Computed"><Delta ticks={31200} units={mi} /></Stat>
          <Stat label="Economy"><Computed>22.4 mpg</Computed></Stat>
        </div>
      </Section>

      <Section title="Units — one component, every mode" note="The same stored value, rendered at each precision. Switching precision never rewrites data.">
        <div className="grid gap-6 sm:grid-cols-4">
          <Stat label="Miles, whole"><Reading ticks={1234560} units={mi} withUnit /></Stat>
          <Stat label="Miles, tenths"><Reading ticks={1234560} units={miT} withUnit /></Stat>
          <Stat label="Hours, whole"><Reading ticks={12625} units={hr} withUnit /></Stat>
          <Stat label="Hours + minutes"><Reading ticks={12625} units={hrM} withUnit /></Stat>
        </div>
      </Section>

      <Section title="Type scale" note="Two families. If it counts, it's mono; if it explains, it's sans.">
        <div className="space-y-3">
          <p className="text-[3.5rem] leading-none num tracking-tight">105,628</p>
          <p className="text-[2rem] font-semibold tracking-tight">Sans, 32 — section heading</p>
          <p className="text-base">Sans, 16 — body copy sits here. Nothing a human typed is set below 14px.</p>
          <p className="text-sm text-ink-muted">Sans, 14 — the floor for secondary text, at 7:1.</p>
          <Label>Sans, 12 — uppercase column label</Label>
        </div>
      </Section>

      <Section title="Colour" note="One dominant, one accent, neutrals. --signal-bright is 2.26:1 and never carries text.">
        <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
          {[
            ["--paper", "page ground"],
            ["--paper-raised", "table surface"],
            ["--ink", "primary text 16.2:1"],
            ["--ink-muted", "secondary 7.0:1"],
            ["--rule", "hairlines"],
            ["--signal", "accent 5.16:1"],
            ["--signal-bright", "large fills only"],
          ].map(([token, use]) => (
            <div key={token} className="bg-paper p-3">
              <div className="h-10 w-full border border-rule" style={{ background: `var(${token})` }} />
              <code className="mt-2 block text-[0.75rem]">{token}</code>
              <span className="text-[0.75rem] text-ink-muted">{use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Categories" note="Hue is always redundant with a letter. Remove all colour and the log still reads.">
        <div className="max-w-md">
          {CATS.map((c) => (
            <div key={c.code} className="flex items-center gap-3 border-b border-rule py-2 pl-3" style={categoryBorder(c)}>
              <CategoryMark category={c} showName />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Save entry</Button>
          <Button>Cancel</Button>
          <Button variant="quiet">Skip</Button>
          <Button variant="danger">Delete user</Button>
        </div>
        <div className="mt-8 grid max-w-md gap-6">
          <Field label="Odometer"><input className={inputClass} placeholder="105628" inputMode="numeric" /></Field>
          <Field label="Password" error="Use at least 10 characters."><input className={inputClass} type="password" /></Field>
        </div>
      </Section>

      <Section title="Notices">
        <div className="grid max-w-2xl gap-3">
          <Banner>Reading jumps to 566,698 between 56,694 and 56,716 — an odometer cannot go back down.</Banner>
          <Banner tone="quiet">26 blank rows were skipped.</Banner>
        </div>
      </Section>

      <Section title="Figures">
        <div className="flex flex-wrap gap-8">
          <Stat label="Fuel spend"><Num value={1657.49} prefix="$" /></Stat>
          <Stat label="Gallons"><Num value={432.5} dp={1} /></Stat>
          <Stat label="Price / gal"><Num value={3.279} dp={3} prefix="$" /></Stat>
          <Stat label="Entries"><Num value={3338} dp={0} /></Stat>
        </div>
      </Section>
    </main>
  );
}
