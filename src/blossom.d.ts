/** Edmonds' maximum weighted matching (MIT, see node_modules/edmonds-blossom-fixed/LICENSE). */
declare module 'edmonds-blossom-fixed' {
  /** Edges [u, v, weight]; returns for every vertex its mate, or -1. */
  export default function blossom(edges: [number, number, number][], maxCardinality?: boolean): number[]
}
