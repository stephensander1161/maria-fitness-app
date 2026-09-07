import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { photoBlobKey } from "@/lib/blob";
import { photoSrc } from "@/lib/photos";

const read = (p: string) => fs.readFileSync(p, "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

suite("where a photo lives", () => {
  it("is keyed by her profile and something unguessable, never the row id or date", () => {
    const a = photoBlobKey("profile-1");
    const b = photoBlobKey("profile-1");
    expect(a).toMatch(/^photos\/profile-1\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
  });

  it("is served through a same-origin route, so the page carries no image bytes", () => {
    expect(photoSrc("abc")).toBe("/api/photos/abc");
    const lib = code(read("lib/photos.ts"));
    expect(lib).not.toMatch(/data:image/);
    // The library never selects the payload columns for the gallery.
    const gallery = lib.slice(lib.indexOf("export async function photoLibrary"), lib.indexOf("export type PhotoBytes"));
    expect(gallery).not.toMatch(/photos\.data|photos\.blobKey|select\(\)/);
  });

  it("the route asks with the profile in the query and answers 404 either way", () => {
    const route = code(read("app/api/photos/[id]/route.ts"));
    expect(route).toMatch(/photoBytes\(profile\.id, id\)/);
    expect(route).toMatch(/status: 404/);
    // One 404, not a "not yours" — a distinct answer would count another
    // person's photos.
    expect(route.match(/status: 404/g)).toHaveLength(1);
    expect(route).not.toMatch(/403/);
    const lib = code(read("lib/photos.ts"));
    expect(lib).toMatch(/and\(eq\(photos\.id, id\), eq\(photos\.profileId, profileId\)\)/);
  });

  it("every store access goes through lib/blob.ts with private access", () => {
    const blob = code(read("lib/blob.ts"));
    expect(blob.match(/access: "private"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(blob).not.toMatch(/access: "public"/);
    for (const f of walk("lib").concat(walk("app")).filter((f) => f !== "lib/blob.ts" && f !== "lib/backup.ts")) {
      expect(read(f), `${f} reaches the store directly`).not.toMatch(/from "@vercel\/blob"/);
    }
  });

  it("nothing but lib/photos.ts reads image bytes", () => {
    for (const f of walk("lib").concat(walk("app"), walk("components")).filter((f) => f !== "lib/photos.ts" && f !== "lib/blob.ts")) {
      const src = code(read(f));
      expect(src, `${f} selects photos.data`).not.toMatch(/photos\.data\b/);
      expect(src, `${f} fetches from the store`).not.toMatch(/getPrivate\(/);
    }
  });
});

suite("a photo row is never deleted without its blob", () => {
  it("each delete of a photo row releases the keys it got back", () => {
    for (const f of ["lib/tools/photos.ts", "lib/tools/corrections.ts"]) {
      const src = code(read(f));
      const deletes = [...src.matchAll(/db\.delete\(photos\)/g)];
      expect(deletes.length, `${f} has no photo delete?`).toBeGreaterThan(0);
      for (const m of deletes) {
        const after = src.slice(m.index!, m.index! + 600);
        expect(after, `${f}: a delete(photos) without returning blobKey`).toMatch(/returning\(\{[^}]*blobKey: photos\.blobKey/);
        expect(after, `${f}: a delete(photos) that never releases`).toMatch(/releasePhotoBlobs\(/);
      }
    }
  });

  it("a cascade is preceded by a sweep, because afterwards nothing remembers the key", () => {
    const account = code(read("app/api/auth/account/route.ts"));
    expect(account.indexOf("forgetPhotoBlobs(")).toBeGreaterThan(-1);
    expect(account.indexOf("forgetPhotoBlobs(")).toBeLessThan(account.indexOf("db.delete(users)"));
    const erase = code(read("lib/tools/corrections.ts"));
    const handler = erase.slice(erase.indexOf('name: "erase_all_my_data"'));
    expect(handler.indexOf("forgetPhotoBlobs(ctx.profileId)")).toBeGreaterThan(-1);
    expect(handler.indexOf("forgetPhotoBlobs(ctx.profileId)")).toBeLessThan(handler.indexOf("for (const { table, via } of OWNED)"));
  });

  it("the store is written before the row, and only when there is one", () => {
    const tool = code(read("lib/tools/photos.ts"));
    expect(tool).toMatch(/if \(blobConfigured\(\)\)/);
    expect(tool.indexOf("await putPrivate(")).toBeLessThan(tool.indexOf("db.insert(photos)"));
    expect(tool).toMatch(/data: blobKey \? null : data/);
  });
});
