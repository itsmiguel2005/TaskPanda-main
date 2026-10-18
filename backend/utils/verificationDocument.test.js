const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  hasImageSignature,
  prepareVerificationDocument,
  rasterizeSinglePagePdf,
} = require("./verificationDocument");

function createPdf(pageCount = 1) {
  const stream = "BT /F1 18 Tf 32 320 Td (PhilSys test) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_unused, index) => `${3 + index * 3} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = 3 + index * 3;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 ${pageId + 1} 0 R >> >> /Contents ${pageId + 2} 0 R >>`);
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("image uploads require a recognized file signature", async () => {
  const png = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#ffffff" },
  }).png().toBuffer();
  assert.equal(hasImageSignature(png), true);
  await assert.rejects(
    prepareVerificationDocument(Buffer.from("not an image"), "image/png"),
    { statusCode: 400 },
  );
});

test("single-page digital ID PDFs rasterize to an OCR-ready PNG", async () => {
  const result = await prepareVerificationDocument(createPdf(), "application/pdf");
  assert.equal(result.isPdf, true);
  assert.equal(result.format, "png");
  assert.equal(hasImageSignature(result.buffer), true);
});

test("multi-page PDFs are rejected", async () => {
  await assert.rejects(
    rasterizeSinglePagePdf(createPdf(2)),
    { statusCode: 400, message: "Upload a single-page PDF of your PhilSys ID." },
  );
});
