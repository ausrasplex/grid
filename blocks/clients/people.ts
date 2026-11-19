// People at a business: how a client reads in lists, and whose details go on
// a quote. No imports, so it runs anywhere and is unit-tested.

export interface BusinessDetails {
  id: string;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface ClientDetails {
  name: string;
  contactName: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  abn: string | null;
  business: BusinessDetails | null;
}

/** "Sam Lee, Honeywell" for a person at a business; just the name otherwise. */
export function clientLabel(client: Pick<ClientDetails, "name"> & { business: Pick<BusinessDetails, "name"> | null }): string {
  return client.business ? `${client.name}, ${client.business.name}` : client.name;
}

/** "Project Manager, Honeywell", "Honeywell", "Project Manager", or null. */
export function roleLine(client: Pick<ClientDetails, "role"> & { business: Pick<BusinessDetails, "name"> | null }): string | null {
  return [client.role, client.business?.name].filter(Boolean).join(", ") || null;
}

/**
 * The details that go on a quote: the person's own, with the business's
 * filling the gaps (address, email, phone). The ABN is the business's when
 * there is one: the person isn't the one being billed.
 */
export function quoteDetails(client: ClientDetails) {
  const business = client.business;
  return {
    name: client.name,
    contactName: business ? null : client.contactName,
    role: client.role,
    businessName: business?.name ?? null,
    email: client.email ?? business?.email ?? null,
    phone: client.phone ?? business?.phone ?? null,
    address: client.address ?? business?.address ?? null,
    abn: business?.abn ?? client.abn ?? null,
  };
}
