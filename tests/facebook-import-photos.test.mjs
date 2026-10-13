import test from "node:test";
import assert from "node:assert/strict";
import { prepareImportPhotos } from "../src/lib/fb-import-photos.server.ts";

function storage(failOnce = false) {
  const objects = new Set();
  const copies = [];
  return {
    objects,
    copies,
    storage: {
      from(bucket) {
        return {
          async info(path) {
            return { error: objects.has(`${bucket}/${path}`) ? null : { message: "Not found" } };
          },
          async copy(source, destination) {
            if (bucket === "listing-media" && failOnce) {
              failOnce = false;
              return { error: { message: "Interrupted storage dependency" } };
            }
            const key = `${bucket}/${destination}`;
            if (objects.has(key)) return { error: { message: "Object already exists" } };
            objects.add(key);
            copies.push({ bucket, source, destination });
            return { error: null };
          },
        };
      },
    },
  };
}
test("repeated publishing uses the same owned photo references without extra copies", async () => {
  const db = storage();
  const first = await prepareImportPhotos(db, "seller-one", ["_staging/batch/image.webp"]);
  const second = await prepareImportPhotos(db, "seller-one", ["_staging/batch/image.webp"]);
  assert.deepEqual(first, second);
  assert.equal(db.objects.size, 2);
  assert.equal(db.copies.length, 2);
  assert.match(first[0], /^seller-one\/import-[a-f0-9]{64}\.webp$/);
  const other = await prepareImportPhotos(db, "seller-two", ["_staging/batch/image.webp"]);
  assert.notEqual(first[0], other[0]);
  assert.equal(db.objects.size, 4);
});
test("retry after one bucket failed completes the same pair of photos", async () => {
  const db = storage(true);
  await assert.rejects(
    prepareImportPhotos(db, "seller-one", ["_staging/batch/image.jpg"]),
    /Retry publishing/,
  );
  assert.equal(db.objects.size, 1);
  const paths = await prepareImportPhotos(db, "seller-one", ["_staging/batch/image.jpg"]);
  assert.equal(db.objects.size, 2);
  assert.equal(db.copies.length, 2);
  assert.equal(db.copies[0].destination, paths[0]);
  assert.equal(db.copies[1].destination, paths[0]);
});
test("concurrent preparations tolerate a duplicate copy and return identical references", async () => {
  const db = storage();
  const [a, b] = await Promise.all([
    prepareImportPhotos(db, "seller-one", ["_staging/batch/image.png"]),
    prepareImportPhotos(db, "seller-one", ["_staging/batch/image.png"]),
  ]);
  assert.deepEqual(a, b);
  assert.equal(db.objects.size, 2);
  assert.equal(db.copies.length, 2);
});
