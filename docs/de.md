# Aterno

Steuern Sie Ihre Aterno-Heizkörper aus Gladys Assistant: Solltemperatur,
Ein/Aus, Frostschutz, Boost – mit der Raumtemperatur, der Erkennung offener
Fenster und der Anwesenheitserkennung jedes Heizkörpers.

Die Integration spricht mit der **Eco-Aterno-Box** – dem kleinen weißen
Gerät an Ihrem Internet-Router, das auch die mobile Eco-Aterno-App nutzt.
Sie ist weder mit Aterno verbunden noch von Aterno freigegeben.

## Was Sie erhalten

Ein Gladys-Gerät pro Heizkörper, der mit der Box gekoppelt ist. Je nach
Modell bietet ein Heizkörper:

- **Solltemperatur** – die gewünschte Temperatur, einstellbar;
- **Raumtemperatur** – vom Heizkörper gemessen;
- **Heizung** – ein oder aus;
- **Frostschutz** – ein Schalter: ein hält den Raum knapp über dem
  Gefrierpunkt, aus kehrt zum normalen Heizen zurück;
- **Boost** – bei Badmodellen;
- **Fenster** – offen oder geschlossen, wenn der Heizkörper es erkennt;
- **Anwesenheit** – wenn der Heizkörper sie erkennt.

Änderungen aus der Eco-Aterno-App oder von einem Thermostat erscheinen in
Gladys innerhalb von Sekunden: Die Box meldet sie sofort.

## Voraussetzungen

- Eine **Eco-Aterno-Box**, mit Strom versorgt und per Ethernet-Kabel mit
  Ihrem Router verbunden.
- Ihre Heizkörper sind bereits in der Eco-Aterno-App **mit der Box
  gekoppelt**: Die Integration koppelt keine Heizkörper, sie nutzt die, die
  die Box kennt.
- Die **MAC-Adresse** der Box (12 Zeichen, auf der Rückseite) und das
  **Passwort**, das Sie beim Anlegen des Wohnsitzes in der App gewählt haben.
- Gladys Assistant **5.1.0** oder neuer.

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Geben Sie die **MAC-Adresse** der Box ein. Trennzeichen (`:` oder `-`)
   werden ignoriert.
3. Geben Sie das **Passwort** der Box ein.
4. Optional: Geben Sie die **lokale IP-Adresse** der Box ein. Bleibt das
   Feld leer, sucht die Integration die Box in Ihrem Netz (siehe unten).
5. Speichern Sie und drücken Sie **Verbindung testen**: Die Antwort nennt
   den genutzten Kanal und die Anzahl der gefundenen Heizkörper.
6. Öffnen Sie den Tab **Entdeckung** und fügen Sie Ihre Heizkörper hinzu.

Die **Sprache der Gerätenamen** gilt nur für danach angelegte Funktionen;
benennen Sie anschließend in Gladys um, was Sie möchten.

### Lokal oder Cloud

Die Box ist auf zwei Wegen erreichbar, und die Integration beherrscht beide:

- **Lokal** – direkt über Ihr Heimnetz. Schneller, und es funktioniert auch
  bei ausgefallenem Internetzugang.
- **Cloud** – über das Relais des Herstellers, wie die mobile App außer
  Haus. Nichts zu konfigurieren, aber auf beiden Seiten ist Internet nötig.

Die Adresse der Box müssen Sie nicht suchen: Bleibt das Feld **lokale
IP-Adresse** leer, lässt die Integration Gladys die Box in Ihrem Netz suchen
(so wie die Eco-Aterno-App sie zu Hause findet), prüft anhand der
MAC-Adresse und des Passworts, dass es Ihre ist, und verbindet sich lokal.
Erhält die Box später von Ihrem Router eine andere Adresse, findet die
Integration sie von selbst wieder. Wird die Box nicht gefunden, läuft die
Verbindung über die Cloud.

Sie können die Adresse trotzdem eintragen, etwa wenn die Suche in Ihrem Netz
nichts findet: Sie finden sie in der Geräteliste Ihres Routers; reservieren
Sie sie dort (eine „feste DHCP-Zuweisung“), damit sie sich nie ändert. Eine
von Hand eingetragene Adresse wird zuerst versucht; antwortet sie nicht mehr,
übernimmt die Suche.

Der Schalter **Lokale Verbindung bevorzugen** bestimmt, welcher Weg zuerst
versucht wird. Antwortet der bevorzugte Kanal nicht, nutzt die Integration
den anderen und zeigt das an: Das Abzeichen der Heizkörper erhält einen
orangefarbenen Punkt, mit dem Grund im Tooltip. Sobald der bevorzugte Kanal
wieder antwortet, kehrt sie von selbst zurück.

### Aktionen

- **Verbindung testen** – verbindet sich mit der Box und nennt den genutzten
  Kanal und die Anzahl der Heizkörper.
- **Nach neuen Heizkörpern suchen** – liest die Heizkörperliste neu ein,
  nachdem Sie einen in der Eco-Aterno-App gekoppelt oder umbenannt haben.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu, in der Kategorie
**Integrationen**.

Auslöser:

- **Heizkörper-Modus geändert** – ein Heizkörper wurde über die
  Eco-Aterno-App oder sein Thermostat ein-, ausgeschaltet oder auf
  Frostschutz gestellt. Änderungen durch Gladys selbst lösen ihn nicht aus:
  Eine Szene kann sich nicht selbst im Kreis auslösen.
- **Störung an einem Heizkörper** – ein Heizkörper meldet eine Störung
  (Temperaturfühler, Heizung, schwache Thermostat-Batterie).
- **Verbindung zur Box geändert** – die Verbindung zur Box wurde getrennt,
  wiederhergestellt oder zwischen lokal und Cloud gewechselt.

Temperaturen, Fenster und Anwesenheit sind Gerätefunktionen: Nutzen Sie
dafür den Standard-Auslöser „Gerätezustand geändert“ von Gladys.

Aktionen:

- **Solltemperatur einstellen** – eines Heizkörpers, oder aller, wenn keiner
  gewählt ist.
- **Heizmodus ändern** – ein, aus oder Frostschutz, für einen Heizkörper
  oder alle.
- **Boost starten oder beenden** – Heizkörper ohne Boost werden
  übersprungen.
- **Heizkörper aktualisieren** – liest alle Werte sofort neu ein.

Jede Aktion gibt zurück, wie viele Heizkörper sie geändert hat – nutzbar in
den folgenden Aktionen der Szene.

## Dashboard

Im Dashboard-Editor stehen zwei Widgets bereit:

- **Aterno-Heizung** – wie viele Heizkörper heizen, die Mitteltemperatur,
  die Verbindung, offene Fenster und Störungen, mit Tasten, um alle
  Heizkörper ein-, auszuschalten oder auf Frostschutz zu stellen.
- **Aterno-Heizkörper** – ein Heizkörper Ihrer Wahl: Live-Temperaturen,
  Modus, Fenster, Anwesenheit sowie Tasten für wärmer, kühler, ein/aus und
  Boost.

## Fehlerbehebung

**„Die Box hat die MAC-Adresse oder das Passwort abgelehnt.“** Prüfen Sie
die 12 Zeichen der MAC-Adresse auf der Rückseite der Box. Wenn Sie das
Passwort nicht mehr kennen: Halten Sie die Taste der Box 30 Sekunden lang
gedrückt (die Leuchte blinkt schnell magenta) und wählen Sie dann in der
Eco-Aterno-App ein neues Passwort.

**„Die Eco-Aterno-Box ist nicht erreichbar.“** Sehen Sie sich die Leuchte
der Box an: Dauerhaft grün heißt lokal und aus der Ferne erreichbar, orange
nur lokal, rot keine Internetverbindung. Ist die Box auch im lokalen Netz
nicht erreichbar, braucht die Integration die grüne Leuchte.

**Das Abzeichen zeigt „Cloud“ mit einem orangefarbenen Punkt.** Die Box hat
im lokalen Netz nicht geantwortet, und die Suche hat sie nicht wiedergefunden.
Prüfen Sie, dass Box und Gladys im selben Netz sind, und tragen Sie ihre
Adresse dann von Hand ein (siehe „Lokal oder Cloud“).

**Ein Heizkörper fehlt.** Koppeln Sie ihn zuerst in der Eco-Aterno-App und
drücken Sie dann **Nach neuen Heizkörpern suchen**.

**Etwas anderes.** Öffnen Sie die Protokolle der Integration in Gladys. Sie
enthalten nie Ihr Passwort.

## Gut zu wissen

- Dies ist eine Community-Integration, entwickelt anhand des Protokolls der
  Box (ein Delta-Dore-Tydom-Gateway unter der Marke Aterno). Sie wurde gegen
  eine simulierte Box entwickelt: Ihre Rückmeldungen mit echter Hardware sind
  im Repository willkommen.
- Sie wurde für die Eco-Aterno-Box geschrieben. Die ältere My-Aterno-Box
  wurde nicht getestet.
- Die Heizprogramme („Momente“) bleiben in der Eco-Aterno-App; bauen Sie
  Ihre eigenen mit Gladys-Szenen, wenn Sie möchten.
