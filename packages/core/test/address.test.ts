import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressColumns,
  addressColumnsWithPrefix,
  addressFromColumns,
  addressFromGoogle,
  addressFromPrefixedColumns,
  formatAddress,
  parseAddress,
  toAddress,
} from "../src/address.ts";

const parts = (text: string) => {
  const { street, suburb, state, postcode } = parseAddress(text);
  return { street, suburb, state, postcode };
};

test("the usual way of writing an address splits into parts", () => {
  assert.deepEqual(parts("12 Smith St, Brunswick VIC 3056"), { street: "12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056" });
  assert.deepEqual(parts("12 Smith St, Brunswick, VIC 3056"), { street: "12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056" });
  assert.deepEqual(parts("12 Smith St, Brunswick VIC 3056, Australia"), { street: "12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056" });
});

test("long state names, no commas and postcode first all work", () => {
  assert.deepEqual(parts("12 Smith Street Brunswick Victoria 3056"), { street: "12 Smith Street", suburb: "Brunswick", state: "VIC", postcode: "3056" });
  assert.deepEqual(parts("12 Smith St, Brunswick 3056 vic"), { street: "12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056" });
  assert.deepEqual(parts("5 George St, Sydney New South Wales 2000"), { street: "5 George St", suburb: "Sydney", state: "NSW", postcode: "2000" });
});

test("units and suburbs with two words", () => {
  assert.deepEqual(parts("Unit 2, 12 Smith St, Brunswick East VIC 3057"), { street: "Unit 2, 12 Smith St", suburb: "Brunswick East", state: "VIC", postcode: "3057" });
  assert.deepEqual(parts("2/12 Smith St Box Hill North VIC 3129"), { street: "2/12 Smith St", suburb: "Box Hill North", state: "VIC", postcode: "3129" });
  assert.deepEqual(parts("12 Victoria St, Richmond VIC 3121"), { street: "12 Victoria St", suburb: "Richmond", state: "VIC", postcode: "3121" });
});

test("when the suburb can't be told apart it's left empty, not guessed", () => {
  assert.deepEqual(parts("12 Smith St"), { street: "12 Smith St", suburb: "", state: "", postcode: "" });
  assert.deepEqual(parts("Lot 5 Hillview Estate"), { street: "Lot 5 Hillview Estate", suburb: "", state: "", postcode: "" });
  assert.deepEqual(parts("Brunswick VIC 3056"), { street: "", suburb: "Brunswick", state: "VIC", postcode: "3056" });
  assert.deepEqual(parts(""), { street: "", suburb: "", state: "", postcode: "" });
});

test("the one line is made from the parts", () => {
  assert.equal(formatAddress(parseAddress("12 Smith Street, Brunswick, Victoria 3056")), "12 Smith Street, Brunswick VIC 3056");
  assert.equal(formatAddress({ ...parseAddress("1 Queen St, Auckland 1010"), country: "New Zealand", state: "" }), "1 Queen St, Auckland 1010, New Zealand");
});

test("a request can send parts or one line", () => {
  assert.equal(toAddress("12 Smith St, Brunswick VIC 3056").suburb, "Brunswick");
  const fromParts = toAddress({ street: " 12 Smith St ", suburb: "Brunswick", state: "victoria", postcode: "3056", latitude: 999 });
  assert.equal(fromParts.street, "12 Smith St");
  assert.equal(fromParts.state, "VIC");
  assert.equal(fromParts.country, "Australia");
  assert.equal(fromParts.latitude, null);
  assert.equal(toAddress(null).street, "");
});

test("Google's parts become Grid's", () => {
  const address = addressFromGoogle({
    id: "place-1",
    formattedAddress: "2/12 Smith St, Brunswick VIC 3056, Australia",
    addressComponents: [
      { longText: "2", shortText: "2", types: ["subpremise"] },
      { longText: "12", shortText: "12", types: ["street_number"] },
      { longText: "Smith Street", shortText: "Smith St", types: ["route"] },
      { longText: "Brunswick", shortText: "Brunswick", types: ["locality", "political"] },
      { longText: "Victoria", shortText: "VIC", types: ["administrative_area_level_1", "political"] },
      { longText: "Australia", shortText: "AU", types: ["country", "political"] },
      { longText: "3056", shortText: "3056", types: ["postal_code"] },
    ],
    location: { latitude: -37.77, longitude: 144.96 },
  });
  assert.deepEqual(address, { street: "2/12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056", country: "Australia", placeId: "place-1", latitude: -37.77, longitude: 144.96 });
  assert.equal(formatAddress(address), "2/12 Smith St, Brunswick VIC 3056");
});

test("saving and reading back the columns", () => {
  const columns = addressColumns(parseAddress("12 Smith St, Brunswick VIC 3056"));
  assert.equal(columns.address, "12 Smith St, Brunswick VIC 3056");
  assert.equal(columns.suburb, "Brunswick");
  assert.equal(addressFromColumns(columns).postcode, "3056");
  // Saved before parts existed: split from the one line.
  assert.equal(addressFromColumns({ address: "12 Smith St, Brunswick VIC 3056" }).suburb, "Brunswick");
  // Empty is all null.
  assert.deepEqual(Object.values(addressColumns(toAddress(""))), [null, null, null, null, null, null, null, null, null]);
});

test("quotes keep the site address with site in front", () => {
  const columns = addressColumnsWithPrefix(parseAddress("12 Smith St, Brunswick VIC 3056"), "site");
  assert.equal(columns.siteAddress, "12 Smith St, Brunswick VIC 3056");
  assert.equal(columns.siteSuburb, "Brunswick");
  assert.equal(addressFromPrefixedColumns(columns, "site").street, "12 Smith St");
});

test("optional addresses: left out, cleared or given", async () => {
  const { addressData, toOptionalAddress, withAddressParts } = await import("../src/address.ts");
  assert.equal(toOptionalAddress(undefined), undefined);
  assert.equal(toOptionalAddress(null), null);
  assert.equal(toOptionalAddress(""), null);
  assert.equal(toOptionalAddress({ street: "", suburb: "" }), null);
  assert.equal(toOptionalAddress("12 Smith St, Brunswick VIC 3056")?.suburb, "Brunswick");
  assert.deepEqual(addressData(undefined), {});
  assert.equal(addressData(null).suburb, null);
  const row = withAddressParts({ id: "1", address: "12 Smith St, Brunswick VIC 3056", street: "12 Smith St", suburb: "Brunswick", state: "VIC", postcode: "3056", country: "Australia", placeId: null, latitude: null, longitude: null });
  assert.deepEqual(Object.keys(row), ["id", "address", "addressParts"]);
  assert.equal(row.addressParts?.suburb, "Brunswick");
  assert.equal(withAddressParts({ address: null, street: null }).addressParts, null);
});
