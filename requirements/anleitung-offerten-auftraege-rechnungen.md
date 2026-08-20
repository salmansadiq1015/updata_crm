# Anleitung: Offerten, Auftraege & Rechnungen

> MB Boiler & Heizung AG -- Testanleitung fuer das neue Offert- und Rechnungswesen

Diese Anleitung fuehrt Sie Schritt fuer Schritt durch den gesamten Ablauf: von der Offerte ueber den Auftrag bis zur Rechnung. Sie koennen jeden Punkt direkt in der Anwendung nachvollziehen und pruefen.

**Anmelden:** Oeffnen Sie [https://mb.appnity.ch](https://mb.appnity.ch) und loggen Sie sich mit Ihren Zugangsdaten ein.

---

## A. Uebersicht der Neuerungen

| Thema | Was ist neu |
|---|---|
| Status auf der Offerte | Der Status ist direkt im Formular sichtbar und frei aenderbar. Ueber *Status aendern* stehen alle 8 Statuswerte zur Verfuegung -- in jeder Richtung. |
| Objekt zuerst | Das Formular beginnt mit dem Feld *Objekt*. Beim Auswaehlen wird der Kunde automatisch eingetragen und ein Selektor fuer die Rechnungsadresse erscheint (Kunde / Rechnungsadresse des Objekts / Eigentuemer / Verwaltung). Die gewaehlte Adresse wird bis auf die Rechnung und den QR-Einzahlungsschein uebernommen. |
| Anrede (Sie / Du) | Neues Feld *Anrede* mit Vorschlaegen, das auf dem PDF oberhalb der Einleitung gedruckt wird. |
| Einleitung als Textbaustein | Vorgefertigte Einleitungstexte (Sie-Form und Du-Form) sind als Textbausteine hinterlegt und mit einem Klick einfuegbar. |
| Positionserfassung | Beschreibungen werden mehrzeilig angezeigt. Ein Button oeffnet ein separates Bearbeitungsfenster mit Zeichenzaehler. |
| PDF-Vorschau | Die Dokumentvorlagen werden automatisch angelegt -- die Vorschau funktioniert ohne weitere Einrichtung. |
| Bilder in Positionen | Jedes Positionsbild hat eine Druckgroesse (S / M / L), die auf dem PDF beruecksichtigt wird. |
| Foerdergelder | Textbausteine fuer Foerdergelder-Hinweise (Basel-Land, Basel-Stadt, Solothurn) sind hinterlegt und per Klick einfuegbar. |
| Menue in der Liste | Der Button *...* ist auf jeder Zeile dauerhaft sichtbar -- nicht mehr nur beim Ueberfahren mit der Maus. |
| Versionsverwaltung | Wird eine bereits versandte Offerte bearbeitet, entsteht automatisch die naechste Version (V2, V3, ...). Die vorherige Fassung bleibt im Verlauf erhalten, das PDF traegt die Versionsnummer im Dateinamen, und aeltere PDFs werden automatisch archiviert. Entwuerfe lassen sich ohne Versionierung bearbeiten. |
| Rapport zu Rechnung | Aus einem genehmigten Arbeitsrapport laesst sich direkt eine Rechnung erstellen. Die effektive Arbeitszeit (auf Viertelstunden gerundet) wird mit dem Stundensatz der Firma berechnet, das verwendete Material mit den Katalogpreisen uebernommen. |
| Schriftart Museo Sans | Alle Dokumente werden jetzt in der Hausschrift Museo Sans ausgegeben. |
| Text einfuegen ohne Formatierung | Wird Text aus einem PDF oder Word eingefuegt, uebernimmt das System nur die Struktur (Titel, Fett, Listen). Schriftart, Groesse, Farbe und Hervorhebung der Quelle werden entfernt. |
| Geburtsdatum & Kuerzel | Beide Felder stehen auf der Mitarbeiter-Karte. Das Kuerzel wird automatisch in Grossbuchstaben gesetzt; ein bereits vergebenes Kuerzel wird mit Namensnennung abgelehnt. |
| Arbeitsrapport als PDF | Rapporte lassen sich als PDF im Firmendesign exportieren (Anlage, Befund, Arbeiten, Material, Zeitaufwand, Unterschrift). |
| Projekt eroeffnen | Im Auftragsdetail erstellt ein Button direkt ein Projekt mit Kunde, Objekt, Titel und Budget aus dem Auftrag. |
| Terminerinnerungen | Terminerinnerungen werden per E-Mail 48 h, 24 h und 2 h vor dem Termin verschickt. Wird der Termin abgesagt, werden alle Erinnerungen storniert. |
| Kette Offerte - Auftrag - Rechnung | Offerte zu Auftrag (bei *Angenommen*), Offerte zu Rechnung und Auftrag zu Rechnung funktionieren durchgehend. Der Auftrag zeigt seine Quell-Offerte mit allen uebernommenen Positionen. Die Auftragsbestaetigung ist das PDF des Auftrags. |

---

## 1. Vorbereitung: Objekt einrichten

Bevor Sie eine Offerte erstellen, brauchen Sie ein Objekt mit Adressdaten.

1. Navigieren Sie zu **Objekte** (Menue *CRM > Objekte*).
2. Waehlen Sie ein bestehendes Objekt oder erstellen Sie ein neues ueber die Kunden-Karte.
3. Klicken Sie auf *Bearbeiten* und fuellen Sie die Adressbloeche aus:
   - **Rechnungsadresse**
   - **Eigentuemerschaft**
   - **Verwaltung**

   > **Ergebnis:** Der Block *Verwaltung* bietet die Option *Gleich wie Rechnungsadresse* oder manuelle Eingabe.

> **Hinweis:** Nur Adressbloeche, die tatsaechlich ausgefuellt sind, erscheinen spaeter als Auswahl in der Offerte. Ein leerer Block wird nicht angezeigt.

---

## 2. Neue Offerte erstellen

Navigieren Sie zu **Offerten** und klicken Sie auf *Neue Offerte*.

1. **Objekt waehlen.** Das erste Feld ist *Objekt*. Tippen Sie den Namen oder die Strasse ein und waehlen Sie das gewuenschte Objekt.

   > **Ergebnis:** Der Kunde wird automatisch eingetragen. Ein Selektor *Rechnungsadresse* erscheint mit den vollstaendigen Adressen (Kunde, Rechnungsadresse des Objekts, Eigentuemer, Verwaltung). Waehlen Sie z.B. die Verwaltung.

2. **Status.** In der zweiten Spalte steht der Status, voreingestellt auf *Entwurf*. Sie koennen ihn direkt auf *Gesendet* setzen, falls die Offerte bereits verschickt wurde.

3. **Anrede.** Klicken Sie in das Feld: Vorschlaege wie *Sehr geehrte Frau ...* oder *Liebe ...* erscheinen. Der Text ist frei editierbar.

4. **Einleitung.** Klicken Sie auf *Textbaustein einfuegen* oberhalb des Felds und suchen Sie nach *Einleitung*.

   > **Ergebnis:** Zwei Varianten stehen bereit (Sie-Form und Du-Form). Eine auswaehlen fuellt die Einleitung automatisch.

5. **Positionen erfassen.** Klicken Sie auf *Freitextposition* und fuegen Sie die Beschreibung ein.

   > **Ergebnis:** Der Text wird mehrzeilig angezeigt. Der Button rechts oeffnet ein separates Bearbeitungsfenster mit Zeichenzaehler.

6. **Bild hinzufuegen.** Auf derselben Position klicken Sie auf das Bild-Symbol und laden ein Bild hoch (PNG oder JPG).

   > **Ergebnis:** Neben der Miniaturansicht erscheint ein Button **M**. Jeder Klick wechselt die Druckgroesse: S, M, L.

7. **Foerdergelder.** Klappen Sie *Zahlungsbedingungen & AGB* am Ende des Formulars auf. Klicken Sie auf *Textbaustein einfuegen* beim Feld *Foerdergelder-Hinweis* und suchen Sie nach *Foerder*.

   > **Ergebnis:** Bausteine fuer Basel-Land (mit Energiepraemie), Basel-Stadt und Solothurn stehen zur Auswahl.

8. Klicken Sie auf **Erstellen**.

---

## 3. Offerten-Liste, Vorschau & Statuswechsel

1. **Menue-Button.** Schauen Sie in die rechte Spalte der Liste.

   > **Ergebnis:** Der Button *...* ist auf jeder Zeile dauerhaft sichtbar.

2. **PDF-Vorschau.** Klicken Sie *...* und dann *Vorschau* auf der eben erstellten Offerte.

   > **Ergebnis:** Das PDF wird heruntergeladen. Der Empfaenger ist die gewaehlte Adresse (z.B. die Verwaltung mit c/o-Zeile). Die Anrede steht oberhalb der Einleitung, der lange Beschreibungstext ist vollstaendig und das Bild hat die gewaehlte Groesse. Der Dateiname folgt dem Schema `JJJJ_MM_TT_Objektadresse_MB_Offerte O_V1.pdf`.

3. **Status aendern.** Klicken Sie *...* und dann *Status aendern*.

   > **Ergebnis:** Alle 7 weiteren Statuswerte werden angeboten -- auch Rueckschritte (z.B. Gesendet zurueck auf Entwurf). Der Ablehnungsgrund ist optional.

   Setzen Sie die Offerte auf *Angenommen*, um den naechsten Schritt zu testen.

---

## 4. Von der Offerte zum Auftrag und zur Rechnung

1. **Offerte umwandeln.** Auf der Offerte mit Status *Angenommen*: Klicken Sie *...* und dann *In Auftrag konvertieren*. Die Offerte wechselt auf *Umgewandelt*.

2. **Auftrag pruefen.** Wechseln Sie zum Reiter *Auftraege* und oeffnen Sie den neuen Auftrag.

   > **Ergebnis:** Das Feld *Quelle* zeigt die Offertennummer. Alle Positionen sind uebernommen. Die Adressbloeche (Rechnungsadresse, Eigentuemer, Verwaltung) des Objekts werden angezeigt.

3. **Auftragsbestaetigung.** Klicken Sie *...* im Auftrag und generieren Sie das PDF.

   > **Ergebnis:** Die Auftragsbestaetigung verwendet dieselbe Rechnungsadresse wie die Offerte.

4. **Rechnung erstellen.** Im Auftragsdetail, Reiter *Rechnungen*: Klicken Sie auf *Rechnung*, *Akontorechnung* oder *Schlussrechnung*. Erstellen Sie eine Rechnung (Faelligkeitsdatum eingeben), finalisieren Sie sie und generieren Sie das PDF.

   > **Ergebnis:** Die auf der Offerte gewaehlte Adresse wird als Empfaenger *und* als Schuldner auf dem QR-Einzahlungsschein uebernommen.

> **Hinweis:** *Rechnung finalisieren* steht nur bei Rechnungen im Status *Entwurf* zur Verfuegung. Bei bereits versandten oder bezahlten Rechnungen fehlt der Button -- das ist gewollt.

---

## 5. Versionsverwaltung -- Offerte nach dem Versand aendern

1. **Bearbeiten nach Versand.** Nehmen Sie eine Offerte im Status *Gesendet* und klicken Sie *...* und dann *Bearbeiten*.

   > **Ergebnis:** Ein gelbes Banner zeigt an: *Beim Speichern entsteht Version V2 -- die bisherige Fassung bleibt im Verlauf erhalten.*

2. **Aenderung vornehmen** (z.B. einen Preis oder eine Menge anpassen) und *Speichern*.

   > **Ergebnis:** In der Liste erscheint ein Badge **V2** neben der Offertennummer. Hinweis: Ein Entwurf wird ohne Versionierung bearbeitet.

3. **Verlauf anzeigen.** Klicken Sie *...* und dann *Verlauf*.

   > **Ergebnis:** Im Abschnitt *Versionen* werden die aktuelle und die archivierten Versionen mit Autor, Datum und Betrag aufgelistet. Darunter steht der Statusverlauf.

4. **PDF mit Version.** Klicken Sie *...* und dann *Vorschau*.

   > **Ergebnis:** Der Dateiname enthaelt `...V2.pdf`. Das alte PDF der V1 wird automatisch als archiviert markiert.

> **Hinweis:** Eine Offerte im Status *Umgewandelt* (in Auftrag konvertiert) kann nicht mehr bearbeitet werden -- der Inhalt lebt ab jetzt im Auftrag.

---

## 6. Aus einem Arbeitsrapport eine Rechnung erstellen

1. **Stundensatz pruefen.** Navigieren Sie zu *Einstellungen > Arbeitszeit* und pruefen Sie den *Stundensatz fuer Verrechnung (CHF)*.

   > **Ergebnis:** Das Feld befindet sich unterhalb der Pausenregel mit einer Erklaerung. Ohne gueltigem Stundensatz wird die Rechnung mit CHF 0.-- erstellt.

2. **Genehmigten Rapport oeffnen.** Navigieren Sie zu *Aussendienst > Rapporte* und oeffnen Sie einen Arbeitsrapport im Status *Genehmigt*. Der zugehoerige Einsatz muss mit einem Auftrag verknuepft sein und Ankunfts-/Abfahrtszeiten sowie Material enthalten.

3. **Rechnung erstellen.** Klicken Sie auf den Button *Rechnung erstellen* im Rapport-Panel.

   > **Ergebnis:** Eine Rechnung (Entwurf) wird erstellt mit:
   > - einer Position *Arbeitszeit* (effektive Stunden auf Viertelstunden gerundet x Stundensatz)
   > - einer Position pro verwendetem Material (mit Katalogpreisen; frei erfasstes Material erscheint mit CHF 0.-- zum Nachtragen)
   >
   > Der Rapport wechselt auf *Verrechnet* -- ein zweites Klicken wird abgelehnt.

4. **Kontrolle.** Oeffnen Sie die Rechnung im Reiter *Rechnungen*: Das Feld *Quelle* zeigt *Arbeitsrapport*. Alle Positionen sind vor der Finalisierung noch editierbar. PDF und QR-Einzahlungsschein funktionieren wie gewohnt.

---

## 7. Weitere Neuerungen zum Pruefen

Diese Punkte koennen unabhaengig vom Offerten-Ablauf getestet werden.

1. **Schriftart auf Dokumenten.** Generieren Sie ein beliebiges PDF (Offerte, Rechnung, Rapport).

   > **Ergebnis:** Der Text erscheint in **Museo Sans**, der Hausschrift.

2. **Text einfuegen.** Kopieren Sie einen formatierten Text aus einem PDF oder Word-Dokument und fuegen Sie ihn in die Einleitung einer Offerte ein.

   > **Ergebnis:** Der Text uebernimmt das Systemformat. Schriftart, Groesse, Farbe, Hervorhebung und Ausrichtung der Quelle werden entfernt. Titel, Fettdruck, Listen und Links bleiben erhalten. Die Werkzeugleiste funktioniert weiterhin normal.

3. **Geburtsdatum & Kuerzel.** Navigieren Sie zu *Einstellungen > Benutzer* und bearbeiten Sie einen Mitarbeiter.

   > **Ergebnis:** Beide Felder befinden sich auf der ersten Seite. Das Kuerzel wird automatisch in Grossbuchstaben gesetzt. Bei einem bereits vergebenen Kuerzel erscheint eine Meldung mit dem Namen des Inhabers.

4. **Rapport als PDF.** Navigieren Sie zu *Aussendienst > Rapporte*, oeffnen Sie einen Rapport und klicken Sie auf *Als PDF*.

   > **Ergebnis:** Das PDF enthaelt Anlage, Befund, ausgefuehrte Arbeiten, Material mit Mengen, Zeitaufwand vor Ort und die Unterschriftszeile -- alles im Firmendesign.

5. **Projekt aus Auftrag eroeffnen.** Oeffnen Sie einen Auftrag, der noch kein Projekt hat, und klicken Sie auf *Projekt eroeffnen*.

   > **Ergebnis:** Das Projekt wird mit Kunde, Objekt, Titel und Budget aus dem Auftrag erstellt. In der Uebersicht des Auftrags erscheint die Projektnummer; der Button verschwindet.

6. **Terminerinnerungen.** Bestaetigen Sie einen Termin auf einem Einsatz mit Kundenkontakt.

   > **Ergebnis:** Drei Erinnerungen werden geplant (48 h, 24 h und 2 h vor dem Termin) und sind in der Erinnerungsverwaltung sichtbar. Wird der Termin abgesagt, werden alle Erinnerungen automatisch storniert.

> **Hinweis:** Die Liste *Standardarbeiten* (unter *Einstellungen > Standardarbeiten*) enthaelt die **17 Arbeiten aus der Datei sanitaer_service_arbeiten** mit ihren Dauern.

---

## 8. Verwaltung und Einstellungen

| Bereich | Wo zu finden | Beschreibung |
|---|---|---|
| Textbausteine | *Katalog > Textbausteine* | Einleitungen, Foerdergelder und weitere Bausteine bearbeiten oder neu anlegen. |
| Dokumentvorlagen | *Einstellungen > Vorlagen* | Offerte, Auftragsbestaetigung, die drei Rechnungstypen und der Servicebericht. Werden beim Start automatisch angelegt, bereits bearbeitete Vorlagen werden nicht ueberschrieben. |
| Standardarbeiten | *Einstellungen > Standardarbeiten* | Die 17 Arbeitsarten mit Zeitvorgaben. Ergaenz- und aenderbar. |
| Stundensatz | *Einstellungen > Arbeitszeit* | Der Stundensatz, der bei der Rechnungserstellung aus einem Rapport verwendet wird. |
| Objektadressen | *CRM > Objekte* | Rechnungsadresse, Eigentuemerschaft und Verwaltung auf der Objekt-Karte. |

---

*MB Boiler & Heizung AG -- Testanleitung, Stand 20.08.2026*
