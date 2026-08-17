import { describe, expect, it } from "vitest";
import { isAuthorized } from "./auth-guard";
import type { User } from "@supabase/supabase-js";

const user = { id: "u1" } as User;

describe("isAuthorized", () => {
  it("nega acesso sem usuário", () => {
    expect(isAuthorized(null, { active: true })).toBe(false);
  });

  it("nega acesso sem perfil", () => {
    expect(isAuthorized(user, null)).toBe(false);
  });

  it("nega acesso com perfil inativo", () => {
    expect(isAuthorized(user, { active: false })).toBe(false);
  });

  it("permite acesso com usuário e perfil ativo", () => {
    expect(isAuthorized(user, { active: true })).toBe(true);
  });
});
