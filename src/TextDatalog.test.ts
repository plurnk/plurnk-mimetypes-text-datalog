import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextDatalog from "./TextDatalog.ts";

const metadata = {
    mimetype: "application/vnd.datalog",
    glyph: "🧠",
    extensions: [".dl", ".datalog"] as const,
};

describe("TextDatalog — instantiation", () => {
    it("instantiates with metadata", () => {
        const h = new TextDatalog(metadata);
        assert.equal(h.mimetype, "application/vnd.datalog");
        assert.equal(h.glyph, "🧠");
    });
});

describe("TextDatalog — extract", () => {
    it("extracts a fact as a predicate (function kind)", () => {
        const h = new TextDatalog(metadata);
        const src = "father(tom, bob).";
        const syms = h.extractRaw(src);
        const f = syms.find((s) => s.name === "father");
        assert.ok(f);
        assert.equal(f.kind, "function");
        assert.deepEqual(f.params, ["tom", "bob"]);
    });

    it("extracts a rule (clause with body) as a predicate", () => {
        const h = new TextDatalog(metadata);
        const src = "parent(X, Y) :- father(X, Y).";
        const syms = h.extractRaw(src);
        const p = syms.find((s) => s.name === "parent");
        assert.ok(p);
        assert.equal(p.kind, "function");
        assert.deepEqual(p.params, ["X", "Y"]);
    });

    it("dedupes multiple clauses of the same predicate (name, arity)", () => {
        const h = new TextDatalog(metadata);
        const src = [
            "ancestor(X, Y) :- parent(X, Y).",
            "ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).",
        ].join("\n");
        const syms = h.extractRaw(src);
        const ancestors = syms.filter((s) => s.name === "ancestor");
        assert.equal(ancestors.length, 1);
    });

    it("treats same name with different arities as distinct predicates", () => {
        const h = new TextDatalog(metadata);
        const src = [
            "edge(a, b).",
            "edge(a, b, weight).",
        ].join("\n");
        const syms = h.extractRaw(src);
        const edges = syms.filter((s) => s.name === "edge");
        assert.equal(edges.length, 2, "edge/2 and edge/3 are distinct");
    });

    it("excludes queries (predicate already known by context)", () => {
        const h = new TextDatalog(metadata);
        const src = [
            "father(tom, bob).",
            "ancestor(X, Y)?",
        ].join("\n");
        const syms = h.extractRaw(src);
        const names = syms.map((s) => s.name);
        assert.deepEqual(names, ["father"]);
    });

    it("excludes retractions", () => {
        const h = new TextDatalog(metadata);
        const src = [
            "father(tom, bob).",
            "father(tom, bob)~",
        ].join("\n");
        const syms = h.extractRaw(src);
        const fathers = syms.filter((s) => s.name === "father");
        assert.equal(fathers.length, 1);
    });

    it("extracts predicates with string-symbol names", () => {
        const h = new TextDatalog(metadata);
        const src = "\"my predicate\"(a, b).";
        const syms = h.extractRaw(src);
        const p = syms.find((s) => s.name === "my predicate");
        assert.ok(p);
    });

    it("returns empty array for empty input", () => {
        const h = new TextDatalog(metadata);
        assert.deepEqual(h.extractRaw(""), []);
    });

    it("does not throw on malformed source", () => {
        const h = new TextDatalog(metadata);
        assert.doesNotThrow(() => h.extractRaw("(((broken"));
        assert.doesNotThrow(() => h.extractRaw("@@ bogus"));
    });
});

describe("TextDatalog — framework integration", () => {
    it("renders extracted hierarchy via format()", async () => {
        const h = new TextDatalog(metadata);
        const out = await h.symbolsRaw("answer(42).");
        assert.ok(out.includes("function answer"));
    });

    it("jsonpath dispatches against the deep-json ANTLR parse tree (issue #10)", async () => {
        // Every ANTLR deep tree has a root with a `type` field — verify
        // jsonpath reaches it via the deep-channel dispatch.
        const h = new TextDatalog(metadata);
        const roots = await h.query("class Probe {}", "jsonpath", "$.type");
        assert.equal(roots.length, 1);
        assert.equal(typeof roots[0].matched, "string");
    });
});

// Real-world smoke against a representative Datalog program — the
// transitive-closure / ancestor pattern that's the canonical Datalog
// example.
describe("TextDatalog — real-world smoke (transitive closure)", () => {
    const SRC = [
        "# facts",
        "parent(alice, bob).",
        "parent(bob, charlie).",
        "parent(charlie, dave).",
        "",
        "# rules",
        "ancestor(X, Y) :- parent(X, Y).",
        "ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).",
        "",
        "# graph variant with edge weights",
        "edge(a, b, 5).",
        "edge(b, c, 3).",
        "edge(c, d, 2).",
        "",
        "path(X, Y, W) :- edge(X, Y, W).",
        "path(X, Y, W) :- edge(X, Z, W1), path(Z, Y, W2), sum(W1, W2, W).",
    ].join("\n");

    it("surfaces all unique predicates", () => {
        const h = new TextDatalog(metadata);
        const syms = h.extractRaw(SRC);
        const names = new Set(syms.map((s) => s.name));

        assert.ok(names.has("parent"));
        assert.ok(names.has("ancestor"));
        assert.ok(names.has("edge"));
        assert.ok(names.has("path"));
    });

    it("dedupes parent and ancestor (multiple clauses each)", () => {
        const h = new TextDatalog(metadata);
        const syms = h.extractRaw(SRC);
        const parents = syms.filter((s) => s.name === "parent");
        assert.equal(parents.length, 1);
        const ancestors = syms.filter((s) => s.name === "ancestor");
        assert.equal(ancestors.length, 1);
    });
});
