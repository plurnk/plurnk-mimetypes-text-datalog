import { AntlrExtractor, withExtractor } from "@plurnk/plurnk-mimetypes";
import type { ExtractionVisitor } from "@plurnk/plurnk-mimetypes";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { datalogLexer } from "./generated/datalogLexer.ts";
import { datalogParser } from "./generated/datalogParser.ts";
import { datalogVisitor } from "./generated/datalogVisitor.ts";

// text/x-datalog handler. ANTLR grammar from grammars-v4/datalog.
//
// Parser entry rule: program → statement* EOF
//   statement: assertion | retraction | query | requirement
//   assertion: clause '.'  (a fact or a rule)
//   clause:    literal ':-' body | literal
//
// In Datalog the unit of declaration is the PREDICATE — a name + arity
// rule introduced via an assertion (`parent(X, Y) :- father(X, Y).`).
// Facts (`father(tom, bob).`) extend the same predicate by name+arity.
// We surface each unique predicate once per (name, arity).
export default class TextDatalog extends AntlrExtractor {
    protected parseTree(content: string): unknown {
        const lexer = new datalogLexer(CharStream.fromString(content));
        const tokens = new CommonTokenStream(lexer);
        const parser = new datalogParser(tokens);
        parser.removeErrorListeners();
        return parser.program();
    }

    protected createVisitor(): ExtractionVisitor {
        return new TextDatalogVisitor() as unknown as ExtractionVisitor;
    }
}

class TextDatalogVisitor extends withExtractor(datalogVisitor) {
    #emittedPredicates = new Set<string>();

    visitAssertion = (ctx: any): null => {
        if (this.inBody) return null;
        const clause = ctx.clause?.();
        if (!clause) return null;
        const headLiteral = clause.literal?.();
        const head = Array.isArray(headLiteral) ? headLiteral[0] : headLiteral;
        if (!head) return null;
        const name = predicateName(head);
        if (!name) return null;
        const arity = predicateArity(head);
        const key = `${name}/${arity}`;
        if (this.#emittedPredicates.has(key)) return null;
        this.#emittedPredicates.add(key);
        const params = predicateTerms(head);
        this.addSymbol("function", name, ctx, params);
        return null;
    };

    visitRetraction = (_ctx: any): null => null;
    visitQuery = (_ctx: any): null => null;
    visitRequirement = (_ctx: any): null => null;
}

// literal:
//   predicate_sym '(' ')'
//   | predicate_sym '(' terms_ ')'
//   | predicate_sym
//   | term_ '=' term_
//   | term_ '!=' term_
//   | VARIABLE ':-' external_sym '(' terms_ ')'
function predicateName(literal: unknown): string | null {
    const node = literal as { predicate_sym?: () => unknown };
    const ps = node.predicate_sym?.();
    if (!ps) return null;
    const raw = (ps as { getText?: () => string }).getText?.() ?? null;
    if (!raw) return null;
    return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
}

function predicateTerms(literal: unknown): string[] {
    const node = literal as { terms_?: () => unknown };
    const t = node.terms_?.();
    if (!t) return [];
    return flattenTerms(t);
}

// terms_: term_ | term_ ',' terms_  (right-recursive list)
function flattenTerms(terms: unknown): string[] {
    const out: string[] = [];
    let cur: any = terms;
    while (cur) {
        const term = cur.term_?.();
        if (term) {
            const txt = (term as { getText?: () => string }).getText?.();
            if (txt) out.push(txt);
        }
        const tail = cur.terms_?.();
        cur = tail ?? null;
    }
    return out;
}

function predicateArity(literal: unknown): number {
    return predicateTerms(literal).length;
}
