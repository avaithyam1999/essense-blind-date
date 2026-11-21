import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "../lib/authErrors";

describe("friendlyAuthError", () => {
  it("maps already-registered errors", () => {
    expect(friendlyAuthError("User already registered")).toMatch(/already registered/);
  });
  it("maps bad credentials", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("That email and password don't match.");
  });
  it("maps unconfirmed email", () => {
    expect(friendlyAuthError("Email not confirmed")).toMatch(/Confirm your email/);
  });
  it("maps an invalid API key to a setup message", () => {
    expect(friendlyAuthError("Invalid API key")).toMatch(/setup issue/);
  });
  it("maps fetch failures to a connection message", () => {
    expect(friendlyAuthError("Failed to fetch")).toMatch(/reach the server/);
  });
  it("passes unknown messages through", () => {
    expect(friendlyAuthError("Something odd")).toBe("Something odd");
  });
});
