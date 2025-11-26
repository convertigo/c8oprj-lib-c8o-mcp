# Convertigo MCP Usage Guide

Ce guide est volontairement concis pour éviter de noyer l’agent. Suis le chemin rapide ci‑dessous, puis les rappels clés.

## À suivre strictement (version courte)
1) `databaseobject-children` sur le parent (copier le QName exact).  
2) `palette-list` sur ce parent avec filtre ciblé (`Call`/`JSON`/`Request`, `limit` petit). Si `content` est vide, **ne pas paginer** : ajuste le filtre ou passe directement à `palette-describe`.  
3) `palette-describe` sur `describeClassName` pour obtenir template + hints.  
4) `databaseobject-create` avec `related` (obligatoire, pas `qname`), `className`, `mode`, `properties` (`{}` si rien).  
5) Si transaction : `requestable-execute ... recordSchema=true` avant tout câblage SmartType.  
6) Dans la séquence : CallTransaction/CallSequence en `output=false`, mapping via SmartType + JsonField/XMLCopy. Pas de JS DOM (JS seulement pour des calculs simples). Ne renvoyer que le JSON final.

## HTTP Endpoints
- MCP JSON-RPC : `http://localhost:18080/convertigo/api/mcp`
- Sequence invocation (manuel) : `http://localhost:18080/convertigo/projects/<project>/.json?__sequence=<name>&var=value`
- Toujours envoyer `MCP-Protocol-Version: 2025-06-18` sur l’endpoint MCP.

## Tooling Conventions
- Préfère les outils MCP (pas d’édition YAML) : create/delete/move/rename, properties-get/set, project-save/reload.
- Palette :
  - `palette-list` retourne les essentiels ; enchaîne aussitôt `palette-describe` avec `describeClassName`.
  - Si `palette-list` est vide, ne pagine pas : change de filtre ou passe à `palette-describe` si la classe est connue.
- Navigation `databaseobject-children` :
  - `depth` 1-5, filtres après parcours, pagination via `limit`/`nextCursor`.
  - Forward `_meta.nextCursor` seulement s’il est non vide.
- `databaseobject-create` :
  - `related` obligatoire (QName parent exact), `className` (short bean), `mode` (inside/before/after/lastChild), `properties` objet JSON (`{}` si rien). Ne pas utiliser `qname` ici.
- `databaseobject-properties-set` :
  - `properties` doit être un objet JSON (ou une string qui le représente). Jamais de tableau `{name,value}`.
- `databaseobject-properties-get` :
  - Vue légère par défaut ; ajoute `includeHints=true` pour les hints détaillés.
- Séquences :
  - CallTransaction/CallSequence en `output=false`, mapping via SmartType + JsonField/XMLCopy. Pas de JS DOM ; JS réservé aux calculs simples. Ne renvoyer que le JSON final.
  - Transactions : exécuter `requestable-execute ... recordSchema=true` avant de câbler les SmartTypes, puis retester après mapping.
- Sauvegarde : `project-save` (ou `autoSave=true`) après mutation.
- QNames : sensibles à la casse, sans suffixe `.sq`.

## Testing & Verification
- Commencer par `requestable-execute` (variables = JSON string clé/valeur, jamais de query string).
- Tests HTTP `curl .../.json` optionnels, seulement si demandé et `localhost:18080` joignable.
- Log moteur utile : `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudio/.metadata/.plugins/com.twinsoft.convertigo.studio/logs/engine.log`.

## Tool: databaseobject-schema
`tools/call databaseobject-schema` pour un échantillon léger (XML/JSON/JSONSchema).
- `qname` requis ; `type` = xml/json/jsonschema ; `internal=true` pour la vue sourceDefinition (input pickers).
- Sorties déjà “dé‑wrapper” : XML racine sur l’élément cible (pas de `<document>`), JSON racine sur le payload (pas de `document/attr`).

### HTTP connector checklist
- `HttpConnector.url` : schéma + host, sans slash final. Ne pas mettre `/` ou laisser vide.
- `HttpTransaction.subPath` : commence par `/`, final = url + subPath (éviter `//`).
- `JsonHttpTransaction` pour les APIs JSON ; `httpInfo=true` pendant le build.
- Ne jamais faire de HTTP custom en JS (URLConnection/HttpClient/fetch interdit) : passer par les connecteurs/transactions.
- Tester la transaction seule avec `requestable-execute {"requestable":"<project>.<connector>.<transaction>"}` (avec `httpInfo=true` au besoin).
- Après chaque changement URL/subPath : `requestable-execute ...` pour valider la cible avant de câbler une séquence.
- `databaseobject-schema` pour prélever XPaths sans tâtonner.
- Pas de “continue on error” global : gérer les fallbacks dans la séquence (If/Then/Else ou JIf) et retourner un JSON de secours. `httpInfo=true` utile en debug.
- Si `databaseobject-create` mode=after échoue (decode), créer en inside puis reorder via `databaseobject-move`.
- Transactions : `recordSchema=true` avant wiring ; CallTransaction en `output=false`, mapper ce qui est nécessaire seulement.
