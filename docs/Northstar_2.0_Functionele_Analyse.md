# Northstar 2.0

## Functionele analyse, productrequirements en technische overdracht

  -----------------------------------------------------------------------
  Documentgegeven                     Waarde
  ----------------------------------- -----------------------------------
  Documenttype                        Functionele analyse / Product
                                      Requirements Document

  Opgesteld vanuit                    Senior Functioneel Analist

  Versie                              1.0

  Datum                               24 november 2026

  Product                             Northstar --- persoonlijk
                                      informatie- en dashboardplatform

  Doelgroep                           AI-agent, softwareontwikkelaar,
                                      product owner, tester en beheerder

  Status                              Geconsolideerde specificatie op
                                      basis van gesprekken en historische
                                      implementatierapporten
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 1. Doel, gebruik en interpretatie

Dit document beschrijft de functionele en technische doelstelling van
Northstar 2.0. Het bundelt de productvisie, gebruikersbehoeften,
modules, gegevensbronnen, interacties, kwaliteitsvereisten,
architecturale randvoorwaarden en de laatst bekende ontwikkel- en
deploymentomgeving.

Het document moet zelfstandig aan een AI-agent of ontwikkelaar kunnen
worden bezorgd als basis om Northstar te begrijpen, te controleren,
verder te ontwikkelen, te testen en te publiceren.

## 1.1 Statusaanduidingen

Omdat eerdere gesprekken zowel gewenste functionaliteit als
gerealiseerde implementaties bevatten, gelden de volgende aanduidingen:

-   **Gerealiseerd volgens rapportage:** een eerdere Copilot- of
    implementatierapportage meldde dat de functionaliteit gebouwd en
    getest was. Dit bewijst niet dat de code vandaag nog aanwezig is of
    dat ze al op Render staat.
-   **Vereist:** hoort bij het gewenste product en moet behouden of
    gerealiseerd worden.
-   **Beslist:** hierover heeft de gebruiker expliciet een keuze
    gemaakt.
-   **Te verifiëren:** laatst bekende stand; controleer repository of
    configuratie.
-   **Niet in scope:** expliciet afgewezen of voorlopig uitgesloten.
-   **Toekomstige mogelijkheid:** idee dat nog niet is goedgekeurd.

De actuele GitHub-repository en Render-configuratie zijn leidend voor de
feitelijke huidige toestand. Dit document beschrijft de bedoelde
productwerking en historische context; het vervangt geen code-inspectie.

## 1.2 Voorrang bij tegenstrijdigheden

1.  De meest recente expliciete beslissing van de gebruiker.
2.  De actuele code en configuratie in GitHub, voor de feitelijke
    huidige toestand.
3.  Dit document, voor de gewenste functionele toestand en
    productbeslissingen.
4.  Historische implementatierapporten, als aanwijzing en niet als
    actuele garantie.

Vraag de gebruiker om verduidelijking als een beslissing impact heeft op
kosten, beveiliging, infrastructuur, OAuth, dataverlies of externe
accounttoegang.

------------------------------------------------------------------------

# 2. Productvisie

## 2.1 Wat is Northstar?

Northstar is een persoonlijk dashboard dat relevante informatie uit
verschillende domeinen samenbrengt in één centrale, overzichtelijke
omgeving.

Het helpt de gebruiker snel te begrijpen: - Wat zijn vandaag de
belangrijkste nieuwsontwikkelingen? - Welke sportwedstrijden, uitslagen
en prestaties zijn relevant? - Wat gebeurt er economisch en
financieel? - Welke persoonlijke afspraken of praktische informatie zijn
vandaag relevant?

Northstar is meer dan een verzameling widgets. Het product verzamelt,
valideert, filtert, prioriteert, structureert en presenteert informatie
op een consistente manier.

## 2.2 Productdoelstellingen

1.  **Eén centraal informatiepunt:** relevante informatie uit
    verschillende domeinen op één plek.
2.  **Relevantie boven volume:** liever een beperkte selectie
    belangrijke informatie dan een overvloed aan middelmatige items.
3.  **Betrouwbare data:** bron, referentieperiode, actualiteit en
    beperkingen zijn zichtbaar.
4.  **Persoonlijke relevantie:** selectie en prioriteiten sluiten aan
    bij de interesses van de gebruiker.
5.  **Snel scanbaar:** de belangrijkste ontwikkelingen zijn snel te
    begrijpen.
6.  **Robuust:** een storing bij één bron mag het volledige dashboard
    niet blokkeren.
7.  **Kostenbewust:** gratis gegevensbronnen en bestaande infrastructuur
    zijn de norm.
8.  **Uitbreidbaar:** modules kunnen onafhankelijk evolueren.
9.  **Onderhoudbaar:** een volgende AI-agent of ontwikkelaar kan
    architectuur, configuratie en beperkingen begrijpen.

## 2.3 Ontwerpprincipes

-   Verzin geen gegevens, scores, samenvattingen of publicatiedatums.
-   Presenteer ontbrekende waarden niet als nul.
-   Presenteer oude gegevens niet als live.
-   Behoud de oorspronkelijke bronlink.
-   Voer geen externe acties uit zonder expliciete toestemming.
-   Introduceer geen betaalde API, nieuwe infrastructuur of database
    zonder voorafgaande toestemming.
-   Voeg geen lege of niet-functionele widgets toe.
-   Behoud bestaande werkende functionaliteit en architectuur waar
    mogelijk.

## 2.4 Niet-doelen

Northstar is in de huidige scope niet bedoeld als sociaal netwerk,
handelsapp, volwaardige financiële planningstool,
smart-home-bedieningsplatform of autonoom systeem dat accounts of
toestellen bedient. De kernfunctionaliteit mag niet afhankelijk zijn van
een betaalde generatieve AI-API.

------------------------------------------------------------------------

# 3. Gebruiker en personalisatie

## 3.1 Primair gebruik

Northstar is momenteel een persoonlijk product voor één gebruiker. Er is
geen requirement voor meerdere gebruikers, rollen of gedeelde
dashboards.

De gebruiker gebruikt onder meer iPhone, iPad en desktopbrowser. De
ontwikkeling gebeurt via GitHub Codespaces; er is geen vaste
persoonlijke Windows-pc als ontwikkelmachine beschikbaar. De applicatie
moet daarom mobiel goed bruikbaar zijn en het ontwikkelproces moet
vanuit Codespaces kunnen verlopen.

## 3.2 Interesses

### Technologie en AI

-   artificiële intelligentie;
-   software en digitale producten;
-   technologiebedrijven en productontwikkelingen;
-   data, analytics en innovaties;
-   belangrijke software-updates en ontwikkelingen in de techsector.

### Economie en business

-   Belgische en Europese economie;
-   internationale macro-economische ontwikkelingen;
-   centrale banken en monetair beleid;
-   inflatie en rentevoeten;
-   hypotheekmarkten;
-   energieprijzen;
-   bedrijfsnieuws en businessontwikkelingen.

### Sport

-   NBA, met bijzondere aandacht voor de Los Angeles Lakers;
-   Belgische NBA-spelers Toumani Camara en AJ Mitchell;
-   Premier League;
-   Belgisch voetbal en Jupiler Pro League;
-   Belgische nationale voetbalploeg / Rode Duivels.

### Andere interesses

-   koken en voeding;
-   reizen;
-   technologie voor dagelijks gebruik;
-   praktische informatie voor het dagelijks leven.

Deze lijst stuurt de relevantie, maar is geen verplicht
publicatieschema. Een onderwerp hoeft niet dagelijks te verschijnen als
er geen relevant nieuws is.

## 3.3 Personalisatieregels

-   Relevantie is belangrijker dan uitsluitend publicatietijd.
-   Een uitzonderlijke prestatie van een gevolgde speler kan relevant
    zijn als de onderliggende sportdata betrouwbaar is.
-   Beperk dubbele berichtgeving over dezelfde gebeurtenis.
-   Verwijder geen onafhankelijke invalshoeken blind.
-   De oorspronkelijke bron moet toegankelijk blijven.
-   Forceer geen vulling van categorieën.

------------------------------------------------------------------------

# 4. Functionele productstructuur

De gewenste hoofdonderdelen zijn:

1.  **Home / Dashboard** --- centrale startpagina.
2.  **Daily Briefing** --- compacte dagelijkse selectie.
3.  **News Center** --- uitgebreider nieuws met filters en sortering.
4.  **Sports** --- wedstrijden, uitslagen en sportprestaties.
5.  **Economic & Financial Intelligence** --- economische en financiële
    indicatoren.
6.  **Agenda** --- persoonlijke agenda, indien een ICS-bron
    geconfigureerd is.
7.  **Weather** --- weersinformatie voor de ingestelde locatie.
8.  **Auto** --- één alleen-lezen kaart op Home met batterij, actieradius
    en laadstatus van de Mercedes-Benz CLA 250+ via Smartcar (besluit
    gebruiker 2026-11-25, zie 13.7 en 14.2).

**Mobility & Home blijft verder buiten de gebruikersinterface.** Alleen
de Auto-kaart is toegevoegd; er komt geen aparte Mobility &
Home-pagina. Dreame wordt niet geïntegreerd en Renson is expliciet
geschrapt. Zie hoofdstuk 14 en 15.

Inspecteer eerst de bestaande navigatie en interface. Behoud werkende
patronen en introduceer geen onnodige herstructurering.

------------------------------------------------------------------------

# 5. Home / Dashboard

## 5.1 Doel

De Home-pagina is het dagelijkse startpunt. De gebruiker moet in één
oogopslag de belangrijkste informatie kunnen zien en van daaruit kunnen
doorklikken naar detailmodules.

## 5.2 Functionele vereisten

-   Toon de belangrijkste informatie uit de beschikbare modules.
-   Gebruik consistente panelen of kaarten.
-   Geef prioriteit aan belangrijke en actuele informatie.
-   Houd de startpagina compact en scanbaar.
-   Toon per module een duidelijke laad-, succes-, fout- of
    verouderingsstatus.
-   Een fout in één module mag andere modules niet blokkeren.
-   Behoud de laatst succesvol opgehaalde gegevens als een refresh
    mislukt.
-   Voorzie een afzonderlijke refreshmogelijkheid per relevant paneel.
-   Een refresh mag de volledige pagina niet herladen.
-   Voorkom overlappende verzoeken voor dezelfde resource.
-   Toon de timestamp van de laatste succesvolle update waar relevant.

## 5.3 Weer

-   De laatst besproken standaardlocatie is **Diest, België**.
-   De locatie is configureerbaar en mag niet verspreid hardcoded
    worden.
-   Bestaande `WEATHER_*`-configuratie kan de repository-default
    overschrijven.
-   Toon alleen gegevens die de gekozen bron daadwerkelijk levert.
-   Toon bij fouten of verouderde data een duidelijke status.
-   Gebruik geen exacte locatiegegevens tenzij de gebruiker die
    expliciet configureert.

## 5.4 Agenda

-   Agenda-integratie kan via een ICS-feed verlopen.
-   Agenda is optioneel en afhankelijk van geldige configuratie.
-   Zonder ICS-configuratie worden geen fictieve afspraken getoond.
-   ICS-URL's en tokens zijn secrets en mogen niet in de frontend of
    publieke repository terechtkomen.
-   De actuele agendaweergave en synchronisatiefrequentie moeten in de
    bestaande code worden gecontroleerd; deze zijn niet volledig
    vastgelegd.

------------------------------------------------------------------------

# 6. Daily Briefing

## 6.1 Doel

De Daily Briefing is de belangrijkste samenvattende functie. Ze bundelt
de belangrijkste ontwikkelingen in een beknopte dagelijkse briefing.

De bestaande richting is een **deterministische server-side briefing**,
zonder betaalde AI-API voor de kernselectie. Behoud deze keuze tenzij de
gebruiker later expliciet anders beslist.

## 6.2 Secties

De briefing kan bevatten: - Nieuws. - Sport. - Economie en financiën. -
Agenda. - Weer.

Secties mogen beperkt of leeg zijn als er geen relevante of betrouwbare
informatie is. Verzin geen items om een sectie te vullen.

## 6.3 Nieuwsselectie

-   Maximaal vijf hoofdnieuwsitems in de compacte briefing.
-   Rangschik op relevantie.
-   Bewaak redelijke categoriebalans.
-   Beperk duplicaten.
-   Behoud een bronlink per item.
-   Gebruik alleen beschikbare broninformatie.
-   Als een artikel geen bruikbare beschrijving heeft, verzin geen
    samenvatting.
-   Geef voorrang aan belangrijke gebeurtenissen boven kleine updates.
-   Vermijd dat hetzelfde nieuws via verschillende feeds meerdere
    plaatsen inneemt.

## 6.4 Economische ontwikkelingen

-   Maximaal twee betekenisvolle economische of financiële
    ontwikkelingen.
-   Voorbeelden: ECB-rentebesluiten, opvallende inflatiecijfers,
    hypotheekrenteontwikkelingen, energieprijzen of mondiale
    groeicijfers.
-   Neem geen kleine of triviale wijzigingen op.
-   Presenteer geen verouderde indicatorobservatie als nieuw.
-   Toon bron en referentieperiode.
-   Een indicatorverandering is alleen een briefing-item als ze
    betekenisvol is.

## 6.5 Sport in de briefing

-   Maak onderscheid tussen live, afgelopen en geplande wedstrijden.
-   De eerder gerapporteerde implementatie gebruikte een venster van 24
    uur vóór tot 24 uur na het actuele moment; behoud dit tenzij de
    gebruiker anders beslist.
-   Toon geen fictieve scores.
-   Een ontbrekende score is onbekend/leeg, nooit automatisch 0.
-   Besteed bijzondere aandacht aan de Lakers, Toumani Camara en AJ
    Mitchell wanneer relevante data beschikbaar is.
-   Neem belangrijke Premier League- en Belgische voetbalontwikkelingen
    mee.
-   Geef uitslagen en bijzondere prestaties voldoende gewicht.

## 6.6 Caching en foutafhandeling

Eerder gerapporteerde implementatie: - server-side cache van ongeveer 15
minuten; - refresh kan waar mogelijk de cache omzeilen; - gedeeltelijke
resultaten als een bron niet beschikbaar is; - behoud van laatst bekende
gegevens bij tijdelijke fouten; - waarschuwingen voor verouderde data.

Deze eigenschappen moeten behouden blijven, ook als de implementatie
intern verandert.

------------------------------------------------------------------------

# 7. News Center

## 7.1 Doel

Het News Center biedt een uitgebreider overzicht dan Home en Daily
Briefing. De gebruiker kan nieuws filteren en sorteren op relevantie of
recentheid.

## 7.2 Categorieën

Gewenste categorieën: - België / algemeen; - internationaal; -
Technologie & AI; - Economie & business; - Sport.

**Data & Software mag geen afzonderlijke hoofdcategorie zijn.**
Relevante inhoud valt onder Technologie & AI.

Categorieën moeten consistent zijn in artikelmetadata, filters en
briefingselectie.

## 7.3 Belgische bronnen en talen

-   Belgische nieuwsitems mogen Nederlands of Engels zijn.
-   Franstalige Belgische items via RTBF zijn expliciet uit de gewenste
    bronnenmix verwijderd.
-   VRT NWS is een relevante Belgische bron.
-   Sporza is relevant voor Belgisch voetbal en sport.
-   Reuters werd genoemd als mogelijke bron om te onderzoeken;
    definitieve opname is afhankelijk van feedbeschikbaarheid,
    voorwaarden en betrouwbaarheid.

## 7.4 Eerder genoemde bronnen

  -----------------------------------------------------------------------
  Domein                              Eerder genoemde bron
  ----------------------------------- -----------------------------------
  België                              VRT NWS

  Internationaal                      BBC News, The Guardian

  Technologie                         Ars Technica, MIT Technology
                                      Review, Simon Willison, GitHub
                                      Changelog

  Economie                            BBC Business, De Tijd

  NBA                                 ESPN NBA News

  Premier League                      BBC Sport Premier League

  Belgisch voetbal                    Sporza --- gewenste uitbreiding
  -----------------------------------------------------------------------

RTBF is verwijderd uit de gewenste bronnenmix.

Deze lijst is een consolidatie van eerder genoemde bronnen. Controleer
de actuele configuratie en valideer feeds. Een bron die eerder werkte,
kan intussen veranderd of onbereikbaar zijn.

## 7.5 Filters en sortering

Het News Center ondersteunt: - filter op categorie; - filter op bron; -
filter op datum/periode; - sortering op relevantie; - sortering op
recentheid.

**Standaardsortering: relevantie.** Recentheid is een alternatief. Een
recenter artikel is niet automatisch belangrijker.

## 7.6 Artikelweergave

Toon per artikel, voor zover beschikbaar: - titel; - korte
beschrijving; - bron; - categorie; - publicatiedatum en -tijd; -
oorspronkelijke taal; - link naar het originele artikel; - alternatieve
bronlinks als duplicaten zijn herkend.

De gebruiker heeft expliciet gevraagd om grotere en beter leesbare
titels en beschrijvingen.

## 7.7 Deduplicatie en datavalidatie

-   Pas voorzichtige deduplicatie toe.
-   Verwijder geen onafhankelijke berichtgeving met een eigen
    invalshoek.
-   Behoud alternatieve bronlinks waar mogelijk.
-   Filter artikelen met ongeldige essentiële velden.
-   Bij ontbrekende of ongeldige datum: toon "datum niet beschikbaar" of
    gelijkwaardig.
-   Verzin nooit een publicatiedatum.
-   Valideer RSS/XML-invoer.
-   Beperk omvang en diepte van feedverwerking.
-   Laat geen willekeurige feed-URL's vanuit onbeveiligde
    gebruikersinvoer toe.

## 7.8 Betrouwbaarheid

Eerder gerapporteerde maatregelen: - feeds parallel laden; - cache van
ongeveer vijf minuten; - bescherming tegen dubbele gelijktijdige
verzoeken; - retry-backoff; - foutisolatie per feed; - behoud van stale
data met waarschuwing; - XML-validatie en invoerlimieten; - geen
afhankelijkheid van één enkele feed.

------------------------------------------------------------------------

# 8. Sports

## 8.1 Doel

Sports toont sportnieuws, wedstrijden, uitslagen en relevante
prestaties. De prioriteiten volgen het persoonlijke interesseprofiel.

## 8.2 NBA

Bijzondere aandacht voor: - Los Angeles Lakers; - Toumani Camara; - AJ
Mitchell.

Waar betrouwbare data beschikbaar is, toon: - wedstrijdschema; -
live-status; - eindresultaat; - relevante spelersprestaties; -
statistieken.

De Belgische spelers zijn ook relevant wanneer ze niet tegen of bij de
Lakers spelen. Hun eigen prestaties zijn op zichzelf relevant.

## 8.3 Premier League

-   Belangrijke uitslagen.
-   Relevante wedstrijdontwikkelingen.
-   Opvallende individuele en teamprestaties.
-   Nieuws in verband met recente uitslagen.
-   Geef uitslagen en prestaties voldoende aandacht.

## 8.4 Belgisch voetbal

-   Jupiler Pro League.
-   Belgische nationale ploeg / Rode Duivels.
-   Belangrijke uitslagen en prestaties.
-   Sporza als gewenste bron.

## 8.5 Statussen, tijd en datakwaliteit

-   Wedstrijden correct aanduiden als gepland, live of afgelopen.
-   Tijden in lokale tijdzone weergeven, met tijdzoneaanduiding waar
    relevant.
-   Ontbrekende scores blijven onbekend/leeg.
-   Een ontbrekende score mag nooit als 0-0 worden weergegeven.
-   Bron en timestamp beschikbaar maken waar relevant.
-   Toon geen wedstrijd als live zonder betrouwbare statusinformatie.

## 8.6 Openstaande details

De precieze sportdataprovider, API-limieten, competitie-ID's en
volledige statistische scope zijn niet definitief vastgelegd. Inspecteer
de bestaande code en documenteer provider en beperkingen. Vervang een
bestaande bron niet zonder reden.

------------------------------------------------------------------------

# 9. Economic & Financial Intelligence

## 9.1 Doel

Een economisch en financieel cockpitoverzicht met nadruk op België, de
eurozone en relevante mondiale ontwikkelingen.

Dit onderdeel is informatief. Het geeft geen persoonlijk
beleggingsadvies, kredietadvies of bankofferte.

## 9.2 Wisselkoersen

-   Behoud de bestaande Frankfurter-integratie.
-   Toon relevante wisselkoersen.
-   Vermeld valuta en referentiedatum.
-   Presenteer referentiekoersen niet als gegarandeerde realtime
    handelskoersen.

## 9.3 ECB-rentevoeten

Toon waar beschikbaar: - Deposit facility rate. - Main refinancing
operations rate. - Marginal lending facility rate. - Datum van de laatst
waargenomen wijziging. - Historisch verloop via grafiek.

Gebruik officiële ECB-data en benoem rentevoeten correct.

## 9.4 Mondiale economische groei

-   Toon jaarlijkse reële mondiale bbp-groei via World Bank-data.
-   Vermeld referentiejaar.
-   Maak duidelijk dat dit jaarlijkse macrodata zijn en geen realtime
    indicator.

## 9.5 Inflatie

Gebruik Eurostat HICP voor: - België; - eurozone.

Toon: - geharmoniseerde inflatie (HICP); - referentiemaand; - dataset-
of update-informatie waar beschikbaar.

Maak duidelijk dat HICP niet noodzakelijk identiek is aan de nationale
Belgische CPI. Presenteer oude observaties niet als actuele cijfers.

## 9.6 Belgische hypotheekrente

-   Gebruik waar beschikbaar ECB/MIR-data over gemiddelde rentevoeten op
    nieuwe Belgische hypothecaire leningen.
-   Toon historische evolutie waar de gegevensreeks dat ondersteunt.
-   Vermeld referentieperiode.
-   Toon disclaimer: dit is een gemiddelde marktindicator, geen
    persoonlijke bankofferte of individueel kredietaanbod.

## 9.7 Belgische elektriciteits- en gasprijzen

Gebruik waar beschikbaar Eurostat-consumentenprijsdata voor: -
elektriciteit; - gas.

Toon: - halfjaarlijkse referentieperiode; - relevante
verbruikscategorie; - of belastingen en heffingen inbegrepen zijn.

Maak expliciet onderscheid tussen consumentenprijzen en
groothandelsprijzen. Presenteer dit niet als realtime energieprijzen.

## 9.8 IMIE

De eerder gerapporteerde implementatie toont een officiële
IMIE-slotkoers via de ETF-uitgever.

Beperkingen: - dit is geen live intraday-koers; - dit is niet hetzelfde
als de waarde van een brede aandelenindex; - er werd geen betrouwbare
gratis en stabiele bron voor een brede aandelenindex gevonden; - een
historische grafiek werd niet gerealiseerd omdat historische brondata
niet als bruikbare gestructureerde reeks beschikbaar waren.

Behoud deze nuance. Voeg geen indexgrafiek of live claim toe zonder
nieuwe betrouwbare bron.

## 9.9 Actualiteit en caching

De gerapporteerde cacheduur varieert ongeveer van 6 uur tot 30 dagen,
afhankelijk van bronfrequentie.

-   Stem cacheduur af op bronfrequentie.
-   Behoud laatst bekende data bij tijdelijke fouten.
-   Signaleer veroudering duidelijk.
-   Toon referentieperiode en bron.
-   Voer geen onnodig frequente requests uit voor maandelijkse,
    halfjaarlijkse of jaarlijkse datasets.

------------------------------------------------------------------------

# 10. Generieke interactie- en foutafhandeling

Deze vereisten gelden voor alle gegevensmodules.

## 10.1 Refresh

-   Elk relevant paneel heeft een eigen refreshactie.
-   Refresh herlaadt niet de volledige pagina.
-   Toon een laadindicator.
-   Toon foutstatus bij mislukking.
-   Behoud de laatste succesvolle data.
-   Toon de timestamp van de laatste succesvolle update.

## 10.2 Requests en caching

-   Voorkom overlappende requests voor dezelfde resource.
-   Gebruik in-flight request-deduplicatie waar zinvol.
-   Gebruik passende time-outs.
-   Gebruik begrensde retry-strategieën met backoff.
-   Vermijd oneindige retry-loops.
-   Cache op serverniveau waar dat externe bronnen ontlast en de
    gebruikerservaring verbetert.

## 10.3 Statusmodel

De UI moet onderscheid maken tussen: - nog niet geladen; - laden; -
succesvol geladen; - tijdelijk mislukt; - verouderde maar beschikbare
data; - niet geconfigureerd; - niet ondersteund.

Gebruik een specifieke status als de oorzaak bekend is. Verberg een
configuratieprobleem niet achter een algemene netwerkfout.

------------------------------------------------------------------------

# 11. Niet-functionele requirements

## 11.1 Gebruiksvriendelijkheid

-   Snel scanbaar.
-   Duidelijke titels, labels, eenheden, datums en bronvermeldingen.
-   Compact maar niet cryptisch.
-   Consistente kaarten, panelen en interacties.
-   Geen onnodige lege modules.
-   Geen decoratieve elementen die informatie verdringen.

## 11.2 Responsive design

Northstar moet volwaardig bruikbaar zijn op: - iPhone; - iPad; -
desktopbrowser.

Op kleine schermen: - geen horizontale scroll voor normale
kernfunctionaliteit; - leesbare titels en beschrijvingen; - kaarten
logisch stapelen; - bedieningselementen bruikbaar houden; - tabellen en
grafieken mobiel bruikbaar maken.

## 11.3 Performance

-   Laad onafhankelijke bronnen parallel waar passend.
-   Gebruik caching.
-   Vermijd onnodige externe API-calls.
-   Voorkom dubbele requests.
-   Een trage bron mag de volledige applicatie niet blokkeren.
-   Houd rekening met Render Free: de service kan na inactiviteit slapen
    en de eerste request kan daardoor vertraging hebben.

## 11.4 Toegankelijkheid

-   Voldoende kleurcontrast.
-   Status niet uitsluitend via kleur communiceren.
-   Duidelijke labels en foutmeldingen.
-   Bedienbare interactieve componenten.
-   Goede leesbaarheid op mobiel.

## 11.5 Taal

Nederlands is de primaire taal voor UI en functionele labels.
Nieuwsartikelen mogen in de oorspronkelijke toegestane taal worden
getoond.

------------------------------------------------------------------------

# 12. Huidige technische opzet en deployment

Dit is een **as-is-overzicht op basis van de laatst bekende gesprekken
en rapportages**. De actuele repository en Render-configuratie zijn
leidend en moeten vóór wijzigingen worden gecontroleerd.

## 12.1 GitHub en versiebeheer

Laatst bekende gegevens: - Repository:
`alexanderbeyens-source/personal-home-dashboard` - Hoofdbranch: `main` -
Ontwikkelomgeving: GitHub Codespaces - Implementatie via Copilot Agent
in Codespaces.

De gebruiker werkt niet op een vaste persoonlijke pc. Ontwikkelstappen
moeten daarom vanuit Codespaces uitvoerbaar zijn.

### Git-werkwijze

Na een afgeronde fase worden wijzigingen vanuit de Codespaces-terminal
gepubliceerd:

``` bash
git status
git add -A
git commit -m "Describe the completed change"
git push origin main
```

Controleer vóór commit welke bestanden gewijzigd zijn. Commit geen
secrets, lokale configuratie of tijdelijke bestanden. Gebruik een
betekenisvolle commitboodschap.

Een push naar `main` is de gebruikelijke trigger voor Render-deployment
als auto-deploy is ingeschakeld.

## 12.2 Hosting: Render

Laatst bekende configuratie: - Platform: Render. - Service:
`northstar-dashboard`. - Plan: Free. - Regio: Frankfurt. - Live URL:
`https://northstar-dashboard-8tym.onrender.com` - Build command:
`npm ci --include=dev && npm run build` - Start command:
`npm run server` - Health endpoint: `/healthz`.

De backend gebruikt in productie `process.env.PORT`, zodat Render de
toegewezen poort kan gebruiken.

### Render Free

-   De service kan na ongeveer 15 minuten inactiviteit slapen.
-   De eerste request na slaapstand kan tot ongeveer een minuut
    opstartvertraging hebben.
-   Dit is een hostingbeperking en niet noodzakelijk een applicatiefout.
-   Upgrade naar een betaald plan vereist expliciete toestemming.

### Deploymentproces

1.  Copilot implementeert en test in Codespaces.
2.  Wijzigingen worden gecommit en gepusht naar GitHub `main`.
3.  Render detecteert de nieuwe commit als auto-deploy actief is.
4.  Controleer in Render **Events** of deployment gestart is.
5.  Wacht tot de deployment status **Live** bereikt.
6.  Controleer `/healthz` en open de live applicatie.

Een wijziging in Codespaces staat niet automatisch live. Een GitHub-push
is evenmin bewijs van een geslaagde Render-deployment.

## 12.3 Frontend en backend

Laatst bekende stack: - Frontend: React. - Buildtool: Vite. -
Frontendtaal: TypeScript. - Backend: Node.js HTTP-server. -
Productieserver serveert de gebouwde frontend en API. - Vite proxy
gebruikt `/api` voor backendrequests in ontwikkeling.

Exacte packageversies, mapstructuur, routering en componentbibliotheken
moeten in de repository worden gecontroleerd.

## 12.4 Authenticatie en toegang

Laatst bekende opzet: - GitHub OAuth voor aanmelden. - Single-user
allowlist. - Toegelaten GitHub numeric ID: `360250317`. - Stateless
encrypted JWE-sessies. - Gerapporteerde sessieduur: acht uur. -
API-routes zijn beschermd. - `/healthz` en noodzakelijke OAuth-routes
zijn uitzonderingen.

Een eerdere CSP-aanpassing liet `https://github.com` toe via
`form-action`, zodat de OAuth-redirect kon functioneren.

**Beveiligingsregel:** wijzig OAuth, allowlist, sessiecryptografie,
cookies of security headers niet zonder expliciete toestemming en
afzonderlijke beveiligingsreview.

## 12.5 Beveiligingsmaatregelen

Eerder gerapporteerd: - security headers; - method checks; - rate
limiting; - gesaneerde foutmeldingen; - beschermde API-routes; -
server-side secrets; - health endpoint; - validatie van externe
gegevens.

Deze maatregelen moeten behouden blijven.

## 12.6 Configuratie en secrets

-   `.env.example` bevat alleen placeholders of voorbeeldwaarden.
-   Echte secrets staan in de daarvoor bedoelde secret-configuratie,
    bijvoorbeeld Render environment variables of Codespaces secrets.
-   Geen OAuth-secret, sessiesleutel, ICS-secret, API-token of
    wachtwoord committen.
-   Secrets niet in frontendbundles plaatsen.
-   Secrets niet in logs of foutmeldingen opnemen.
-   Documenteer variabelen zonder hun waarden te publiceren.
-   Smartcar: `SMARTCAR_CLIENT_ID`, `SMARTCAR_CLIENT_SECRET` en
    `SMARTCAR_REDIRECT_URI` staan alleen in Render. Het client secret en
    de Smartcar-tokens blijven server-side en komen niet in logs,
    foutmeldingen of de frontend.
-   Controleer `.gitignore` en Git history op onbedoeld toegevoegde
    secrets.

## 12.7 Weerconfiguratie

-   Laatst bekende repository-default: Diest.
-   `WEATHER_*` environment variables kunnen de standaardinstelling
    overschrijven.
-   Exacte variabelenamen en waarden moeten in `.env.example`, README en
    Render-configuratie worden gecontroleerd.

## 12.8 Externe gegevensbronnen

Eerder genoemd of gerapporteerd: - Frankfurter voor wisselkoersen. - ECB
voor rentevoeten en MIR-data. - World Bank voor mondiale bbp-groei. -
Eurostat voor HICP en energieprijzen. - ETF-uitgever voor
IMIE-slotkoers. - RSS/XML-feeds voor nieuws. - Sportdatabron voor NBA en
voetbal; exacte provider moet in de repository worden gecontroleerd. -
ICS-feed voor optionele agenda. - Weerprovider; exacte provider moet in
de repository worden gecontroleerd.

Controleer actuele implementatie, bronvoorwaarden, limieten en eventuele
API-keys. Dit document garandeert niet dat elke bron vandaag nog
beschikbaar is.

------------------------------------------------------------------------

# 13. Historiek van ontwikkelfases

De onderstaande fasehistoriek is gebaseerd op eerdere Copilot-rapporten
die door de gebruiker zijn gedeeld.

## 13.1 Phase 1 --- bestaande widgets verbeteren

Volgens rapportage gerealiseerd: - eigen refresh per paneel; - loading-,
error- en last-success-status; - behoud van oude data bij refreshfout; -
geen overlappende requests; - geen volledige paginareload; - validatie
van nieuwsartikelen en datums; - ongeldige artikelen filteren; - aparte
NBA-routes voor scores en spelersdata; - lokale sporttijd met
tijdzone; - ontbrekende scores leeg laten; - standaardweerlocatie
aangepast naar Diest; - documentatie en tests.

Historisch gemelde testuitkomst: 11 tests geslaagd, naast build- en
beveiligingscontroles.

## 13.2 Phase 2A --- News Center

Volgens rapportage gerealiseerd: - hoofdnieuwsselectie op dashboard; -
aparte `/news`-weergave; - categorie-, bron- en datumfilters; - bron,
taal, publicatietijd en originele link; - voorzichtige deduplicatie; -
alternatieve bronlinks; - parallel laden van feeds; - cache van ongeveer
vijf minuten; - bescherming tegen dubbele requests; - retry-backoff; -
foutisolatie per feed; - stale data met waarschuwing; - XML-validatie en
limieten.

Historisch gemelde testuitkomst: 28 tests geslaagd. Er werd ook gemeld
dat 13 van 13 live feeds tijdens die controle HTTP 200 en parseerbare
artikelen opleverden. Dit is een historisch resultaat, geen actuele
garantie.

## 13.3 Phase 2A.1 --- nieuws- en sportverfijning

Besproken wijzigingen: - Belgische nieuwsitems in Nederlands en
Engels; - RTBF verwijderen; - Reuters onderzoeken; - relevantie als
standaard sortering en recentheid als alternatief; - Belgisch
voetbal/Jupiler Pro League en Rode Duivels via Sporza toevoegen; - Data
& Software opheffen als aparte categorie en relevante items onder
Technologie & AI brengen; - titels en beschrijvingen beter
leesbaar/groter maken.

De uiteindelijke implementatiestatus van elk detail moet in de
repository worden gecontroleerd.

## 13.4 Phase 2B --- Daily Briefing

Volgens rapportage gerealiseerd: - server-side deterministische
briefing; - maximaal vijf relevante hoofdnieuwsitems; - categoriebalans
en deduplicatie; - nieuws-, sport-, financiële, agenda- en
weersecties; - bronlinks; - geen verzonnen samenvattingen; -
sportstatussen; - aandacht voor Toumani Camara en AJ Mitchell als data
beschikbaar is; - wedstrijdvenster 24 uur terug en vooruit; - cache van
ongeveer 15 minuten; - gedeeltelijke resultaten bij bronfouten; - geen
betaalde AI-API.

Historisch gemelde testuitkomst: 42 tests geslaagd, build en security
checks geslaagd.

## 13.5 Phase 2C --- Economic & Financial Intelligence

Volgens rapportage gerealiseerd: - Frankfurter-wisselkoersen behouden; -
ECB-depositorente, herfinancieringsrente en marginal lending rate; -
datum laatste rentewijziging en historische grafiek; - World Bank
jaarlijkse reële mondiale bbp-groei; - Eurostat HICP België en
eurozone; - ECB/MIR gemiddelde Belgische rente op nieuwe hypothecaire
leningen; - Eurostat Belgische elektriciteits- en
gasconsumentenprijzen; - IMIE-officiële slotkoers via ETF-uitgever; -
maximaal twee relevante economische ontwikkelingen in Daily Briefing; -
bronfrequentie-afhankelijke caching; - behoud van stale data met
waarschuwing.

Historisch gemelde testuitkomst: 47 tests geslaagd, build, syntax,
beveiligings- en diff-controles geslaagd.

Bekende beperkingen uit het rapport: - geen betrouwbare gratis stabiele
brede aandelenindexbron gevonden; - IMIE is geen indexniveau; -
IMIE-historische data niet beschikbaar als geschikte gestructureerde
reeks; - HICP is niet identiek aan nationale Belgische CPI; -
energieprijzen zijn consumentenprijzen, geen groothandelsprijzen.

## 13.6 Phase 3 --- Mobility & Home haalbaarheid

Onderzocht: - Dreame L50s Pro Ultra; - Mercedes-Benz CLA 250+ modeljaar
2026 via Mercedes me; - Renson Healthbox 3.0.

Conclusie en beslissing: - Renson laten vallen. - Geen Home Assistant
installeren. - Dreame-community-integratie lijkt het exacte model te
herkennen, maar de gedocumenteerde route vereist Home Assistant en
Dreame-accountgegevens. - Er is geen voldoende aangetoonde officiële
rechtstreekse Dreame-cloud-API voor deze use case vastgesteld. -
Matter-ondersteuning voor het exacte toestel is niet bewezen. - Mercedes
heeft officiële API-producten, maar toegang voor deze particuliere
Europese 2026-auto is niet bevestigd. - Community-opties kunnen afhangen
van private API's en rate limits. - Geen toesteladapters of credentials
toevoegen. - Geen Mobility & Home-pagina tonen.

**Fase 3 wordt voorlopig afgesloten als haalbaarheidsonderzoek, niet als
gerealiseerde integratie.** De technische bevindingen mogen in
documentatie blijven staan. De frontend mag geen lege of
niet-functionele toestelkaarten bevatten.

Bijgewerkt 2026-11-25: voor Mercedes is een officiële partnerroute
(Smartcar) gevonden en gerealiseerd; zie 13.7. Voor Dreame blijft
bovenstaande conclusie gelden.

## 13.7 Phase 3B --- Mercedes via Smartcar (alleen lezen)

Besluit gebruiker 2026-11-25: de Mercedes-Benz CLA 250+ wordt alleen
lezend gekoppeld via Smartcar, officiële partner van Mercedes-Benz
Connectivity Services, op het gratis Smartcar Free-plan. De gebruiker
bevestigde dat de VIN compatibel is en dat State of Charge en Range in
het plan zitten.

Gerealiseerd: - Smartcar Vehicles API v3 (v2.0 wordt op 2026-12-01
uitgefaseerd); - applicatietoken via client credentials (1 uur geldig,
geen refresh token), dus geen tokenopslag en geen extra dienst nodig
ondanks het slapen van Render Free; - de koppeling zelf wordt door
Smartcar bewaard en via `/v3/connections` opgezocht; - alleen signalen
lezen (batterij, actieradius, laden, kabel aangesloten); geen locatie
en geen commando's; - ophalen alleen bij openen van het dashboard,
in-memory cache van 60 minuten (keuze gebruiker: mag minder vaak dan
5 minuten), vernieuwen hoogstens om de 5 minuten; geen polling op de
achtergrond en geen webhooks; - statussen "niet gekoppeld" (met
koppelknop), "opnieuw autoriseren nodig" en "data tijdelijk niet
beschikbaar" met het tijdstip van de laatste geldige waarde; -
`/api/vehicle`, `/api/smartcar/connect` en `/api/smartcar/callback`
zitten achter de GitHub-login; de Connect-flow gebruikt een ondertekende,
eenmalige `state`; - de kaart is verborgen zolang de
Smartcar-variabelen niet ingesteld zijn.

Beperkingen: - de laatste geldige waarde staat in het geheugen en is na
een herstart weg tot de volgende geslaagde ophaling; - de maandlimiet
van het Free-plan per voertuig is niet gepubliceerd; - de Connect-URL
gebruikt de client-ID als `application_id` (volgens de voorbeelden in
de Smartcar-documentatie dezelfde waarde).

------------------------------------------------------------------------

# 14. Mobility & Home --- scopebesluit

## 14.1 Dreame

Toestel: Dreame L50s Pro Ultra.

Mogelijk interessante gegevens als later een betrouwbare methode
beschikbaar wordt: - robotstatus; - batterijpercentage; - laatste
schoonmaakbeurt; - reinigingsduur; - gereinigde oppervlakte; -
onderhoudsindicatoren; - foutmeldingen.

Huidige beslissing: niet integreren totdat een veilige, stabiele, gratis
en rechtstreekse koppeling zonder Home Assistant aantoonbaar beschikbaar
is.

Heronderzoek 2026-11-24 (gebruiker noemde een "L50 Pro Ultra"; deze
spec noemt de L50s Pro Ultra):

- Matter-ondersteuning is gemeld voor de L50s Pro Ultra (Notebookcheck,
  maart 2026), niet bevestigd voor de L50 Pro Ultra.
- Matter werkt uitsluitend lokaal op het thuisnetwerk. Een op Render
  gehoste Northstar kan de robot daardoor niet rechtstreeks bereiken;
  er is een lokale hub nodig (Home Assistant of Homey) plus beveiligde
  toegang van buitenaf. Dat is nieuwe infrastructuur en botst met §14.4.
- De Home Assistant-community-integratie `dreame-vacuum` gebruikt de
  Dreame-cloud met de accountgegevens van de gebruiker; geen officiële
  publieke API.
- Besluit blijft: niet integreren. Mogelijke latere route als de
  gebruiker alsnog een lokale hub wil: Matter → Home Assistant → de
  bestaande `HOME_ASSISTANT_*`-koppeling van Northstar.

## 14.2 Mercedes

Voertuig: Mercedes-Benz CLA 250+, modeljaar 2026. De gebruiker gebruikt
de officiële Mercedes me-app.

Mogelijk interessante gegevens: - batterijpercentage; - laadstatus; -
actieradius; - kilometerstand; - laatste update; - eventueel
laadvermogen en resterende laadtijd.

Huidige beslissing (2026-11-25): alleen lezend integreren via Smartcar
(officiële Mercedes-partner, Free-plan, €0) als één Auto-kaart op Home:
batterijpercentage, actieradius, laadstatus en laatste update.
Kilometerstand, laadvermogen en resterende laadtijd worden voorlopig
niet getoond. Zie 13.7.

## 14.3 Renson

Toestel: Renson Healthbox 3.0.

Huidige beslissing: expliciet buiten scope. De gebruiker hoeft
Renson-data niet in Northstar.

## 14.4 Home Assistant

Huidige beslissing: niet installeren. De gebruiker heeft nog geen Home
Assistant-installatie en wil voorlopig geen extra
smart-home-infrastructuur opzetten.

------------------------------------------------------------------------

# 15. Kosten, autonomie en beslissingsbevoegdheid

## 15.1 Kostenbeleid

-   Voorkeur voor €0 bijkomende kosten.
-   Geen betaalde API's zonder toestemming.
-   Geen extra hosting of infrastructuur zonder toestemming.
-   Geen database toevoegen zonder toestemming.
-   Bestaande Render Free-omgeving behouden zolang die functioneel
    volstaat.

## 15.2 Werkwijze voor AI-agent / Copilot

De gebruiker verwacht dat een AI-agent zo zelfstandig mogelijk werkt: -
eerst codebase en bestaande architectuur analyseren; - requirements
vertalen naar concrete implementatie; - zelfstandig technische keuzes
maken als die geen grote impact hebben; - code schrijven; - tests
toevoegen en uitvoeren; - fouten zelfstandig oplossen; - build, security
checks en diff controleren; - documentatie bijwerken; - een helder
eindrapport afleveren.

De gebruiker wil niet na elke kleine stap screenshots maken of manueel
testen. Handmatige controle mag geen standaardvoorwaarde zijn als de AI
de relevante tests zelfstandig kan uitvoeren.

## 15.3 Wanneer is toestemming vereist?

Vraag vooraf expliciete toestemming voor: - betaalde diensten,
abonnementen of API's; - nieuwe infrastructuur of hosting; - nieuwe
database of migratie; - OAuth- of authenticatiewijzigingen; - wijziging
van securitymodel of secrets; - destructieve wijzigingen of
dataverlies; - acties op externe accounts of fysieke toestellen; -
wijzigingen die de productieomgeving wezenlijk kunnen onderbreken.

## 15.4 Faseafbakening

-   Voer de afgesproken fase uit.
-   Test en documenteer.
-   Lever een eindrapport.
-   Start niet automatisch de volgende fase.
-   De gebruiker bepaalt de volgende ontwikkelprioriteit.

------------------------------------------------------------------------

# 16. Test- en acceptatiecriteria

## 16.1 Algemene Definition of Done per wijziging

Een wijziging is klaar wanneer: 1. relevante requirements
geïmplementeerd zijn; 2. bestaande functionaliteit niet onbedoeld is
afgebroken; 3. tests zijn toegevoegd of aangepast; 4. relevante
testsuite slaagt; 5. productiebuild slaagt; 6. security checks zijn
uitgevoerd; 7. `git diff --check` slaagt; 8. documentatie is bijgewerkt;
9. beperkingen en open punten expliciet zijn gerapporteerd.

## 16.2 Functionele tests

Test onder meer: - correcte weergave van beschikbare gegevens; -
ontbrekende waarden; - ongeldige datums; - onbereikbare bron; -
gedeeltelijke bronuitval; - verouderde data; - refresh; - gelijktijdige
requests; - sortering op relevantie en recentheid; - filters; -
duplicaatdetectie; - tijdzoneconversie; - mobiel layoutgedrag.

## 16.3 Beveiligingstests

Test onder meer: - niet-geauthenticeerde toegang tot beschermde
API-routes; - ongeldige HTTP-methodes; - rate limits; - veilige
foutmeldingen; - secrets niet in frontendbuild of logs; - inputvalidatie
van externe data; - OAuth-regressies als auth-gerelateerde code wijzigt.

## 16.4 Testdata

-   Gebruik fixtures en gecontroleerde testresponses.
-   Tests mogen geen echte gebruikerswachtwoorden of sessiecookies nodig
    hebben.
-   Gebruik geen echte externe accountaanroepen zonder toestemming.
-   Tests moeten reproduceerbaar zijn en niet afhangen van de actuele
    beschikbaarheid van externe nieuwsfeeds.

------------------------------------------------------------------------

# 17. Deployment- en releaseprocedure

## 17.1 Voor publicatie

In Codespaces:

``` bash
git status
npm test
npm run build
git diff --check
```

Voer ook projectspecifieke syntax- en security checks uit. Gebruik
scripts die werkelijk in `package.json` bestaan; verzin geen scripts.

## 17.2 Commit en push

Na controle:

``` bash
git add -A
git commit -m "Describe the completed Northstar change"
git push origin main
```

Controleer vóór `git add -A` dat er geen `.env`, secrets, credentials,
tijdelijke bestanden of onbedoelde wijzigingen worden toegevoegd.

## 17.3 Render

-   Controleer in Render Events of de nieuwe commit wordt gedeployed.
-   Wacht op status `Live`.
-   Controleer `/healthz`.
-   Open de live URL.
-   Controleer logs op fouten zonder secrets bloot te leggen.

Live URL volgens de laatst bekende configuratie:
`https://northstar-dashboard-8tym.onrender.com`

## 17.4 Onderscheid tussen omgevingen

-   **Codespaces:** ontwikkelwerkruimte.
-   **GitHub:** centrale repository en versiegeschiedenis.
-   **Render:** gehoste productieomgeving.

Een wijziging in Codespaces is niet automatisch een GitHub-commit. Een
GitHub-push is niet automatisch bewijs van een geslaagde
Render-deployment. Controleer elke stap afzonderlijk.

------------------------------------------------------------------------

# 18. Openstaande verificatiepunten bij overdracht

Een nieuwe AI-agent of ontwikkelaar moet bij aanvang controleren:

1.  Is de working tree clean?
2.  Zijn alle Phase 1-, 2A-, 2A.1-, 2B- en 2C-wijzigingen gecommit en
    gepusht?
3.  Welke commit draait momenteel op Render?
4.  Is auto-deploy op `main` ingeschakeld?
5.  Welke exacte API-providers en feed-URL's staan in de actuele code?
6.  Welke environment variables zijn vereist en welke optioneel?
7.  Is de standaardweerlocatie Diest, of overschrijft Render die?
8.  Is agenda-ICS geconfigureerd?
9.  Zijn nieuwsbronaanpassingen (taalkeuze, RTBF, Sporza, Reuters,
    relevantiesortering en categorieën) volledig doorgevoerd?
10. Zijn de huidige tests groen?
11. Zijn er waarschuwingen of technische schulden in README of code?
12. Is er onbedoeld een Mobility & Home-pagina of gedeeltelijke
    integratie aanwezig?

Vraag of toon nooit secrets in chat of GitHub-issues. Controleer alleen
aanwezigheid en namen van configuratievariabelen, niet hun waarden.

------------------------------------------------------------------------

# 19. Aanbevolen ontwikkelvolgorde

De kern van Northstar 2.0 is het consolideren en betrouwbaar maken van
bestaande modules, niet het toevoegen van nieuwe infrastructuur.

## Stap 1 --- As-is audit

-   Repository, branch en commitstatus controleren.
-   Architectuur en configuratie documenteren.
-   Verschil tussen Codespaces, GitHub en Render vaststellen.
-   Tests en productiebuild uitvoeren.
-   Geen code wijzigen voordat de huidige toestand duidelijk is.

## Stap 2 --- Functionele consolidatie

-   Controleren of requirements uit dit document overeenkomen met de
    actuele implementatie.
-   Vooral nieuwsverfijningen verifiëren: Belgische taalkeuze, RTBF
    verwijderen, Sporza, relevantiesortering en categorie-indeling.
-   Afwijkingen oplijsten.

## Stap 3 --- Kwaliteit en consistentie

-   Refresh- en foutafhandeling consistent maken.
-   Bron- en actualiteitslabels uniform maken.
-   Responsive gedrag controleren.
-   Onnodige of lege modules vermijden.

## Stap 4 --- Daily Briefing en relevantie

-   Controleren of de briefing persoonlijke prioriteiten respecteert.
-   Dubbele berichtgeving beperken.
-   Geen geforceerde items of verzonnen samenvattingen.
-   Sport- en economische ontwikkelingen correct prioriteren.

## Stap 5 --- Release

-   Tests, build en security checks.
-   Documentatie bijwerken.
-   Commit en push naar GitHub.
-   Render-deployment controleren.

Dit is een aanbevolen volgorde, geen toestemming om automatisch alle
stappen uit te voeren. De gebruiker bepaalt de scope en geeft
toestemming voor volgende fases.

------------------------------------------------------------------------

# 20. Definition of Done --- Northstar 2.0

Northstar 2.0 is functioneel klaar wanneer:

-   Home een bruikbaar en betrouwbaar dagelijks overzicht geeft.
-   Daily Briefing een beknopte, relevante en niet-verzonnen selectie
    presenteert.
-   News Center filterbaar is en standaard op relevantie sorteert.
-   Belgische nieuwsitems voldoen aan afgesproken taal- en
    bronvoorkeuren.
-   Technologie & AI de relevante vroegere Data & Software-inhoud omvat.
-   Sports voldoende aandacht geeft aan Lakers, Toumani Camara, AJ
    Mitchell, Premier League en Belgisch voetbal.
-   De economische cockpit de afgesproken indicatoren toont met correcte
    bron, periode en beperkingen.
-   Agenda en weer correct functioneren wanneer geconfigureerd.
-   Refresh, caching, foutisolatie en stale-data-afhandeling consistent
    werken.
-   De interface goed bruikbaar is op iPhone, iPad en desktop.
-   Authenticatie en beveiligingsmaatregelen behouden blijven.
-   Geen onnodige betaalde diensten of infrastructuur zijn toegevoegd.
-   Geen niet-functionele Mobility & Home-pagina aanwezig is.
-   Tests en productiebuild slagen.
-   De actuele Render-deployment overeenkomt met de bedoelde
    GitHub-commit.
-   README en technische documentatie actueel zijn.

------------------------------------------------------------------------

# 21. Bekende onzekerheden en beperkingen

Dit document is samengesteld uit gesprekken en historische
implementatierapporten. De volgende gegevens moeten in de actuele
omgeving worden geverifieerd:

-   actuele commit en working tree;
-   of alle fasewijzigingen naar GitHub zijn gepusht;
-   of Render de meest recente commit draait;
-   exacte sportdataprovider;
-   exacte weerprovider;
-   actuele feedlijst en beschikbaarheid van RSS-bronnen;
-   definitieve status van Sporza- en Reuters-integratie;
-   actuele agenda-ICS-configuratie;
-   exacte environment variable-namen;
-   huidige frontendroutes, componenten en serverbestanden;
-   huidige testdekking en testresultaten.

Historische aantallen tests zijn geen vervanging voor een actuele
testuitvoering.

------------------------------------------------------------------------

# 22. Instructie voor de volgende AI-agent of ontwikkelaar

Gebruik dit document als functionele basis voor Northstar 2.0.

**Begin niet onmiddellijk met herschrijven.** Voer eerst een read-only
audit uit van: - de volledige GitHub-codebase; - de huidige branch en
commit; - configuratiebestanden; - package scripts; - bestaande tests; -
Render-deploymentconfiguratie voor zover veilig zichtbaar.

Maak daarna een overzicht van: 1. requirements die volledig gerealiseerd
zijn; 2. requirements die gedeeltelijk gerealiseerd zijn; 3. ontbrekende
requirements; 4. afwijkingen tussen specificatie en code; 5. technische
risico's; 6. voorstellen met impact op kosten, infrastructuur of
beveiliging.

Implementeer pas nadat de audit is afgerond en de scope is bevestigd.
Behoud bestaande werkende functionaliteit. Vraag vooraf toestemming voor
betaalde diensten, nieuwe infrastructuur, databasewijzigingen,
OAuth/securitywijzigingen en destructieve acties.

**Einddoel:** een betrouwbaar, persoonlijk en kostenbewust dashboard dat
relevante nieuws-, sport-, economische en praktische informatie op één
plek samenbrengt, met duidelijke bronvermelding, correcte actualiteit,
sterke foutafhandeling en een gebruiksvriendelijke interface op mobiel
en desktop.
