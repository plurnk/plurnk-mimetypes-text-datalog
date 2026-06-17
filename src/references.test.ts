import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextDatalog from "./TextDatalog.ts";

const metadata = {
    mimetype: "application/vnd.datalog",
    glyph: "🧠",
    extensions: [".dl", ".datalog"] as const,
};
const h = () => new TextDatalog(metadata);

// Transitive-closure ancestor program — the canonical Datalog dependency graph:
// each rule's BODY atoms reference relations defined by other clauses' HEADS or
// by facts. NOTE the grammar's VARIABLE lexer rejects digits (W1), so every
// variable here is digit-free. decoyNames live only in comments.
const SRC = `# secret: do not surface this comment word
parent(alice, bob).
parent(bob, carol).

ancestor(X, Y) :- parent(X, Y).
ancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).

edge(a, b).
edge(b, c).

reachable(X, Y) :- edge(X, Y).
reachable(X, Y) :- edge(X, Z), reachable(Z, Y).
`;

describe("TextDatalog — references (dependency graph)", () => {
    it("body atoms are `use` edges to their relation, scoped to the rule head", () => {
        const refs = h().references(SRC);
        // ancestor's body references parent + (recursively) ancestor.
        assert.ok(refs.some((r) => r.name === "parent" && r.kind === "use" && r.container === "ancestor"));
        assert.ok(refs.some((r) => r.name === "ancestor" && r.kind === "use" && r.container === "ancestor"));
        // reachable's body references edge + (recursively) reachable.
        assert.ok(refs.some((r) => r.name === "edge" && r.kind === "use" && r.container === "reachable"));
        assert.ok(refs.some((r) => r.name === "reachable" && r.kind === "use" && r.container === "reachable"));
    });

    it("does NOT emit the head relation as a ref (facts emit nothing)", () => {
        // parent/edge appear only as fact heads + body atoms — every `parent`
        // ref must be a body use carrying a container, never a bare fact head.
        const refs = h().references(SRC);
        assert.ok(refs.every((r) => r.container !== undefined), "every ref is a body atom under a head");
        // Two parent body atoms (the two ancestor clauses); facts emit nothing.
        assert.equal(refs.filter((r) => r.name === "parent").length, 2);
    });

    it("kind is `use` for every ref (SPEC §16 — a body atom is a relation use)", () => {
        const refs = h().references(SRC);
        assert.ok(refs.length >= 1);
        assert.ok(refs.every((r) => r.kind === "use"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["secret", "comment", "alice", "bob", "carol"],
            expectJoins: [
                { refName: "parent", container: "ancestor" },
                { refName: "edge", container: "reachable" },
            ],
            expectRefs: [
                { name: "parent", kind: "use" },
                { name: "edge", kind: "use" },
                { name: "ancestor", kind: "use" },
            ],
        });
    });
});
