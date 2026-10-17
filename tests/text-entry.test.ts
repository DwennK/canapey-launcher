import { describe, expect, it } from "vitest";
import { eraseSelection, replaceSelection } from "../src/lib/text-entry";

describe("on-screen text editing", () => {
  it("replaces a selected range and returns the new caret", () => {
    expect(replaceSelection("Mon salon", 4, 9, "cinéma")).toEqual({
      value: "Mon cinéma",
      cursor: 10,
    });
  });
  it("honors the field limit while preserving the unselected suffix", () => {
    expect(replaceSelection("abcd", 1, 3, "12345", 5)).toEqual({
      value: "a123d",
      cursor: 4,
    });
    expect(replaceSelection("ab", 1, 1, "💙", 3)).toEqual({
      value: "ab",
      cursor: 1,
    });
  });
  it("deletes selections and complete Unicode characters without crossing the start", () => {
    expect(eraseSelection("a💙b", 3, 3)).toEqual({ value: "ab", cursor: 1 });
    expect(eraseSelection("cinéma", 0, 3)).toEqual({ value: "éma", cursor: 0 });
    expect(eraseSelection("abc", 0, 0)).toEqual({ value: "abc", cursor: 0 });
  });
});
