import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseTimeZone, isValidIanaTimeZone } from "./time-zone.ts";

describe("chooseTimeZone", () => {
  it("uses the IP timezone when the device clock is still Mexico City", () => {
    assert.equal(
      chooseTimeZone({
        ipTimeZone: "Asia/Tokyo",
        deviceTimeZone: "America/Mexico_City",
      }),
      "Asia/Tokyo",
    );
  });

  it("uses the device timezone when the request has no IP timezone", () => {
    assert.equal(
      chooseTimeZone({ ipTimeZone: null, deviceTimeZone: "Asia/Tokyo" }),
      "Asia/Tokyo",
    );
  });

  it("ignores a UTC IP timezone and keeps the device zone", () => {
    assert.equal(
      chooseTimeZone({ ipTimeZone: "UTC", deviceTimeZone: "Asia/Tokyo" }),
      "Asia/Tokyo",
    );
  });

  it("falls back to Mexico City only when nothing was detected", () => {
    assert.equal(chooseTimeZone({ ipTimeZone: "Not/AZone", deviceTimeZone: "" }), "America/Mexico_City");
  });
});

describe("isValidIanaTimeZone", () => {
  it("accepts IANA names and rejects blanks", () => {
    assert.equal(isValidIanaTimeZone("Asia/Tokyo"), true);
    assert.equal(isValidIanaTimeZone("America/Mexico_City"), true);
    assert.equal(isValidIanaTimeZone(""), false);
    assert.equal(isValidIanaTimeZone("Mexico"), false);
  });
});
