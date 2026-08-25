# Tests de bout en bout de l'assistant IA

Les suites unitaires (`tests/unit/ai.*`) mockent le LLM, la base et la
gouvernance. Elles ne peuvent donc pas voir les défauts qui sont réellement
arrivés jusqu'au client :

- une **question** qui créait un enregistrement ;
- un **titre mutilé** par l'extraction regex ;
- un **client non résolu** alors qu'il existe au CRM ;
- un message **à moitié en anglais** ;
- une relance qui ne disait **pas ce qui manquait** ;
- une notification **envoyée sans validation**.

Tous ont été trouvés à la main. Ce harnais les rejoue automatiquement contre
un serveur réel, avec de vrais appels OpenAI.

## Lancer

```bash
# Serveur local requis. Un run complet consomme ~45 appels agent : la limite de
# 200/h tient pour deux séries, pas pour une journée de mise au point. La
# passerelle HTTP (100 req/min) est saturée par le polling — le harnais attend
# et réessaie, mais la relever raccourcit la série.
RATE_LIMIT_GLOBAL=1000 node src/server.js

# Si la limite agent est atteinte (« agent rate limit »), vider le compteur :
#   redis-cli --scan --pattern "mb:ai:agent:ratelimit:*" | xargs -n1 redis-cli del

# Dans un autre terminal :
node tests/e2e/ai-scenarios.mjs              # les 53 scénarios
node tests/e2e/ai-scenarios.mjs --only=offerte   # filtre par nom
API=http://localhost:9097/api/v1 node tests/e2e/ai-scenarios.mjs
```

Sortie : un ✓/✗ par contrôle, puis `53/53 scénarios passés`. Code de sortie
non nul si un scénario échoue, donc utilisable en pré-livraison.

## Ce qui est couvert

| Scénario | Vérifie |
|---|---|
| `question-tasks-does-not-create` | Une question lit, ne crée rien |
| `question-projects-does-not-create` | Idem pour les projets |
| `task-attributes-extracted` | Titre propre, priorité HIGH, échéance « morgen » |
| `referenz-im-titel-bleibt-stehen` | Un numéro d'Auftrag dans un titre n'est pas supprimé |
| `lauf-traegt-seine-herkunft` | Chaque run garde modèle, fournisseur, version et voie de décision |
| `freigabe-mit-handkorrektur` | On peut valider **en corrigeant** ; la proposition reste visible |
| `project-requires-approval` | Ouvrir un projet exige une validation |
| `customer-resolved-from-name` | Le client nommé est retrouvé, checklist créée |
| `missing-field-named-in-german` | La relance nomme le champ manquant, en allemand |
| `notification-requires-approval` | Rien n'est envoyé sans validation |
| `general-question-answered` | Réponse conversationnelle, en Sie-Form |
| `offerte-nine-blocks` | Positions, points ouverts, prix manquants, total à 0 |
| `deletion-requires-approval` | Supprimer exige toujours une validation |
| `wartung-ueberfaellig` | Langage d'entretien compris, titre sans mots de commande |
| `notfall-wird-dringend` | Une panne de chauffage devient priorité haute/urgente |
| `schweizer-datumsangabe` | « nächsten Dienstag » devient une vraie date, un mardi |
| `entkalkung-fachbegriff` | Les termes métier (Hygienespeicher) survivent |
| `kundensuche-mit-fachfrage` | Recherche client qui ne modifie rien |
| `erdsonde-erkennt-bewilligungspflicht` | Erdsonde, Fördergelder et point ouvert repérés |
| `mehrdeutiger-kunde-mit-auswahl` | Plusieurs clients → liste numérotée |
| `mehrtuerige-antwort-auf-rueckfrage` | Répondre « Immobilien Verwaltung » suffit au tour suivant |
| `einsatz-verschieben-braucht-freigabe` | Un rendez-vous client ne bouge pas sans accord |
| `ausserhalb-des-themas` | Une question hors sujet ne crée rien |
| `rapport-diktat-uebernimmt-arbeiten` | Un rapport dicté reprend les travaux, pas la commande |
| `rapport-strukturiert-arbeiten-und-material` | Travaux, matériel et heures séparés proprement |
| `rapport-erkennt-folgearbeit` | Le cas du CDC : l'Ausdehnungsgefäss à offrir est repéré |
| `rapport-meldet-fehlende-angaben` | Sans heures, le rapport est signalé incomplet |
| `rechnung-braucht-freigabe` | Facturer exige une validation (risque élevé) |
| `rechnung-sperrt-bei-fehlendem-preis` | Blocage motivé, aucune facture créée |
| `rechnung-nennt-offene-rapporte` | Les contrôles avant facture sont bien exécutés |
| `nachfassliste-nach-wert-sortiert` | Offres à relancer, priorisées par valeur, sans pression tarifaire |
| `abschluss-erdsonde-blockiert` | Sans Bohrbewilligung ni IBN-Protokoll, la clôture est bloquée |
| `abschluss-boiler-ohne-bewilligung` | La checklist suit le type d'installation, pas une liste fixe |
| `abschlussfrage-legt-nichts-an` | Demander si on peut clôturer ne change rien au projet |
| `kundennachricht-bleibt-ein-entwurf` | Un texte client est préparé, jamais envoyé |
| `ohne-termin-kein-termin-im-entwurf` | Sans date en base, aucune date dans le courrier |
| `kennzahlen-nennen-ihre-luecken` | Les chiffres calculables, et le refus explicite d'inventer une marge |
| `kreditoren-werden-vor-der-zahlung-geprueft` | Factures fournisseurs, jamais confondues avec la facturation client |
| `dokumente-werden-eingeordnet` | Les documents mal classés sont nommés, rien n'est déplacé |
| `dokument-ohne-signal-wird-nicht-geraten` | Un nom sans signal reste non classé plutôt que deviné |
| `material-nennt-was-nicht-bestellt-ist` | Le matériel non commandé est nommé — et seulement du matériel |
| `material-sagt-dass-der-projektbezug-fehlt` | L'agent dit que les commandes n'ont pas de lien projet |
| `material-ohne-auftrag-keine-liste` | Sans Auftrag, pas de liste inventée |
| `dispo-schlaegt-passenden-monteur-vor` | L'installation dicte la qualification ; qui l'a passe devant |
| `dispo-prueft-einen-monteur` | La question sur une personne vérifie les dix points sans réserver |
| `dispo-ohne-datum-fragt-nach` | Sans date, l'agent demande au lieu d'inventer un créneau |
| `behoerden-erdsonde-sperrt-baustart` | Sans Bohrbewilligung, le Baustart reste bloqué |
| `behoerden-boiler-braucht-nichts` | Un remplacement de boiler ne demande aucune procédure |
| `behoerden-erfindet-keine-kantonsregel` | L'agent dit que les formulaires cantonaux ne sont pas dans le système |
| `wartungsliste-nach-verzug` | Les entretiens dus, la plus en retard en tête |
| `briefing-anlage-nach-nummer` | Le numéro d'installation (A-00003) suffit à obtenir le briefing |
| `briefing-anlage-ueber-kunde` | On nomme le client, pas l'installation |
| `briefing-mehrere-anlagen-fragt-nach` | Plusieurs installations chez un client → l'agent demande |

Chaque scénario contrôle aussi qu'**aucun anglais** ne fuit dans le message
affiché (`ENGLISH_LEAKS`).

## Règles

- Tout ce qui est créé porte le préfixe `ZZTEST` et est supprimé à la fin.
- Le harnais **balaie aussi les restes** d'un run précédent au démarrage : un nom
  de projet est unique par client, un reliquat ferait échouer le run suivant pour
  une mauvaise raison. Il est donc rejouable à l'identique.
- Un projet ne peut être supprimé qu'à l'état `DRAFT`. Un scénario qui l'a passé
  en `COMPLETED` le fait donc revenir en arrière (avec `override`) avant de le
  supprimer, et **signale** en `⚠` ce qu'il n'a pas réussi à enlever — un échec
  silencieux empoisonnait les runs suivants.
- **Ne jamais pointer sur la production** : le harnais écrit de vraies données
  et consomme de vrais jetons OpenAI.
- Identifiants par défaut : `admin@appnity.ch`. Surchargeables via
  `AI_TEST_EMAIL` / `AI_TEST_PASSWORD`.

## Étendre

Ajouter un objet à `SCENARIOS` : un `name`, un `why` (affiché en cas d'échec),
et un `exec()` qui renvoie un tableau de `check(label, condition, detail)`.
Appeler `track('project', id)` pour que le runner nettoie l'enregistrement.

**À faire pour chaque nouvel agent** avant de livrer au client.
