import { test } from "node:test";
import assert from "node:assert/strict";
import { clientLabel, quoteDetails, roleLine } from "../people.ts";

const honeywell = { id: "b1", name: "Honeywell", abn: "11 222 333 444", email: "office@honeywell.example", phone: "03 9000 0000", address: "1 Office Rd, Melbourne VIC", addressParts: null };
const sam = { name: "Sam Lee", contactName: null, role: "Project Manager", email: "sam@honeywell.example", phone: null, address: null, addressParts: null, abn: null, business: honeywell };
const jane = { name: "Jane Citizen", contactName: "Jane", role: null, email: null, phone: "0400 000 000", address: "2 Home St", addressParts: null, abn: null, business: null };

test("a person at a business reads with the business", () => {
  assert.equal(clientLabel(sam), "Sam Lee, Honeywell");
  assert.equal(clientLabel(jane), "Jane Citizen");
  assert.equal(roleLine(sam), "Project Manager, Honeywell");
  assert.equal(roleLine({ role: null, business: honeywell }), "Honeywell");
  assert.equal(roleLine(jane), null);
});

test("quote details: the person's own first, the business fills the gaps", () => {
  const details = quoteDetails(sam);
  assert.equal(details.email, "sam@honeywell.example");
  assert.equal(details.phone, "03 9000 0000");
  assert.equal(details.address, "1 Office Rd, Melbourne VIC");
  assert.equal(details.abn, "11 222 333 444");
  assert.equal(details.businessName, "Honeywell");
  assert.equal(details.contactName, null);
});

test("the business's ABN wins over one typed on the person", () => {
  assert.equal(quoteDetails({ ...sam, abn: "99 999 999 999" }).abn, "11 222 333 444");
  assert.equal(quoteDetails({ ...sam, abn: "99 999 999 999", business: { ...honeywell, abn: null } }).abn, "99 999 999 999");
});

test("a client with no business is unchanged", () => {
  const details = quoteDetails(jane);
  assert.deepEqual(details, { name: "Jane Citizen", contactName: "Jane", role: null, businessName: null, email: null, phone: "0400 000 000", address: "2 Home St", addressParts: null, abn: null });
});
