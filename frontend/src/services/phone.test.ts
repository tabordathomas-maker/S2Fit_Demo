import { describe, expect, it } from "vitest";

import { PHONE_ERROR, cleanPhone, formatPhone, isValidPhone, phoneForSubmit } from "./phone";

describe("cleanPhone", () => {
  it.each(["3001234567", "300 123 4567", "300-123-4567", "(300) 123 4567", " 300 123 4567 ", "+57 300 123 4567", "573001234567"])(
    "limpia %j",
    (raw) => expect(cleanPhone(raw)).toBe("3001234567"),
  );
});

describe("isValidPhone", () => {
  it("acepta celulares", () => {
    expect(isValidPhone("300 123 4567")).toBe(true);
    expect(isValidPhone("+57 310 555 1234")).toBe(true);
  });
  it("rechaza incompletos y fijos", () => {
    expect(isValidPhone("300 123")).toBe(false);
    expect(isValidPhone("6041234567")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("da formato de 10 dígitos", () => {
    expect(formatPhone("3001234567")).toBe("300 123 4567");
    expect(formatPhone("573001234567")).toBe("300 123 4567");
  });
  it("devuelve el texto tal cual si no son 10 dígitos", () => {
    expect(formatPhone("300 12")).toBe("300 12");
    expect(formatPhone(null)).toBe("");
  });
});

describe("phoneForSubmit", () => {
  it("devuelve 10 dígitos limpios", () => {
    expect(phoneForSubmit(" (300) 123-4567 ", true)).toBe("3001234567");
    expect(phoneForSubmit("+57 300 123 4567")).toBe("3001234567");
  });
  it("vacío: null si es opcional, error si es obligatorio", () => {
    expect(phoneForSubmit("  ")).toBeNull();
    expect(() => phoneForSubmit("", true)).toThrow(PHONE_ERROR);
  });
  it("rechaza inválidos y letras", () => {
    expect(() => phoneForSubmit("300 123")).toThrow(PHONE_ERROR);
    expect(() => phoneForSubmit("6041234567")).toThrow(PHONE_ERROR);
    expect(() => phoneForSubmit("300 123 456a")).toThrow(PHONE_ERROR);
  });
});
