import { listVehicles, loadLog, unitsOf } from "@/lib/data";
import { fillGroups, withDistances } from "@/lib/derive";
import { ticksToUnits } from "@/lib/units";

const [vehicle] = await listVehicles();
const units = unitsOf(vehicle!);
const log = await loadLog(vehicle!.id);
const groups = fillGroups(withDistances(log));
const good = groups.filter((g) => !g.excluded);

const dist = good.reduce((a, g) => a + g.distanceTicks, 0);
const fuel = good.reduce((a, g) => a + g.fuelQty, 0);
console.log(`groups: ${groups.length}  usable: ${good.length}  excluded: ${groups.length - good.length}`);
console.log(`group distance: ${ticksToUnits(dist, units).toFixed(0)} mi   group fuel: ${fuel.toFixed(1)} gal  -> ${(ticksToUnits(dist, units) / fuel).toFixed(2)} mpg`);

const worst = [...good].sort((a, b) => (b.economyTicksPerUnit ?? 0) - (a.economyTicksPerUnit ?? 0)).slice(0, 8);
console.log("\nhighest-economy groups (suspects):");
for (const g of worst) {
  console.log(
    `  ${g.closedBy.occurredOn}  ${ticksToUnits(g.distanceTicks, units).toFixed(0).padStart(7)} mi / ${g.fuelQty.toFixed(2).padStart(6)} gal = ${ticksToUnits(g.economyTicksPerUnit!, units).toFixed(1).padStart(6)} mpg   fills=${g.fills.length}`,
  );
}
const med = [...good].map((g) => ticksToUnits(g.economyTicksPerUnit!, units)).sort((a, b) => a - b);
console.log(`\nmedian group economy: ${med[Math.floor(med.length / 2)]!.toFixed(2)} mpg`);
console.log(`groups over 40 mpg: ${med.filter((m) => m > 40).length}`);
process.exit(0);
