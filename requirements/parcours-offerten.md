# Parcours Offerten

> MB Boiler · Retour client « Offerte.pdf » · branche loic

Ce qui a été livré en réponse au retour de test du client, et un parcours pas à pas dans l'interface pour constater chaque modification en la testant à la main.

---

## A. Ce qui a changé, en regard du retour client

| Demande du client | Réponse livrée |
|---|---|
| Champ « Status » manquant | Statut visible sur le formulaire (création et édition) et librement modifiable ; « Status ändern » propose désormais la liste complète des 8 statuts, dans n'importe quel sens. |
| Objekt d'abord, pas le Kunde | Le formulaire commence par un champ *Objekt* : le choisir remplit le Kunde automatiquement et débloque un sélecteur d'adresse de facturation (Kunde / Rechnungsadresse de l'Objekt / Eigentümer / Verwaltung). Le choix suit le document jusqu'à la facture et son QR. |
| Anrede flexible (Sie / Du) | Nouveau champ *Anrede* avec suggestions, imprimé au-dessus de l'introduction sur le PDF. |
| Einleitung en Textbausteine | Le texte exact du client est en base (« Einleitung Offerte (Sie-Form) ») plus une variante Du-Form, insérables en un clic. |
| Positionserfassung « F7 » | La description s'affiche sur plusieurs lignes (le texte Viessmann entier est lisible) et un bouton ouvre une fenêtre d'édition dédiée. |
| Vorschau bloquée (« DocumentTemplate not found ») | Les modèles de documents sont créés automatiquement au démarrage du serveur — l'aperçu PDF fonctionne sur tout environnement, prod comprise, sans configuration. |
| Bilder en taille réglable | Chaque image de position a une taille d'impression S / M / L, respectée sur le PDF. |
| Fördergelder en Bausteine | Bouton Textbaustein sur le champ Fördergelder-Hinweis ; blocs Basel-Land, Basel-Stadt et Solothurn (squelette) seedés avec les textes du client. |
| Menu invisible dans la liste | Le bouton ⋯ est visible en permanence (Offerten, Aufträge, Rechnungen), plus seulement au survol. |
| Versionsverwaltung (V1.0, V1.2, archivage auto) | Modifier une Offerte déjà envoyée crée la version suivante (V2, V3…) : l'état précédent est gelé dans le Verlauf, le PDF porte la version dans son nom et les anciens PDF partent automatiquement aux archives. Les Entwürfe s'éditent sans versionner ; seules les Offerten converties restent verrouillées. |
| Rapport → Rechnung (petits Einsätze) | « Rechnung erstellen » sur un Rapport approuvé facture désormais le contenu réel du Rapport : heures effectives (au quart d'heure) × Stundensatz de l'entreprise + le matériel utilisé aux prix du catalogue. La facture reste un Entwurf modifiable et affiche « Quelle : Arbeitsrapport ». |
| Museo Sans 300, 10 pt sur les documents | Les documents sortaient en Helvetica : la police déclarée n'était rattachée à aucun fichier. Le Museo Sans livré avec le serveur est désormais chargé automatiquement. |
| Coller sans reprendre le formatage | Le texte collé depuis un PDF ou Word adopte la mise en page du système : police, taille, couleur, surlignage et alignement de la source sont écartés, la structure est conservée. |
| Geburtsdatum et Kürzel | Les deux champs sont sur la fiche collaborateur ; le trigramme est unique et un doublon est refusé en nommant son détenteur. |
| Arbeitsrapport en PDF | Un rapport s'exporte en PDF dans la mise en page maison : installation, constatations, travaux, matériel, temps sur place, signature. |
| Projekt eröffnen | Bouton dans le détail de l'Auftrag : le projet reprend le client, l'objet, le titre et le budget, et l'ordre est relié en retour. |
| Confirmations et rappels de rendez-vous | Les rappels à 48 h / 24 h / 2 h étaient développés mais n'étaient jamais créés. Ils fonctionnent désormais par e-mail ; WhatsApp et SMS attendent une décision du client. |
| Chaînes Offerte → AB → Auftrag → Rechnung | Offerte→Auftrag (sur « Angenommen »), Offerte→Rechnung et Auftrag→Rechnung fonctionnent ; l'Auftrag affiche son Offerte source avec toutes les positions reprises. L'Auftragsbestätigung est le PDF de l'Auftrag. |

---

## 1. Préparation

1. Serveurs locaux démarrés (API `:9097`, client `:3000`), connexion sur `http://localhost:3000` avec `admin@appnity.ch / admin121`.

2. Il faut un Objekt avec des adresses distinctes. Ouvrir `/crm/sites`, choisir un Objekt (ou en créer un depuis la fiche d'un Kunde), puis *Bearbeiten* et remplir les blocs *Rechnungsadresse*, *Eigentümerschaft* et *Verwaltung* avec des adresses différentes.

   > **A constater :** le bloc Verwaltung (ajouté récemment) propose « Gleich wie Rechnungsadresse » ou la saisie manuelle.

> **Tip :** Seules les parties réellement saisies sur l'Objekt seront proposées ensuite dans l'Offerte — un bloc vide n'apparaît pas dans le sélecteur.

---

## 2. Nouvelle Offerte — le formulaire remanié

Aller sur `/quotes` et cliquer *Neue Offerte*.

1. **Objekt d'abord.** Le premier champ est *Objekt* : taper le nom ou la rue, choisir l'Objekt préparé.

   > **A constater :** le champ Kunde se remplit tout seul, et un sélecteur *Rechnungsadresse* apparaît avec les adresses complètes en clair (Kunde, Rechnungsadresse de l'Objekt, Eigentümer, Verwaltung). Choisir par exemple la Verwaltung.

2. **Status.** Le champ est en deuxième colonne, préréglé sur Entwurf ; le passer sur *Gesendet* pour tester la création directe dans un autre statut.

3. **Anrede.** Cliquer dans le champ : des suggestions s'affichent (« Sehr geehrte Frau … », « Liebe … ») ; le texte reste entièrement libre — taper par exemple *Liebe Kseniya*.

4. **Einleitung.** Cliquer *Textbaustein einfügen* au-dessus du champ, chercher « Einleitung ».

   > **A constater :** les deux variantes Sie-Form / Du-Form avec le texte du client ; en choisir une remplit l'introduction.

5. **Position longue.** *Freitextposition*, puis coller un long descriptif (le texte Viessmann du retour client, par exemple).

   > **A constater :** le texte s'affiche sur plusieurs lignes au lieu d'être tronqué. Le bouton à droite ouvre la fenêtre d'édition (le « F7 » demandé) avec compteur de caractères.

6. **Image et taille.** Sur la même position, cliquer l'icône image et charger un PNG/JPG.

   > **A constater :** un petit bouton **M** apparaît à côté de la vignette ; chaque clic fait tourner S → M → L, la taille d'impression sur le PDF.

7. **Fördergelder.** Déplier « Zahlungsbedingungen & AGB » en bas du formulaire, puis *Textbaustein einfügen* sur le champ Fördergelder-Hinweis, chercher « Förder ».

   > **A constater :** les blocs Basel-Land (avec l'Energieprämie), Basel-Stadt et Solothurn.

8. *Erstellen*.

---

## 3. La liste — menu, aperçu PDF, statuts

1. **Menu visible.** Sans passer la souris sur les lignes, regarder la colonne de droite.

   > **A constater :** le bouton ⋯ est visible sur chaque ligne en permanence.

2. **Vorschau.** Menu ⋯ → *Vorschau* sur l'Offerte créée : le PDF se télécharge.

   > **A constater :** le destinataire est l'adresse choisie (la Verwaltung, avec sa ligne c/o), l'Anrede est imprimée au-dessus de l'introduction, le texte long est complet et l'image a la taille choisie. Le nom du fichier suit la convention `JJJJ_MM_TT_Objektadresse_MB_Offerte O_V1.pdf`.

3. **Status ändern.** Menu ⋯ → *Status ändern*.

   > **A constater :** les 7 autres statuts sont tous proposés, y compris les retours en arrière (Gesendet → Entwurf), et le motif de refus est facultatif.

   Passer l'Offerte sur *Angenommen* pour l'étape suivante.

---

## 4. La chaîne — Auftrag, Auftragsbestätigung, Rechnung

1. **Conversion.** Sur l'Offerte « Angenommen » : menu ⋯ → *In Auftrag konvertieren*. L'Offerte passe en *Umgewandelt*.

2. **L'Auftrag connaît sa source.** Onglet *Aufträge*, ouvrir le détail du nouvel Auftrag.

   > **A constater :** le champ *Quelle* affiche le numéro de l'Offerte d'origine, toutes les positions sont reprises, et les blocs Rechnungsadresse / Eigentümer / Verwaltung de l'Objekt sont affichés.

3. **Auftragsbestätigung.** Menu ⋯ de l'Auftrag → générer le PDF.

   > **A constater :** le document « Auftragsbestätigung » sort avec la même adresse de facturation que l'Offerte.

4. **Rechnung.** Dans le détail de l'Auftrag, onglet *Rechnungen* : boutons *Rechnung*, *Akontorechnung*, *Schlussrechnung*. Créer une Rechnung (échéance à saisir), puis la finaliser et générer son PDF.

   > **A constater :** l'adresse choisie sur l'Offerte est reprise comme destinataire *et* comme débiteur du bulletin QR.

> **Rappel :** « Rechnung finalisieren » n'est proposé que sur une facture au statut Entwurf — sur une facture déjà payée ou envoyée, l'absence du bouton est normale.

---

## 5. Versionsverwaltung — modifier une Offerte envoyée

1. **Modifier après envoi.** Prendre une Offerte au statut *Gesendet* (ou y passer une Offerte via Status ändern), puis menu ⋯ → *Bearbeiten*.

   > **A constater :** un bandeau ambre en tête du formulaire annonce « Beim Speichern entsteht Version V2 — die bisherige Fassung bleibt im Verlauf erhalten ».

2. **Changer quelque chose** (un prix, une quantité) et *Speichern*.

   > **A constater :** dans la liste, un badge **V2** apparaît à côté du numéro de l'Offerte. Un Entwurf modifié, lui, ne crée pas de version.

3. **Verlauf.** Menu ⋯ → *Verlauf*.

   > **A constater :** une section « Versionen » liste la version actuelle et les versions archivées avec auteur, date et montant — on voit l'ancien total à côté du nouveau. En dessous, le Statusverlauf (réparé au passage : il renvoyait une erreur 500 et n'enregistrait rien).

4. **PDF versionné.** Menu ⋯ → *Vorschau*.

   > **A constater :** le fichier s'appelle `…_MB_Offerte O_V2.pdf` et l'ancien PDF V1 est automatiquement marqué archivé dans les documents du dossier.

> **Limite voulue :** une Offerte *Umgewandelt* (convertie en Auftrag) ne se modifie plus — son contenu vit désormais dans l'Auftrag.

---

## 6. Rapport → Rechnung — facturer un petit Einsatz

1. **Stundensatz.** Ouvrir `/admin/work-time` (Einstellungen > Arbeitszeit) et saisir le « Stundensatz für Verrechnung (CHF) », p.ex. 140.

   > **A constater :** nouveau champ sous la règle de pause, avec son explication.

2. **Rapport approuvé.** Dans `/field-ops/reports` (Rapporte), ouvrir un Arbeitsrapport au statut *Approved* — il faut un Einsatz lié à un Auftrag, avec heures d'arrivée/départ et du matériel saisi par le technicien.

3. **Rechnung erstellen.** Cliquer le bouton dans le panneau du Rapport.

   > **A constater :** la facture (Entwurf) contient une position « Arbeitszeit — date — titre de l'Einsatz » (heures réelles arrondies au quart d'heure × Stundensatz) et une position par matériel du Rapport (prix catalogue ; le matériel libre arrive à 0.– à compléter). Le Rapport passe en *Invoiced* — un deuxième clic est refusé.

4. **Contrôle.** Onglet Rechnungen de `/quotes` : le détail de la facture affiche « Quelle : Arbeitsrapport » ; tout est modifiable avant finalisation, PDF et QR comme d'habitude.

---

## 7. Les ajouts du contrôle général

Ces quatre points viennent du dernier retour du client et d'un contrôle de cohérence. Ils se testent indépendamment du reste.

1. **La police des documents.** Générer n'importe quel PDF (Vorschau d'une Offerte, facture, rapport).

   > **A constater :** le texte est en **Museo Sans**, la police du client. Auparavant tous les documents sortaient en Helvetica, sans que rien ne le signale.

2. **Coller un texte formaté.** Copier un passage depuis un PDF ou un Word (avec une autre police, une taille différente, de la couleur), puis le coller dans l'Einleitung d'une Offerte.

   > **A constater :** le texte arrive au format du système. Police, taille, couleur, surlignage et alignement de la source sont écartés ; les titres, le gras, les listes et les liens sont conservés. La barre d'outils continue de fonctionner normalement.

3. **Geburtsdatum et Kürzel.** `Einstellungen > Benutzer` → créer ou modifier un collaborateur.

   > **A constater :** les deux champs sont sur la première étape. Le Kürzel se met en majuscules ; saisir un code déjà utilisé donne un message qui nomme son détenteur au lieu d'une erreur technique.

4. **Rapport en PDF.** `/field-ops/reports` → ouvrir un rapport → bouton *Als PDF* (en bas à gauche du panneau).

   > **A constater :** le PDF reprend l'installation, les constatations, les travaux, le matériel avec ses quantités, le temps sur place et la ligne de signature — dans la mise en page de la maison.

5. **Projekt eröffnen.** Onglet *Aufträge* → ouvrir un Auftrag qui n'a pas encore de projet → bouton *Projekt eröffnen*.

   > **A constater :** le projet est créé avec le client, l'objet et le titre de l'ordre, et son budget prévisionnel repris du total. La ligne « Projekt » de l'Übersicht affiche ensuite son numéro ; le bouton disparaît.

6. **Rappels de rendez-vous.** Confirmer un rendez-vous sur un Einsatz avec contact client.

   > **A constater :** trois rappels sont planifiés (48 h, 24 h et 2 h avant) et visibles dans l'administration des rappels. Annuler le rendez-vous les annule tous. Auparavant aucun rappel n'était jamais créé.

> **Tip :** La liste *Standardarbeiten* (`/admin/work-types`) contient maintenant les **17 travaux du fichier sanitaer_service_arbeiten** avec leurs durées, créés automatiquement au démarrage.

---

## 8. Où s'administre le contenu

- **Textbausteine** — `/catalog/text-blocks` : les blocs Einleitung et Fördergelder y sont modifiables et le client peut en créer d'autres (Du-Form, cantons supplémentaires…).
- **Modèles de documents** — `/admin/templates` : Offerte, Auftragsbestätigung, les trois types de Rechnung et le Servicebericht sont créés automatiquement au démarrage s'ils manquent ; les modèles déjà édités ne sont jamais écrasés.
- **Standardarbeiten** — `/admin/work-types` : les 17 travaux du client et leurs durées, complétables et modifiables.
- **Stundensatz de facturation** — `/admin/work-time` : le taux horaire utilisé quand un rapport devient une facture.
- **Adresses de l'Objekt** — fiche Objekt dans `/crm/sites`, blocs Rechnungsadresse / Eigentümerschaft / Verwaltung.

---

## 9. Ce qui reste ouvert

- **Pauschale par Standardarbeit** — la facture d'un Rapport valorise les heures effectives ; un prix forfaitaire par Standardarbeit (« Boiler entkalken = CHF 380.– ») est possible en V2, question posée au client.
- **Fördergelder Solothurn** — le client n'a pas fourni les montants ; le Baustein est un squelette à compléter.
- **Double identité Oberwil / Wettingen** — le système ne gère qu'une seule identité visuelle active : aucun document ne peut aujourd'hui sortir au papier en-tête de Wettingen. A trancher avant la mise en production.
- **Stundensatz** — il est à 140 CHF en local, une valeur de test. Sans le vrai taux, une facture issue d'un rapport sort à zéro.

---

*Vérifié le 18.08.2026 sur la branche `loic` — chaque fonction testée par API et dans un navigateur réel, PDF relus à l'oeil, 0 erreur console, données de test nettoyées. Le détail de ce qui reste et pourquoi est dans le **Bilan de couverture**.*
