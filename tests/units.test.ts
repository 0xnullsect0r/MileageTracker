import { describe, expect, it } from "vitest";
import {
  type VehicleUnits,
  ReadingParseError,
  allowedPrecisions,
  formatDelta,
  formatReading,
  parseHoursAndMinutes,
  parseReading,
  readingInputProps,
  splitChangedDigits,
  ticksPerUnit,
  toHoursAndMinutes,
} from "../src/lib/units";

const miWhole: VehicleUnits = { meterType: "DISTANCE", distanceUnit: "MI", readingPrecision: "WHOLE" };
const miTenths: VehicleUnits = { meterType: "DISTANCE", distanceUnit: "MI", readingPrecision: "TENTHS" };
const kmTenths: VehicleUnits = { meterType: "DISTANCE", distanceUnit: "KM", readingPrecision: "TENTHS" };
const hrWhole: VehicleUnits = { meterType: "HOURS", distanceUnit: "MI", readingPrecision: "WHOLE" };
const hrTenths: VehicleUnits = { meterType: "HOURS", distanceUnit: "MI", readingPrecision: "TENTHS" };
const hrMin: VehicleUnits = { meterType: "HOURS", distanceUnit: "MI", readingPrecision: "HOURS_MINUTES" };

describe("ticks per unit is fixed by meter type, not precision", () => {
  it("distance is always hundredths", () => {
    expect(ticksPerUnit(miWhole)).toBe(100);
    expect(ticksPerUnit(miTenths)).toBe(100);
  });
  it("hours are always minutes", () => {
    expect(ticksPerUnit(hrWhole)).toBe(60);
    expect(ticksPerUnit(hrMin)).toBe(60);
  });
});

describe("round-trip parse -> format for every meter x precision", () => {
  const cases: Array<[VehicleUnits, string, number, string]> = [
    [miWhole, "12345", 1234500, "12,345"],
    [miTenths, "12345.6", 1234560, "12,345.6"],
    [kmTenths, "980.4", 98040, "980.4"],
    [hrWhole, "210", 12600, "210"],
    [hrTenths, "210.4", 12624, "210.4"],
    [hrMin, "210:25", 12625, "210:25"],
  ];
  for (const [v, input, ticks, formatted] of cases) {
    it(`${v.meterType}/${v.readingPrecision}: "${input}" -> ${ticks} -> "${formatted}"`, () => {
      const parsed = parseReading(input, v);
      expect(parsed).toBe(ticks);
      expect(formatReading(parsed, v)).toBe(formatted);
    });
  }
});

describe("hours:minutes boundaries", () => {
  it("59 minutes is the last valid minute", () => {
    expect(parseReading("210:59", hrMin)).toBe(210 * 60 + 59);
  });
  it("60 minutes is rejected, not silently rolled over", () => {
    expect(() => parseReading("210:60", hrMin)).toThrow(ReadingParseError);
  });
  it("61 minutes is rejected", () => {
    expect(() => parseReading("210:61", hrMin)).toThrow(ReadingParseError);
  });
  it("bare hours are accepted and mean :00", () => {
    expect(parseReading("210", hrMin)).toBe(12600);
    expect(formatReading(12600, hrMin)).toBe("210:00");
  });
  it("single-digit minutes are accepted and zero-padded on the way out", () => {
    expect(parseReading("210:5", hrMin)).toBe(12605);
    expect(formatReading(12605, hrMin)).toBe("210:05");
  });
  it("paired controls agree with the string form", () => {
    expect(parseHoursAndMinutes("210", "25")).toBe(parseReading("210:25", hrMin));
    expect(toHoursAndMinutes(12625)).toEqual({ hours: 210, minutes: 25 });
    expect(() => parseHoursAndMinutes("210", "60")).toThrow(ReadingParseError);
  });
});

describe("changing precision never rewrites data", () => {
  // The whole point of storing ticks: the stored value is identical across
  // every display mode, so a precision toggle is config, not a migration.
  it("one stored hours value renders three ways, unchanged", () => {
    const stored = parseReading("210:25", hrMin); // 12625
    expect(formatReading(stored, hrMin)).toBe("210:25");
    expect(formatReading(stored, hrTenths)).toBe("210.4");
    expect(formatReading(stored, hrWhole)).toBe("210");
    expect(stored).toBe(12625);
  });
  it("one stored distance value renders both ways, unchanged", () => {
    const stored = parseReading("12345.6", miTenths);
    expect(formatReading(stored, miTenths)).toBe("12,345.6");
    expect(formatReading(stored, miWhole)).toBe("12,346");
    expect(stored).toBe(1234560);
  });
});

describe("input finer than the vehicle's precision rounds, never truncates", () => {
  it("rounds up on a WHOLE distance vehicle", () => {
    expect(parseReading("12345.67", miWhole)).toBe(1234600);
  });
  it("rounds to the nearest tenth on a TENTHS vehicle", () => {
    expect(parseReading("12345.67", miTenths)).toBe(1234570);
  });
});

describe("input hygiene", () => {
  it("accepts thousands separators and surrounding space", () => {
    expect(parseReading(" 12,345 ", miWhole)).toBe(1234500);
  });
  it("rejects blanks, negatives and junk", () => {
    for (const bad of ["", "   ", "-5", "abc", "12.3.4", "1e5"]) {
      expect(() => parseReading(bad, miWhole), `"${bad}"`).toThrow(ReadingParseError);
    }
  });
  it("rejects a bare decimal in hours:minutes mode", () => {
    expect(() => parseReading("210.4", hrMin)).toThrow(ReadingParseError);
  });
});

describe("deltas", () => {
  it("are exact integer subtraction with no float drift", () => {
    const a = parseReading("99667", miWhole);
    const b = parseReading("105628", miWhole);
    expect(b - a).toBe(596100);
    expect(formatDelta(b - a, miWhole)).toBe("+5,961 mi");
  });
  it("survive 3,300 sequential tenths additions without drift", () => {
    let ticks = 0;
    for (let i = 0; i < 3300; i++) ticks += parseReading("0.1", miTenths);
    expect(ticks).toBe(3300 * 10);
    expect(formatReading(ticks, miTenths)).toBe("330.0");
  });
  it("render signed, and negative deltas keep their sign", () => {
    expect(formatDelta(-1200, miWhole)).toBe("-12 mi");
    expect(formatDelta(125, hrMin)).toBe("+2:05 h");
  });
});

describe("precision options offered per meter type", () => {
  it("hours:minutes is offered only for hour meters", () => {
    expect(allowedPrecisions("HOURS")).toContain("HOURS_MINUTES");
    expect(allowedPrecisions("DISTANCE")).not.toContain("HOURS_MINUTES");
  });
});

describe("input props", () => {
  it("hours:minutes gets a numeric keypad and a colon pattern", () => {
    const p = readingInputProps(hrMin);
    expect(p.inputMode).toBe("numeric");
    expect(p.placeholder).toBe("210:25");
  });
  it("tenths gets a decimal keypad and a 0.1 step", () => {
    expect(readingInputProps(miTenths)).toMatchObject({ inputMode: "decimal", step: "0.1" });
  });
});

describe("splitChangedDigits — the staircase", () => {
  it("recedes the shared prefix so only changed digits stand out", () => {
    expect(splitChangedDigits("105,940", "105,628")).toEqual({ shared: "105,", changed: "940" });
  });
  it("treats a length change as fully changed, so a typo cannot hide", () => {
    // 566698 against 56694: different length, so nothing recedes.
    expect(splitChangedDigits("566,698", "56,694")).toEqual({ shared: "", changed: "566,698" });
  });
  it("shows the whole number when there is no reference", () => {
    expect(splitChangedDigits("12,345", null)).toEqual({ shared: "", changed: "12,345" });
  });
  it("never recedes an entire identical number into invisibility", () => {
    expect(splitChangedDigits("12,345", "12,345")).toEqual({ shared: "", changed: "12,345" });
  });
});
