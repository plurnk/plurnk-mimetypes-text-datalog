import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextDatalog.ts";

// #41: structural matches carry source-line spans (coverage gate).
const h = new Handler({"mimetype":"application/vnd.datalog","glyph":"🧠","extensions":[".dl",".datalog"]});

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [{ source: "parent(a,b).\nancestor(X,Y):-parent(X,Y).\n", dialect: "jsonpath", pattern: "$..*" }]);
    });
});
