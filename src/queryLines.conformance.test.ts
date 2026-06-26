import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextDatalog.ts";

// #41: BOTH dialects carry real source lines.
const h = new Handler({"mimetype":"application/vnd.datalog","glyph":"🧠","extensions":[".dl",".datalog"]});
const src = "parent(a,b).\nancestor(X,Y):-parent(X,Y).\n";

describe("#41 query-line conformance (both dialects)", () => {
    it("jsonpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "jsonpath", pattern: "$..*" }]); });
    it("xpath", async () => { await assertQueryLineConformance(h, [{ source: src, dialect: "xpath", pattern: "//*" }]); });
});
