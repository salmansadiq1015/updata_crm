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
# Serveur local requis. La limite de 20 runs/h doit être relevée le temps du test.
AI_AGENT_RATE_LIMIT=200 node src/server.js

# Dans un autre terminal :
node tests/e2e/ai-scenarios.mjs              # les 10 scénarios
node tests/e2e/ai-scenarios.mjs --only=offerte   # filtre par nom
API=http://localhost:9097/api/v1 node tests/e2e/ai-scenarios.mjs
```

Sortie : un ✓/✗ par contrôle, puis `10/10 scénarios passés`. Code de sortie
non nul si un scénario échoue, donc utilisable en pré-livraison.

## Ce qui est couvert

| Scénario | Vérifie |
|---|---|
| `question-tasks-does-not-create` | Une question lit, ne crée rien |
| `question-projects-does-not-create` | Idem pour les projets |
| `task-attributes-extracted` | Titre propre, priorité HIGH, échéance « morgen » |
| `project-requires-approval` | Ouvrir un projet exige une validation |
| `customer-resolved-from-name` | Le client nommé est retrouvé, checklist créée |
| `missing-field-named-in-german` | La relance nomme le champ manquant, en allemand |
| `notification-requires-approval` | Rien n'est envoyé sans validation |
| `general-question-answered` | Réponse conversationnelle, en Sie-Form |
| `offerte-nine-blocks` | Positions, points ouverts, prix manquants, total à 0 |
| `deletion-requires-approval` | Supprimer exige toujours une validation |

Chaque scénario contrôle aussi qu'**aucun anglais** ne fuit dans le message
affiché (`ENGLISH_LEAKS`).

## Règles

- Tout ce qui est créé porte le préfixe `ZZTEST` et est supprimé à la fin.
- **Ne jamais pointer sur la production** : le harnais écrit de vraies données
  et consomme de vrais jetons OpenAI.
- Identifiants par défaut : `admin@appnity.ch`. Surchargeables via
  `AI_TEST_EMAIL` / `AI_TEST_PASSWORD`.

## Étendre

Ajouter un objet à `SCENARIOS` : un `name`, un `why` (affiché en cas d'échec),
et un `exec()` qui renvoie un tableau de `check(label, condition, detail)`.
Appeler `track('project', id)` pour que le runner nettoie l'enregistrement.

**À faire pour chaque nouvel agent** avant de livrer au client.
