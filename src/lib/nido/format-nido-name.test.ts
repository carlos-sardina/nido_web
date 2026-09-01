import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHomeNidoName } from "./format-nido-name.ts";

describe("formatHomeNidoName", () => {
  it("prefixes Nido before a household name", () => {
    assert.equal(formatHomeNidoName("Casa Roma"), "Nido Casa Roma");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(formatHomeNidoName("  Casa Roma  "), "Nido Casa Roma");
  });

  it("does not double-prefix when the name already starts with Nido", () => {
    assert.equal(formatHomeNidoName("Nido"), "Nido");
    assert.equal(formatHomeNidoName("Nido 🪺"), "Nido 🪺");
    assert.equal(formatHomeNidoName("nido Casa"), "nido Casa");
  });

  it("prefixes names that only contain Nido later", () => {
    assert.equal(formatHomeNidoName("El Nido"), "Nido El Nido");
    assert.equal(formatHomeNidoName("Nidos"), "Nido Nidos");
  });

  it("keeps a long household name intact after the prefix", () => {
    const name = "Los García de la Colonia Independencia y Amigos";
    assert.equal(formatHomeNidoName(name), `Nido ${name}`);
    assert.equal(formatHomeNidoName(name).startsWith("Nido "), true);
  });

  it("returns empty for blank input", () => {
    assert.equal(formatHomeNidoName(""), "");
    assert.equal(formatHomeNidoName("   "), "");
  });
});
