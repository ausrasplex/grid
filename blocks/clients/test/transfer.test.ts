import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, abnKey, businessNameKey, planImport, readTable, toTable, updateFields, type BusinessCard, type PersonCard } from "../transfer.ts";

const blankBusiness = { abn: null, phone: null, email: null, address: null, notes: null };
const blankPerson = { role: null, contactName: null, phone: null, email: null, address: null, abn: null, notes: null };

const siemens: BusinessCard = { id: "b-siemens", name: "Siemens Pty Ltd", ...blankBusiness, abn: "98 004 347 880", phone: "03 9000 0000" };
const honeywell: BusinessCard = { id: "b-honeywell", name: "Honeywell", ...blankBusiness };
const empty: BusinessCard = { id: "b-empty", name: "Acme Electrical", ...blankBusiness };
const steve: PersonCard = { id: "p-steve", businessId: "b-siemens", name: "Steve Serci", ...blankPerson, role: "Project Manager", email: "steve.serci@siemens.example" };
const jane: PersonCard = { id: "p-jane", businessId: null, name: "Jane Citizen", ...blankPerson, phone: "0400 000 000", abn: "51 824 753 556" };
const list = { businesses: [siemens, honeywell, empty], people: [steve, jane] };

test("export: one row per person, a row for a business with nobody, sorted", () => {
  const table = toTable(list.businesses, list.people);
  assert.deepEqual(table[0], [...COLUMNS]);
  assert.equal(table.length, 5); // headings, Acme, Honeywell, Jane, Siemens/Steve
  assert.deepEqual(
    table.slice(1).map((row) => [row[0], row[6]]),
    [
      ["Acme Electrical", ""],
      ["Honeywell", ""],
      ["", "Jane Citizen"],
      ["Siemens Pty Ltd", "Steve Serci"],
    ],
  );
  const steveRow = table[4]!;
  assert.equal(steveRow[1], "98 004 347 880");
  assert.equal(steveRow[7], "Project Manager");
  // A person with no business keeps their own ABN in ABN.
  assert.equal(table[3]![12], "51 824 753 556");
});

test("export then import gives back the same list with nothing to do", () => {
  const { rows, skipped } = readTable(toTable(list.businesses, list.people));
  assert.equal(skipped.length, 0);
  const plan = planImport(rows, list);
  assert.equal(plan.businesses.length, 3);
  assert.ok(plan.businesses.every((business) => business.match && business.changes.length === 0));
  assert.equal(plan.people.length, 2);
  assert.ok(plan.people.every((person) => person.match && person.changes.length === 0 && !person.movesBusiness));
  assert.equal(plan.people.find((person) => person.fields.name === "Jane Citizen")!.fields.abn, "51 824 753 556");
});

test("reading: loose headings, first and last names, unknown columns ignored", () => {
  const { rows, columnsFound } = readTable([
    [],
    ["Company", "First name", "Surname", "Job title", "Mobile", "E-mail", "Favourite colour"],
    ["Honeywell", "Sam", "Lee", "Service Technician", "0411 111 111", "sam@honeywell.example", "Blue"],
  ]);
  assert.deepEqual(columnsFound, ["Company", "First name", "Surname", "Job title", "Mobile", "E-mail"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.line, 3);
  assert.equal(rows[0]!.business!.name, "Honeywell");
  assert.deepEqual(rows[0]!.person, { name: "Sam Lee", ...blankPerson, role: "Service Technician", phone: "0411 111 111", email: "sam@honeywell.example" });
});

test("reading: rows with no name or business, and bad emails, are skipped with a reason", () => {
  const { rows, skipped } = readTable([
    ["Name", "Business", "Email", "Phone"],
    ["", "", "", "0400 000 000"],
    ["Bob", "", "bob at home", ""],
    ["", "", "", ""],
    ["Kim", "", "kim@example.com", ""],
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(skipped, [
    { line: 2, reason: "No name or business" },
    { line: 3, reason: "Check the email address (bob at home)" },
  ]);
});

test("reading: with no Business ABN column, ABN on a business row is the business's", () => {
  const { rows } = readTable([
    ["Business", "Name", "ABN"],
    ["Siemens", "Steve", "98004347880"],
    ["", "Jane", "51824753556"],
  ]);
  assert.equal(rows[0]!.business!.abn, "98004347880");
  assert.equal(rows[0]!.person!.abn, null);
  assert.equal(rows[1]!.person!.abn, "51824753556");
});

test("matching keys: ABN digits, business names without Pty Ltd", () => {
  assert.equal(abnKey("98 004 347 880"), "98004347880");
  assert.equal(abnKey("123"), null);
  assert.equal(businessNameKey("Siemens Pty. Ltd."), "siemens");
  assert.equal(businessNameKey("  SIEMENS  "), "siemens");
});

test("businesses match by ABN first, then by name; the same business on several rows is one", () => {
  const { rows } = readTable([
    ["Business", "Business ABN", "Business phone", "Name", "Email"],
    ["Siemens Building Tech", "98004347880", "03 9111 1111", "Steve Serci", "STEVE.SERCI@siemens.example"],
    ["Siemens Building Tech", "", "", "Mia Wong", "mia@siemens.example"],
    ["honeywell", "", "", "", ""],
    ["New Co", "", "", "Ali", ""],
  ]);
  const plan = planImport(rows, list);
  assert.equal(plan.businesses.length, 3);
  const siemensPlan = plan.businesses.find((business) => business.match?.id === "b-siemens")!;
  assert.equal(siemensPlan.match!.by, "abn");
  assert.deepEqual(siemensPlan.lines, [2, 3]);
  assert.deepEqual(
    siemensPlan.changes.map((change) => change.field),
    ["name", "phone"],
  );
  assert.equal(siemensPlan.suggested, "skip");
  assert.equal(plan.businesses.find((business) => business.match?.id === "b-honeywell")!.match!.by, "name");
  const newCo = plan.businesses.find((business) => business.fields.name === "New Co")!;
  assert.equal(newCo.match, null);
  assert.equal(newCo.suggested, "add");

  // Steve matches by email (case doesn't count) with nothing new; Mia and Ali are new.
  const stevePlan = plan.people.find((person) => person.fields.name === "Steve Serci")!;
  assert.equal(stevePlan.match!.by, "email");
  assert.equal(stevePlan.changes.length, 0);
  assert.equal(stevePlan.movesBusiness, false);
  assert.equal(plan.people.find((person) => person.fields.name === "Mia Wong")!.match, null);
  assert.equal(plan.people.find((person) => person.fields.name === "Ali")!.businessKey, newCo.key);
});

test("people match by name only at the same business; email at another business moves them", () => {
  const { rows } = readTable([
    ["Business", "Name", "Email", "Role"],
    ["Honeywell", "Steve Serci", "", ""],
    ["", "Jane Citizen", "", ""],
    ["Honeywell", "Someone", "steve.serci@siemens.example", "Area Manager"],
  ]);
  const plan = planImport(rows, list);
  // Steve Serci by name at Honeywell isn't the Steve at Siemens.
  assert.equal(plan.people.find((person) => person.lines[0] === 2)!.match, null);
  // Jane, no business both sides, matches by name.
  assert.equal(plan.people.find((person) => person.lines[0] === 3)!.match!.id, "p-jane");
  // Same email as Steve, at Honeywell in the file: Update would move him there.
  const moved = plan.people.find((person) => person.lines[0] === 4)!;
  assert.equal(moved.match!.id, "p-steve");
  assert.equal(moved.movesBusiness, true);
  assert.deepEqual(updateFields(moved), { name: "Someone", role: "Area Manager" });
});

test("a blank cell never counts as a change", () => {
  const { rows } = readTable([
    ["Name", "Phone", "Email"],
    ["Jane Citizen", "", ""],
  ]);
  const plan = planImport(rows, list);
  assert.equal(plan.people[0]!.changes.length, 0);
});

test("pictures: a zip's table names them in two more columns; plain files have none", () => {
  const plain = toTable([{ ...siemens, picture: "pictures/siemens.jpg" }], [{ ...steve, picture: "pictures/steve.jpg" }]);
  assert.equal(plain[0]!.length, COLUMNS.length);
  const zipped = toTable([{ ...siemens, picture: "pictures/siemens.jpg" }], [{ ...steve, picture: "pictures/steve.jpg" }], { pictures: true });
  assert.deepEqual(zipped[0]!.slice(-2), ["Business picture", "Picture"]);
  assert.deepEqual(zipped[1]!.slice(-2), ["pictures/siemens.jpg", "pictures/steve.jpg"]);
});

test("pictures: only ones in the zip count, and never replace one Grid already has", () => {
  const { rows } = readTable([
    ["Business", "Business picture", "Name", "Email", "Picture"],
    ["Siemens Pty Ltd", "pictures/siemens.jpg", "Steve Serci", "steve.serci@siemens.example", "pictures/steve.jpg"],
    ["Honeywell", "pictures/missing.jpg", "Sam Lee", "", "pictures/sam.jpg"],
  ]);
  const withPictures = {
    businesses: [{ ...siemens, picture: "pictures/clients/x/logo.jpg" }, honeywell, empty],
    people: [{ ...steve, picture: null }, jane],
  };
  const plan = planImport(rows, withPictures, [], new Set(["pictures/siemens.jpg", "pictures/steve.jpg", "pictures/sam.jpg"]));
  const siemensPlan = plan.businesses.find((business) => business.match?.id === "b-siemens")!;
  // Siemens already has a logo: the zip's doesn't replace it.
  assert.equal(siemensPlan.picture, "pictures/siemens.jpg");
  assert.equal(siemensPlan.changes.length, 0);
  // Honeywell's picture isn't in the zip: ignored.
  assert.equal(plan.businesses.find((business) => business.match?.id === "b-honeywell")!.picture, null);
  // Steve has no photo yet: Update would add the zip's, and it isn't a field to write.
  const stevePlan = plan.people.find((person) => person.match?.id === "p-steve")!;
  assert.deepEqual(stevePlan.changes.map((change) => change.field), ["picture"]);
  assert.deepEqual(updateFields(stevePlan), {});
  assert.equal(plan.people.find((person) => person.fields.name === "Sam Lee")!.picture, "pictures/sam.jpg");
});
