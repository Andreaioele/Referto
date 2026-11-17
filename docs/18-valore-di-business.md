---
tags: [area/progetto]
aggiornato: 2026-10-17
---

# Valore di business: studi medici e SSN

Torna a [[00-indice]] · Prodotto in [[01-panoramica]] · Limiti attuali in [[14-problemi-noti-e-prossimi-passi]].

Ricerca di mercato del 16/10/2026 sull'integrazione di Referto negli studi
medici e nel Servizio sanitario nazionale. I numeri vengono dalle fonti in
fondo; le stime fatte qui sono segnate come **ipotesi** e vanno verificate prima
di usarle in un pitch.

## In breve

- **Il problema è grande e misurato.** Il 58% degli italiani ha una health
  literacy limitata (HLS19: 23% inadeguata, 35% problematica, contro 13% e 32%
  nella media dei 17 paesi). Ogni prestazione va nel Fascicolo sanitario
  elettronico entro 5 giorni (DL 179/2012, art. 12, comma 1) e dal 31/03/2026
  l'obbligo vale per tutte le strutture, anche private: il referto arriva
  spesso **prima** che il medico lo spieghi.
- **L'infrastruttura c'è, manca l'uso.** Il PNRR ha messo 1,38 miliardi sul FSE,
  ma tra chi ha ricevuto un documento nuovo solo il 26,5% ha aperto il
  fascicolo nei 90 giorni (marzo-maggio 2026: dal 64,1% del Veneto all'1,2%
  della Basilicata, Sicilia 5,4%). Sul totale degli assistiti è circa il 14%.
  Referto dà al cittadino un motivo per aprirlo e capirlo.
- **Il medico di famiglia è il collo di bottiglia.** Mancano oltre 5.700 MMG,
  uno su due supera il massimale di 1.500 assistiti, le telefonate arrivano a
  centinaia a settimana. Ogni referto capito da solo è una chiamata in meno.
- **Il quadro normativo premia il nostro approccio.** La Legge 132/2025 e il
  Garante chiedono che la decisione resti al medico, trasparenza e verifica
  umana. Referto non diagnostica, cita le fonti e rimanda al medico: è già
  costruito così.
- **Il posto sul mercato è libero.** La piattaforma IA di AGENAS è per i
  professionisti, ReportAId lavora per le strutture (piani di cura, prenotazioni).
  Uno strumento **per il paziente**, verificabile e in italiano semplice, non
  c'è.

## Il problema in numeri

| Dato | Valore | Fonte |
|---|---|---|
| Health literacy limitata (inadeguata + problematica) | 58% (media 17 paesi: 45%) | HLS19, 2021 |
| Over 65 sulla popolazione | 25,1%; un terzo nel 2065 | ISTAT |
| 65-74enni con competenze digitali almeno di base | 27,4% (media 16-74: 54,3%) | ISTAT, Cittadini e ICT 2025 |
| Over 75 che hanno usato Internet negli ultimi 3 mesi | 35,7% | ISTAT via Avvenire |
| Stranieri residenti | 5,56 milioni (9,4%) | ISTAT, 1/1/2026 |
| Assistiti con un documento nuovo che hanno aperto il FSE nei 90 giorni | 26,5% (marzo-maggio 2026; 27% a settembre 2025). Non è la quota di tutti gli italiani: sul totale degli assistiti è circa il 14% | Monitoraggio ufficiale del FSE, indicatore IU1.3 |
| MMG e pediatri che alimentano il FSE | 95,2% | Ministero della Salute |
| MMG mancanti | oltre 5.700, in 18 regioni | GIMBE, marzo 2026 |
| Assistiti per MMG | 1.383 di media (ottimale 1.200); 51,7% oltre il massimale | GIMBE |
| Contatti con i pazienti | 35 diretti al giorno, 70 con gli indiretti | CERGAS Bocconi |
| Telefonate a un MMG (campione piccolo, periodo Covid) | 337 a settimana, più 194 messaggi e 106 email | SMI Lazio, 2020 |
| Ipertesi nuovi in terapia aderenti al trattamento | 52,4% (≥45 anni) | OsMed 2022 |
| Spesa sanitaria pagata di tasca propria | 41,3 miliardi (22,3% del totale) | GIMBE, 2024 |

Cosa dice la letteratura sugli effetti:

- **Leggere il referto da soli genera ansia.** Negli Stati Uniti, dopo il Cures
  Act, la maggior parte dei pazienti vede i risultati prima del medico; vuole
  continuare così (95,7%), ma la preoccupazione sale dal 5% al 16,5% quando il
  risultato è anomalo, e una parte dichiara di non averlo capito. In Italia il
  FSE 2.0 crea la stessa situazione.
- **La spiegazione con un LLM funziona, se controllata.** In uno studio
  prospettico su *Radiology* (2025, 200 pazienti oncologici) i referti TC
  semplificati scendono da un livello di lettura 13,7 a 8,9 e la comprensione
  migliora, ma il 6% contiene errori di fatto. In un RCT in preprint (2026) la
  comprensione migliora con un tasso di allucinazioni dell'1,7%. È il motivo per
  cui Referto lega ogni frase al referto o a una fonte ufficiale
  ([[03-pipeline-spiegazione]]).
- **La health literacy bassa costa.** La stima più citata la colloca tra il 3% e
  il 5% della spesa sanitaria totale (revisione del 2009, studi in gran parte
  non europei). Applicata ai 176 miliardi della spesa italiana del 2023
  sarebbero 5-9 miliardi l'anno: un ordine di grandezza, non un dato italiano.

## Il contesto di mercato

- **Spesa in sanità digitale:** 2,47 miliardi nel 2024, circa 2,7 nel 2025 (+9%),
  trainata dal PNRR (Osservatorio Sanità Digitale, Politecnico di Milano). Con
  la fine del PNRR (30/06/2026) restano FSE 2.0, telemedicina e cartelle
  cliniche da **mettere in uso**; il 33% delle strutture pubbliche teme tagli ai
  progetti. Un servizio che fa crescere l'uso del FSE con costi bassi parla
  proprio a questa preoccupazione.
- **FSE 2.0:** dal 31/03/2026 tutte le strutture pubbliche e private caricano i
  referti entro 5 giorni (termine del DL 179/2012, art. 12, esteso a tutti dal
  cronoprogramma del DM 30/12/2024); i MMG compilano il Patient Summary. Nessuna regione offre
  ancora tutti gli oltre 40 servizi previsti. Secondo fonti governative citate
  da Repubblica, solo il 10% delle strutture private era pronto agli obblighi.
- **AGENAS:** sta costruendo con il PNRR (sub-investimento 1.2.2.4) una
  piattaforma di IA per l'assistenza primaria, rivolta ai professionisti, con
  sperimentazione su almeno 1.500 MMG. La Legge 132/2025 ne fa la piattaforma
  nazionale. Referto è **complementare**: lavora dal lato del paziente.
- **Case della Comunità:** il PNRR ne prevedeva almeno 1.350 (poi ridotte a
  936-1.038) entro giugno 2026, con forti ritardi regionali. Sono punti di
  accesso dove un'interfaccia semplice per spiegare i referti, anche assistita
  da un operatore, ha senso.
- **Europa:** lo Spazio europeo dei dati sanitari (Regolamento UE 2025/327) dà a
  ogni cittadino accesso ai propri dati sanitari in tutta l'UE. Più accesso
  significa più documenti tecnici in mano a chi non sa leggerli.

### Concorrenti e alternative

| Chi | Cosa fa | Differenza con Referto |
|---|---|---|
| ChatGPT e simili, usati dal paziente | Il paziente incolla il referto | Nessuna fonte, nessun limite alla diagnosi, dati sanitari a un servizio generico |
| ReportAId (Milano, 2,2 M€ pre-seed, 2025) | Interpreta i referti per le strutture: piani di cura, prescrizioni, prenotazioni (San Raffaele, Gemelli Isola) | B2B e lato clinico; possibile partner più che rivale |
| Piattaforma AGENAS | Supporto alle decisioni dei professionisti | Per i medici, non per i pazienti |
| MioDottore (NOA Notes) | Note della visita con l'IA, per il medico | Documenta la visita, non spiega il referto |
| Was hab' ich? (Germania) | Medici che riscrivono referti e lettere di dimissione per i pazienti; *Befunddolmetscher* con oltre 10.000 termini | Modello di riferimento: dimostra in due RCT l'effetto delle lettere per il paziente, ma è lavoro umano e in tedesco |

**Il vantaggio di Referto:** verificabilità (citazioni dal referto, prontuario
AIFA, glossario HPO, strutture da dati aperti), il rifiuto per costruzione di
diagnosi e terapie, un'interfaccia pensata per una persona di 70 anni, l'italiano
come prima lingua.

## Dimensione del mercato (ipotesi)

Non esiste un dato nazionale pubblico sul numero di referti l'anno. Le stime
sotto partono da ipotesi esplicite; il primo dato da cercare è il monitoraggio
del FSE (documenti indicizzati per regione) di AGENAS o del Dipartimento per la
trasformazione digitale.

| Segmento | Unità | Ipotesi di prezzo | Ordine di grandezza annuo |
|---|---|---|---|
| Regioni, via FSE | 59 milioni di assistiti | 0,20-0,50 € per assistito l'anno | 12-30 M€ |
| Medici di famiglia e pediatri | circa 37.000 MMG (assistiti adulti ÷ 1.374) più i PLS | 15-30 € al mese per medico | 7-13 M€ |
| Laboratori, centri diagnostici, poliambulatori privati | da 3 a 5 referti per abitante l'anno (ipotesi): 180-300 milioni di referti, di cui una parte privata | 0,05-0,15 € per referto spiegato | 5-20 M€ sulla sola quota privata |

Per confronto, un solo gruppo privato (Affidea Italia, 58 centri) dichiara
1,1 milioni di esami di diagnostica per immagini e 6,1 milioni di esami di
laboratorio l'anno. Il costo da coprire è quello del modello per referto: va
misurato con le trace (token per spiegazione, [[09-trace-e-privacy]]) prima di
fissare i prezzi.

## I benefici

### Per il paziente e chi lo assiste

- **Capire subito, senza aspettare la visita:** il referto arriva nel FSE in 5
  giorni, il medico magari dopo settimane. Meno ansia nell'attesa, soprattutto
  con un risultato anomalo.
- **Arrivare preparato alla visita:** domande più precise, tempo della visita
  usato meglio (vedi la proposta "domande da portare alla visita" in
  [[14-problemi-noti-e-prossimi-passi]]).
- **Capire la terapia scritta dal medico:** il farmaco del referto con il
  foglietto ufficiale AIFA ([[08-referti-e-farmaci-aifa]]). Con un'aderenza del
  52% agli antipertensivi, capire cosa si prende e perché è il primo passo; la
  decisione resta del medico.
- **Sapere dove andare:** la branca e le strutture vicine
  ([[07-branca-e-strutture]]), senza consigli clinici.
- **Autonomia degli anziani e dei caregiver:** il figlio che segue i referti del
  genitore, l'anziano che legge da solo con testi grandi e poche informazioni
  alla volta ([[05-webapp-e-interfaccia]]).
- **Equità:** chi ha meno istruzione, meno competenze digitali o parla poco
  l'italiano è chi capisce meno il referto. Una spiegazione semplice riduce il
  "gradiente sociale" che HLS19 trova in tutti i paesi. Con 5,6 milioni di
  stranieri residenti, una spiegazione anche in altre lingue è un'estensione
  naturale.

### Per il medico di famiglia e lo specialista

- **Meno telefonate e messaggi di chiarimento.** Ipotesi di scala: se il 10%
  delle 337 chiamate settimanali riguarda un referto e ne richiede 3 minuti,
  sono circa 1,7 ore a settimana per medico, quasi 80 ore l'anno, circa 3
  milioni di ore su 37.000 MMG. Anche ridurle di un terzo libera un milione di
  ore di medicina generale l'anno. Il dato va misurato in un pilota.
- **Visite più efficaci:** il paziente arriva sapendo cosa c'è scritto; il
  medico spiega cosa significa per lui, non cosa vuol dire "ectasia".
- **Nessun rischio di "secondo parere" dell'IA:** Referto non interpreta oltre il
  testo, non suggerisce terapie, rimanda sempre al medico. Il medico resta
  l'autorità, come chiede la Legge 132/2025.
- **Valore per lo studio:** un servizio in più per gli assistiti, senza lavoro
  aggiuntivo e senza cambiare gestionale (widget nel portale dei referti,
  [[16-frontend]]).

### Per le strutture sanitarie (pubbliche e private)

- **Meno richieste allo sportello e al call center** sul significato dei referti.
- **Esperienza del paziente e differenziazione** per laboratori e centri
  diagnostici privati, in un mercato in cui le famiglie spendono 41 miliardi di
  tasca propria e scelgono anche sul servizio.
- **Adeguamento al FSE 2.0:** chi deve già caricare i referti in formato
  standard può aggiungere la spiegazione allo stesso flusso.

### Per il Servizio sanitario nazionale

- **Rendere utile l'investimento sul FSE:** 1,38 miliardi PNRR, ma solo un
  paziente su quattro apre il fascicolo quando riceve un documento nuovo. Il valore del fascicolo cresce con l'uso; spiegare i documenti è il
  servizio che fa tornare il cittadino.
- **Ridurre il divario tra regioni:** dove il FSE è poco usato (sotto il 6% in
  Basilicata, Marche e Sicilia) un servizio semplice e nazionale abbassa la barriera d'ingresso.
- **Sollievo alla medicina generale in carenza:** non sostituisce medici, toglie
  carico improprio a quelli che ci sono.
- **Appropriatezza:** meno accessi e visite solo per farsi leggere un referto,
  meno ricerche su fonti non affidabili. Se la health literacy bassa vale il
  3-5% della spesa, anche un effetto piccolo è grande in valore assoluto.
- **Aderenza e prevenzione:** capire una terapia o un controllo indicato dal
  medico aiuta a seguirlo; l'AIFA indica la scarsa aderenza come la principale
  causa di inefficacia dei farmaci.
- **Fiducia nell'IA pubblica:** un uso dell'IA trasparente, con fonti
  pubbliche (AIFA, HPO, OpenStreetMap) e senza decisioni automatiche, è il
  modello che chiedono il Garante (decalogo 2023) e la Legge 132/2025.

### Per l'ecosistema

- **Sovranità tecnologica e costi:** modelli aperti su hardware AMD (Token
  Factory, MI300X, [[11-modelli-e-ollama]]) invece di un fornitore unico.
- **Riuso di dati pubblici:** prontuario AIFA, ontologie, dati aperti delle
  strutture diventano servizi per i cittadini.
- **Esportabilità:** lo stesso problema esiste in tutta l'UE con l'EHDS; il
  metodo (fonti ufficiali per paese, glossario a strati) si porta in altre
  lingue.

## Come entrare: dallo studio al SSN

| Fase | Cliente | Integrazione | Cosa serve dimostrare |
|---|---|---|---|
| 1. Pilota | Uno o due studi di medicina generale o un poliambulatorio | Widget nel portale dei referti, link dal referto | Comprensione (prima e dopo), telefonate evitate, soddisfazione |
| 2. Privato | Laboratori e centri diagnostici, anche accreditati | Widget o API al ritiro del referto online | Costo per referto, riduzione delle richieste al call center |
| 3. Canali | Software house dei gestionali MMG (CompuGroup, Cegedim), integratori (Dedalus), sindacati e società scientifiche (FIMMG, SIMG) | Modulo nel gestionale o nel portale dello studio | Facilità d'integrazione, conformità |
| 4. Pubblico | Regioni e aziende sanitarie | Servizio nell'app del FSE regionale, nelle Case della Comunità | Studio di validazione, conformità per la PA, effetto sull'uso del FSE |

## Condizioni per l'adozione pubblica

Non sono benefici, ma senza queste una regione non firma.

- **Classificazione MDR:** la qualifica come dispositivo medico dipende dalla
  finalità dichiarata. Un software che informa senza guidare decisioni
  diagnostiche o terapeutiche può restare fuori dalla regola 11; serve una
  valutazione formale (MDCG 2019-11 rev. 1, giugno 2025) e una finalità d'uso
  scritta con cura. Se fosse dispositivo, con l'AI Act diventerebbe sistema ad
  alto rischio.
- **Dati sanitari:** DPIA, base giuridica (art. 9 GDPR), dati trattati nell'UE,
  contratti con i fornitori (oggi il testo passa da Evolus e Vercel,
  [[15-backend]]). La proposta "anonimizzazione prima del modello e modalità
  nessun dato salvato" ([[14-problemi-noti-e-prossimi-passi]]) diventa un
  requisito.
- **Legge 132/2025:** informazione al paziente sull'uso dell'IA, ruolo del
  medico, nessuna discriminazione nell'accesso.
- **Qualità clinica:** uno studio di validazione sul modello di quelli citati
  (tasso di errori, comprensione), revisione medica dello strato curato del
  glossario ([[specifica-terminologia]]).
- **PA:** servizi cloud qualificati ACN, accessibilità (linee guida AgID),
  interoperabilità con i documenti del FSE (CDA2, FHIR).

## Cosa misurare in un pilota

- Comprensione del referto prima e dopo (questionario breve), leggibilità
  Gulpease del testo originale e della spiegazione.
- Reperti spiegati sul totale ("12 su 14").
- Errori segnalati da medici e pazienti, per referto.
- Telefonate e messaggi di chiarimento allo studio, prima e durante.
- Tempo di risposta e costo del modello per referto.
- Uso ripetuto: quanti pazienti tornano con il referto successivo.

## Fonti

- Health literacy HLS19 in Italia: [Quotidiano Sanità](https://www.quotidianosanita.it/?p=112189)
- Uso del FSE (dato primario, verificato il 17/10/2026): [monitoraggio ufficiale del FSE](https://monitopen.fse.salute.gov.it/usage), [definizione degli indicatori](https://www.fascicolosanitario.gov.it/portale/numeri-del-fse), [Lentepubblica, settembre 2025](https://lentepubblica.it/pa-digitale/fascicolo-sanitario-elettronico-dal-31-marzo-obbligo-per-tutte-le-strutture-ma-ancora-ritardi-e-cittadini-poco-informati/)
- Termine dei 5 giorni: [DL 179/2012, testo consolidato (Regione Piemonte)](https://www.regione.piemonte.it/web/media/50364/download), [Open](https://www.open.online/2026/03/28/fascicolo-sanitario-elettronico-terza-fase-31-marzo-cosa-cambia/)
- Uso del FSE e obblighi dal 31/03/2026: [QuiFinanza](https://quifinanza.it/salute/fascicolo-sanitario-elettronico-31-marzo-2026-quanti-usano/964443/), [Agenda Digitale](https://www.agendadigitale.eu/?p=238319), [obiettivi PNRR del FSE (FBK)](https://magazine.fbk.eu/it/news/il-nuovo-fse2-0-il-fascicolo-sanitario-elettronico-nazionale/pdf/742f035443)
- PNRR e FSE (1,38 miliardi): [Corriere Comunicazioni](https://www.corrierecomunicazioni.it/pa-digitale/e-health/recovery-plan-sanita-digitale-driver-di-ripartenza-sul-piatto-185-miliardi/), [GIMBE](https://www.gimbe.org/download/PNRR_MdS.pdf)
- Spesa in sanità digitale: [Osservatorio Sanità Digitale 2025](https://www.dedalus.com/italy/wp-content/uploads/sites/10/2025/05/CS_Osservatorio-Sanita-Digitale-2025.pdf), [2026](https://www.dedalus.com/italy/wp-content/uploads/sites/10/2026/05/Cs_Osservatorio-Sanita-Digitale-2026.pdf), [Agenda Digitale](https://www.agendadigitale.eu/sanita/tecnologie-pronte-processi-al-palo-il-paradosso-della-sanita-digitale/)
- Carenza MMG: [GIMBE 2026](https://www.fimmg.org/it/20260317_CS_GIMBE_Carenza_Medici_di_Famiglia-pdf/), [GIMBE 2025](https://portale.fnomceo.it/wp-content/uploads/2025/03/CS_GIMBE_Carenza_Medici_di_Famiglia.docx-1.pdf)
- Carico di lavoro MMG: [Quotidiano Sanità](https://www.quotidianosanita.it/?p=143397), [Il Giornale](https://www.ilgiornale.it/news/condizioni-lavoro-ormai-insostenibili-dobbiamo-puntare-sul-2435033.html), [FIMMG](https://fimmg.org/it/Comunicati_Stampa/art/6086-medici-di-famiglia-a-sempre-in-servizioa-30-delle-prescrizioni-dematerializzate-compilato-tra-le-20-00-e-le-23-30/)
- ISTAT: [Cittadini e ICT 2025](https://www.istat.it/comunicato-stampa/cittadini-e-ict-anno-2025/), [Avvenire](https://www.avvenire.it/attualita/la-rivoluzione-digitale-ha-escluso-gli-anziani-oltre-uno-su-quattro-non-accede-alla-rete_112100), [Indicatori demografici 2025](https://www.istat.it/wp-content/uploads/2026/03/Report_Indicatori-demografici_Anno-2025.pdf)
- Spesa privata: [Assicurazione.it su dati ISTAT](https://www.assicurazione.it/news/cure-mediche-le-famiglie-nel-2023-hanno-speso-oltre-40-miliardi.html), [GIMBE](https://rss.gimbe.org/old/20251203_Soggetti_privati_in_sanit%c3%a0_lanalisi_di_Fondazione_Gimbe___Tecnicaospedalierait_WEB.pdf)
- Aderenza: [AIFA](https://www.aifa.gov.it/-/aderenza-alle-terapie-e-strategie-per-migliorare-l-uso-sicuro-ed-efficace-dei-farmaci), [infografica su OsMed 2022](https://alcuoredelladerenza.it/wp-content/uploads/2024/04/Infografica-Aderenza-Italia_v07.03.2024-1.pdf)
- Costo della health literacy bassa: [Eichler et al. 2009](https://link.springer.com/article/10.1007%2Fs00038-009-0058-2)
- Pazienti e risultati prima del medico: [HealthIT.gov](https://healthit.gov/blog/information-blocking/new-study-shows-patients-prefer-immediate-access-to-test-results-and-have-unmet-information-needs/), [Becker's](https://www.beckershospitalreview.com/patient-experience/nearly-7-in-10-patients-view-test-results-before-a-clinician-weighs-in-study/), [DH Insights](https://dhinsights.org/blog/test-results)
- LLM e referti semplificati: [Radiology 2025](https://pubs.rsna.org/doi/full/10.1148/radiol.251844), [RCT medRxiv 2026](https://www.medrxiv.org/content/10.64898/2026.02.23.26346923v1.full)
- AGENAS e Legge 132/2025: [Agenda Digitale](https://www.agendadigitale.eu/sanita/ai-act-e-legge-132-2025-cosa-cambia-per-lia-in-sanita-e-per-i-dati-clinici/), [Provincia di Trento](https://www.ufficiostampa.provincia.tn.it/content/view/pdf/292401), [OECD.AI](https://oecd.ai/en/dashboards/policy-initiatives/agenas-national-platform)
- Garante, decalogo IA in sanità: [FIMMG](https://fimmg.org/it/News/d/500/art/5480-sanita-ecco-il-decalogo-del-garante-privacy-sull-uso-dell-intelligenza-artificiale/)
- MDR e software: [MDCG 2019-11 spiegata](https://openregulatory.com/mdcg/mdcg-2019-11), [Emergo](https://www.emergobyul.com/news/european-revision-primary-software-guidance-mdcg-2019-11-revision-1-small-changes-meaningful)
- Case della Comunità: [Consiglio Marche](https://www.consiglio.marche.it/banche_dati_e_documentazione/atti_di_indirizzo_e_controllo/interrogazioni/pdf/inter935_11.pdf), [Consiglio Piemonte](https://www.cr.piemonte.it/interfo/legislatura/12/atto/1128/documento/1/scarica)
- EHDS: [Assolombarda](https://www.assolombarda.it/desk/life-sciences-desk-backup/informazioni/pubblicato-il-nuovo-regolamento-sullo-spazio-europeo-dei-dati-sanitari-ehds)
- Concorrenti: [ReportAId (Forbes)](https://forbes.it/2025/05/07/reportaid-raccoglie-22-milioni-di-euro-per-portare-lia-nella-sanita-italiana-ed-europea/), [Was hab' ich?](https://washabich.de/presse/faktenblatt), [MioDottore NOA Notes](https://www.quotidiano.net/news/datanalysis-2025-intelligenza-artificiale-yxk95bxl)
- Volumi di un gruppo privato: [Affidea](https://it.benzinga.com/?p=57460)
