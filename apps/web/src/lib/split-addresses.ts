// Addresses saved before Grid kept them in parts (one line only) are split
// into street, suburb, state and postcode when the server starts. Runs every
// start but only touches addresses that have no parts yet, so after the
// first start it does nothing. (docs/stage-2-projects.md "Addresses")
import "server-only";
import { addressColumns, addressColumnsWithPrefix, parseAddress } from "@grid/core";
import { db } from "@grid/db";

/** No parts yet: street, suburb, state and postcode all empty. */
const noParts = { street: null, suburb: null, state: null, postcode: null };
const noSiteParts = { siteStreet: null, siteSuburb: null, siteState: null, sitePostcode: null };

export async function splitExistingAddresses(): Promise<number> {
  let split = 0;

  for (const site of await db.site.findMany({ where: noParts, select: { id: true, address: true } })) {
    const columns = addressColumns(parseAddress(site.address));
    // Site.address can't be empty: keep the old line if nothing came out of it.
    await db.site.update({ where: { id: site.id }, data: { ...columns, address: columns.address ?? site.address } });
    split++;
  }

  for (const client of await db.client.findMany({ where: { ...noParts, address: { not: null } }, select: { id: true, address: true } })) {
    await db.client.update({ where: { id: client.id }, data: addressColumns(parseAddress(client.address ?? "")) });
    split++;
  }

  for (const business of await db.clientBusiness.findMany({ where: { ...noParts, address: { not: null } }, select: { id: true, address: true } })) {
    await db.clientBusiness.update({ where: { id: business.id }, data: addressColumns(parseAddress(business.address ?? "")) });
    split++;
  }

  for (const theme of await db.docTheme.findMany({ where: { ...noParts, address: { not: null } }, select: { companyId: true, address: true } })) {
    await db.docTheme.update({ where: { companyId: theme.companyId }, data: addressColumns(parseAddress(theme.address ?? "")) });
    split++;
  }

  for (const quote of await db.quote.findMany({ where: { ...noSiteParts, siteAddress: { not: null } }, select: { id: true, siteAddress: true } })) {
    await db.quote.update({ where: { id: quote.id }, data: addressColumnsWithPrefix(parseAddress(quote.siteAddress ?? ""), "site") });
    split++;
  }

  return split;
}
