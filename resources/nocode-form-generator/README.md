# Example bank of the No Code form generator

`bank.json.gz` holds the request -> reduced JSON pairs from which `js/nocode_form_generate.js` (the Flash mode of the
Tigo panel) picks the 3 examples closest to a request. Format: `{"format": 1, "contractVersion", "docs": [{"id", "lang",
"u", "a"}]}`, `u` the request as the user turn, `a` the reduced form JSON.

- 1,857 pairs, 1,082 in French and 775 in English, over 80 business domains.
- The requests were written by Mistral Large 4 (synthetic requests, no customer data), plus requests derived from the
  Mini CRM templates of C8Oforms. Each answer compiled and validated against the No Code form contract
  `2026-11-19.c8oforms-v27`.
- An example written for an older contract is still a fair example: the generator compiles and validates its own answer
  against the installed contract and repairs it from the exact errors.

Rebuild it when the contract changes what a valid form looks like, and keep the same format.
