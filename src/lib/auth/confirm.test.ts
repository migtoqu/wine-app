import { describe, expect, it } from "vitest";
import { confirmFailurePath, confirmSuccessPath, isRecovery, type ConfirmParams } from "./confirm";

const base: ConfirmParams = {
  code: "abc",
  tokenHash: null,
  type: null,
  next: "/es/yo",
  hasUrlError: false,
  email: null,
};

const missing = { kind: "code", verifierMissing: true } as const;
const otherCodeError = { kind: "code", verifierMissing: false } as const;

describe("isRecovery", () => {
  it("se deduce de type o de next", () => {
    expect(isRecovery({ type: "recovery", next: null })).toBe(true);
    expect(isRecovery({ type: null, next: "/en/restablecer" })).toBe(true);
    expect(isRecovery({ type: null, next: "/es/restablecer?x=1" })).toBe(true);
    expect(isRecovery({ type: null, next: "/es/yo" })).toBe(false);
    expect(isRecovery({ type: "email", next: null })).toBe(false);
  });
});

describe("confirmSuccessPath", () => {
  it("va a next si es seguro", () => {
    expect(confirmSuccessPath(base, "es")).toBe("/es/yo");
    expect(confirmSuccessPath({ ...base, next: "https://malo.test" }, "en")).toBe("/en/yo");
  });

  it("sin next, la recuperación va a /restablecer", () => {
    expect(confirmSuccessPath({ ...base, next: null, type: "recovery" }, "en")).toBe("/en/restablecer");
  });
});

describe("confirmFailurePath", () => {
  it("alta sin verificador: email ya confirmado → login con aviso, next y email", () => {
    expect(confirmFailurePath({ ...base, email: "ana@example.com" }, "es", missing)).toBe(
      "/es/login?confirmado=1&next=%2Fes%2Fyo&email=ana%40example.com",
    );
  });

  it("alta con otro error del canje: también login con aviso", () => {
    expect(confirmFailurePath({ ...base, next: "/en/yo" }, "en", otherCodeError)).toBe(
      "/en/login?confirmado=1&next=%2Fen%2Fyo",
    );
  });

  it("alta: descarta next inseguro o la landing y emails sin forma de email", () => {
    expect(
      confirmFailurePath({ ...base, next: "//malo.test", email: "no-es-email" }, "es", missing),
    ).toBe("/es/login?confirmado=1");
    expect(confirmFailurePath({ ...base, next: "/es" }, "es", missing)).toBe("/es/login?confirmado=1");
  });

  it("recuperación sin verificador → pedir otro enlace en el mismo navegador", () => {
    expect(confirmFailurePath({ ...base, next: "/en/restablecer" }, "en", missing)).toBe(
      "/en/recuperar?error=navegador",
    );
  });

  it("recuperación con otro error del canje → enlace no válido", () => {
    expect(confirmFailurePath({ ...base, next: "/es/restablecer" }, "es", otherCodeError)).toBe(
      "/es/login?error=enlace",
    );
  });

  it("error en la URL (caducado o usado) → enlace no válido, aunque haya code", () => {
    const params = { ...base, hasUrlError: true };
    expect(confirmFailurePath(params, "es", { kind: "link" })).toBe("/es/login?error=enlace");
    expect(confirmFailurePath(params, "es", missing)).toBe("/es/login?error=enlace");
  });

  it("token_hash inválido o sin parámetros → enlace no válido", () => {
    expect(
      confirmFailurePath({ ...base, code: null, tokenHash: "x", type: "email" }, "en", { kind: "link" }),
    ).toBe("/en/login?error=enlace");
  });
});
