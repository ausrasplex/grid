// Digitally seals a finished PDF (PAdES, ETSI.CAdES.detached), so PDF
// readers show it as signed and flag any later change. Self-hosted
// servers make their own sealing certificate the first time it's needed
// and keep it, encrypted with APP_ENCRYPTION_KEY, in ServerSetting
// "signing" (so it's in every database backup, and useless without the
// key in secrets.env). A company's own certificate can replace it later.

import "server-only";
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import signpdf from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { db, decryptSecret, encryptSecret } from "@grid/db";

interface StoredCert {
  p12Enc: string;
  passEnc: string;
  /** SHA-256 of the certificate, shown on certificate pages. */
  fingerprint: string;
  subject: string;
  createdAt: string;
}

let cached: Promise<{ p12: Buffer; pass: string; fingerprint: string; subject: string }> | null = null;

function makeCertificate(): StoredCert {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const forgePublicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString());
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forgePublicKey;
  certificate.serialNumber = "01" + randomBytes(8).toString("hex");
  certificate.validity.notBefore = new Date(Date.now() - 86_400_000);
  certificate.validity.notAfter = new Date(Date.now() + 20 * 365 * 86_400_000);
  const host = (process.env.PUBLIC_LINK_BASE || process.env.BETTER_AUTH_URL || "self-hosted").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const subject = `Grid document seal (${host})`;
  const attrs = [
    { name: "commonName", value: subject },
    { name: "organizationName", value: "Grid" },
  ];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  ]);
  certificate.sign(key, forge.md.sha256.create());
  const pass = randomBytes(24).toString("base64url");
  const keyStore = forge.pkcs12.toPkcs12Asn1(key, [certificate], pass, { algorithm: "aes256" });
  const keyStoreBytes = forge.asn1.toDer(keyStore).getBytes();
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return {
    p12Enc: encryptSecret(Buffer.from(keyStoreBytes, "binary").toString("base64")),
    passEnc: encryptSecret(pass),
    fingerprint: createHash("sha256").update(Buffer.from(certDer, "binary")).digest("hex"),
    subject,
    createdAt: new Date().toISOString(),
  };
}

async function sealingCert() {
  if (!cached) {
    cached = (async () => {
      let row = await db.serverSetting.findUnique({ where: { key: "signing" } });
      if (!row) {
        const made = makeCertificate();
        // Two servers starting at once: the first insert wins, the other re-reads.
        await db.serverSetting.createMany({ data: [{ key: "signing", value: made as never }], skipDuplicates: true });
        row = await db.serverSetting.findUniqueOrThrow({ where: { key: "signing" } });
      }
      const stored = row.value as unknown as StoredCert;
      return { p12: Buffer.from(decryptSecret(stored.p12Enc), "base64"), pass: decryptSecret(stored.passEnc), fingerprint: stored.fingerprint, subject: stored.subject };
    })();
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** The seal's name and fingerprint, for the certificate page. */
export async function sealInfo() {
  const certificate = await sealingCert();
  return { subject: certificate.subject, fingerprint: certificate.fingerprint };
}

/** Adds an invisible digital seal to the whole PDF. */
export async function sealPdf(pdf: Buffer, options: { reason: string; name: string; location?: string; signingTime?: Date }): Promise<Buffer> {
  const certificate = await sealingCert();
  const doc = await PDFDocument.load(pdf);
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: options.reason,
    contactInfo: "",
    name: options.name,
    location: options.location ?? "",
    signingTime: options.signingTime,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    appName: "Grid",
  });
  const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));
  return signpdf.sign(withPlaceholder, new P12Signer(certificate.p12, { passphrase: certificate.pass }), options.signingTime);
}
