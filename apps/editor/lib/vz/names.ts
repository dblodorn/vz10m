// The shared list is public, so the API refuses obscene voice names (dmbk-graphql-api's src/lib/vz/names.ts).
// This is the same check, run here first so SAVE can say so before a request. The API's answer still decides.
// obscenity's English set handles look-alike spellings and leaves words like SCUNTHORPE alone; the second pass
// joins letters spelled out one by one (F U C K), which never merges two real words.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

let matcher: RegExpMatcher | null = null;

/** "F U C K PAD" → "FUCK PAD"; "AB CD" unchanged. */
export const joinSpelledOut = (name: string): string =>
  name.replace(/\b[A-Za-z0-9](?:[\s._*-]+[A-Za-z0-9]\b)+/g, run => run.replace(/[\s._*-]+/g, ""));

export function isNameAllowed(name: string): boolean {
  matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  return !matcher.hasMatch(name) && !matcher.hasMatch(joinSpelledOut(name));
}
