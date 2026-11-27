import { test } from "node:test";
import assert from "node:assert/strict";
import { readTable } from "../transfer.ts";
import { readVCards, toVCard, vcardFileName, vcardsToTable } from "../vcard.ts";

const photo = new Uint8Array(Array.from({ length: 300 }, (_, index) => index % 256));

test("writing: vCard 3.0 with CRLF, folded lines, escaped text and a photo", () => {
  const text = toVCard({
    name: "Steve Serci",
    role: "Project Manager",
    phone: "0417 383 905",
    email: "steve.serci@siemens.example",
    notes: "Gate code 1234; ring first, then text",
    business: { name: "Siemens Pty Ltd", phone: "03 9000 0000", address: "1 Main Rd, Clayton VIC 3168" },
    photo,
  });
  assert.ok(text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
  assert.ok(text.endsWith("END:VCARD\r\n"));
  assert.ok(text.includes("N:Serci;Steve;;;\r\n"));
  assert.ok(text.includes("ORG:Siemens Pty Ltd\r\n"));
  assert.ok(text.includes("NOTE:Gate code 1234\\; ring first\\, then text\r\n"));
  assert.ok(text.includes("ADR;TYPE=WORK:;;1 Main Rd;Clayton;VIC;3168;Australia\r\n"));
  // No line longer than 75 characters.
  assert.ok(text.split("\r\n").every((line) => line.length <= 75));
});

test("writing then reading gives the same contact back", () => {
  const [contact] = readVCards(
    toVCard({
      name: "Steve Serci",
      role: "Project Manager",
      phone: "0417 383 905",
      email: "steve.serci@siemens.example",
      notes: "Line one\nLine two; with, punctuation \\ and a backslash",
      business: { name: "Siemens Pty Ltd", phone: "03 9000 0000", address: "1 Main Rd, Clayton VIC 3168" },
      photo,
    }),
  );
  assert.equal(contact!.name, "Steve Serci");
  assert.equal(contact!.business, "Siemens Pty Ltd");
  assert.equal(contact!.role, "Project Manager");
  assert.equal(contact!.phone, "0417 383 905");
  assert.equal(contact!.businessPhone, "03 9000 0000");
  assert.equal(contact!.email, "steve.serci@siemens.example");
  assert.equal(contact!.businessAddress, "1 Main Rd, Clayton VIC 3168");
  assert.equal(contact!.notes, "Line one\nLine two; with, punctuation \\ and a backslash");
  assert.deepEqual(contact!.photo, photo);
});

test("reading: an older Android file (2.1, quoted-printable, bare types, photo lines)", () => {
  const file = [
    "BEGIN:VCARD",
    "VERSION:2.1",
    "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ren=C3=A9e;Jos=C3=A9;;;",
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Ren=C3=A9e",
    "TEL;HOME;VOICE:03 9999 1111",
    "TEL;CELL:0400 111 222",
    "NOTE;ENCODING=QUOTED-PRINTABLE:A long note that goes past the end of a line and so =",
    "is carried=",
    "on",
    "PHOTO;ENCODING=BASE64;JPEG:" + btoa("JPEGDATA-1"),
    "",
    "END:VCARD",
  ].join("\r\n");
  const [contact] = readVCards(file);
  assert.equal(contact!.name, "José Renée");
  assert.equal(contact!.phone, "0400 111 222");
  assert.equal(contact!.business, null);
  assert.equal(contact!.notes, "A long note that goes past the end of a line and so is carriedon");
  assert.equal(new TextDecoder().decode(contact!.photo!), "JPEGDATA-1");
});

test("reading: an iPhone file with groups, several contacts, and a 4.0 photo address", () => {
  const file = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Lee;Sam;;;",
    "FN:Sam Lee",
    "ORG:Honeywell;Building Solutions",
    "TITLE:Service Technician",
    'item1.TEL;type=pref;type="WORK","VOICE":03 8000 1000',
    "item2.TEL;type=CELL:0411 111 111",
    "item3.EMAIL;type=INTERNET;type=pref:sam@honeywell.example",
    "item4.ADR;type=WORK:;;12 Factory Ln;Mulgrave;VIC;3170;Australia",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:4.0",
    "FN:Acme Electrical",
    "ORG:Acme Electrical",
    "TEL;VALUE=uri;TYPE=work:tel:+61-3-9000-0001",
    "PHOTO:data:image/jpeg;base64," + btoa("JPEGDATA-2"),
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "END:VCARD",
  ].join("\n");
  const contacts = readVCards(file);
  // The empty card (no name at all) is left out.
  assert.equal(contacts.length, 2);
  const sam = contacts[0]!;
  assert.equal(sam.business, "Honeywell");
  assert.equal(sam.role, "Service Technician");
  assert.equal(sam.phone, "0411 111 111");
  assert.equal(sam.businessPhone, "03 8000 1000");
  assert.equal(sam.businessAddress, "12 Factory Ln, Mulgrave VIC 3170");
  assert.equal(sam.address, null);
  const acme = contacts[1]!;
  // A card that's only a business: a client with the business's name, no business.
  assert.equal(acme.name, "Acme Electrical");
  assert.equal(acme.business, null);
  assert.equal(new TextDecoder().decode(acme.photo!), "JPEGDATA-2");

  // Into the import's table: the same columns as a zip, photos named.
  const { cells, pictures } = vcardsToTable(contacts);
  const { rows, skipped } = readTable(cells);
  assert.equal(skipped.length, 0);
  assert.equal(rows[0]!.business!.name, "Honeywell");
  assert.equal(rows[0]!.business!.phone, "03 8000 1000");
  assert.equal(rows[0]!.person!.phone, "0411 111 111");
  assert.equal(rows[1]!.business, null);
  assert.equal(rows[1]!.person!.phone, "+61-3-9000-0001");
  assert.equal(rows[1]!.personPicture, "photos/2.jpg");
  assert.deepEqual([...pictures.keys()], ["photos/2.jpg"]);
});

test("file names are safe", () => {
  assert.equal(vcardFileName("Steve Serci"), "Steve Serci.vcf");
  assert.equal(vcardFileName('A/B: "C"'), "A B C.vcf");
  assert.equal(vcardFileName("   "), "Contact.vcf");
});
