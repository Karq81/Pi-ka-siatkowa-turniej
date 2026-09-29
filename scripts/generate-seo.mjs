// Writes the static, search-engine friendly pages into dist/ after `vite build`:
//   /turnieje/, /en/tournaments/, …           one page per language listing the disciplines
//   /turnieje/<sport>/, /en/tournaments/<sport>/, …   one page per discipline and language
//   /sitemap.xml                               all of the above, with hreflang alternates
// The app itself is a single-page app whose screens live behind "#"; search engines ignore
// what follows "#", so these plain HTML pages are what gets found in the search results.
// The disciplines, their rules and their translated names come straight from src/logic/sports.ts.
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'

const SITE = 'https://sportlivearena.com'
const DIST = 'dist'
const LANGS = ['pl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'uk', 'cs']
const LANG_NAMES = { pl: 'Polski', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', uk: 'Українська', cs: 'Čeština' }
/** The directory name of the disciplines list in each language ("/en/tournaments/"). */
const SEGMENT = { pl: 'turnieje', en: 'tournaments', de: 'turniere', fr: 'tournois', es: 'torneos', it: 'tornei', pt: 'torneios', uk: 'turniry', cs: 'turnaje' }

/** Path of a language's list of disciplines; Polish lives at the root, the others under /<lang>/. */
const hubPath = (lang) => (lang === 'pl' ? `/${SEGMENT.pl}/` : `/${lang}/${SEGMENT[lang]}/`)
const sportPath = (lang, id) => `${hubPath(lang)}${id}/`

/**
 * Texts of the static pages. Sport names are inserted as they are (nominative), so every
 * sentence is built to work without declining them. Only facts the app really has.
 */
const COPY = {
  pl: {
    hubTitle: 'Program do turniejów: {n} dyscyplin, wyniki na żywo | SportLiveArena',
    hubDesc: 'Zorganizuj turniej w jednej z {n} dyscyplin: grupy, drabinka, terminarz, wyniki na żywo dla kibiców i panel sędziego w telefonie. Za darmo.',
    hubH1: 'Zorganizuj turniej online – wybierz dyscyplinę',
    hubIntro: 'SportLiveArena ustawia turniej w kilka minut i pokazuje kibicom wyniki na żywo, tabele i terminarz w telefonie. Wybierz dyscyplinę, aby zobaczyć jej gotowe zasady.',
    title: '{sport} – turniej online, wyniki na żywo | SportLiveArena',
    desc: '{sport} – zorganizuj turniej online: gotowe zasady, grupy i drabinka, terminarz, wyniki na żywo dla kibiców i panel sędziego w telefonie. Za darmo.',
    h1: '{sport}: turniej online',
    intro: 'Załóż turniej z gotowymi zasadami dyscypliny. Kibice oglądają wyniki na żywo, tabele i terminarz w telefonie, a sędziowie wpisują wyniki z telefonu.',
    rulesH: 'Zasady i punktacja w szablonie',
    points: 'Punkty w tabeli: {w} za wygraną, {l} za porażkę.',
    pointsDraw: 'Punkty w tabeli: {w} za wygraną, {d} za remis, {l} za porażkę.',
    entrants: 'Uczestnicy: {e}.',
    formatsH: 'Formaty meczów do wyboru',
    whatH: 'Co dostajesz',
    features: [
      'Publiczna strona z wynikami na żywo, tabelami i terminarzem z wyszukiwarką drużyn',
      'Panel sędziego w telefonie do wpisywania wyników, z korektami przez sędziego głównego',
      'Grupy, drabinka i terminarz układane z listy drużyn (wklejka z Excela)',
      'Tryb TV na ekran w hali: boiska i tabele przełączają się same',
      'Eksport wyników do CSV i Excela',
      'Transmisja na żywo z wynikiem na obrazie',
    ],
    cta: 'Załóż turniej za darmo',
    otherH: 'Inne dyscypliny',
    all: 'Wszystkie dyscypliny',
    home: 'SportLiveArena – strona główna',
  },
  en: {
    hubTitle: 'Tournament software: {n} sports, live results | SportLiveArena',
    hubDesc: 'Organise a tournament in any of {n} sports: groups, brackets, schedule, live results for fans and a referee panel on the phone. Free.',
    hubH1: 'Run your tournament online – choose a sport',
    hubIntro: 'SportLiveArena sets up your tournament in minutes and shows fans live results, tables and the schedule on their phones. Pick a sport to see its ready-made rules.',
    title: '{sport} – online tournament, live results | SportLiveArena',
    desc: '{sport} – organise an online tournament: ready-made rules, groups and bracket, schedule, live results for fans and a referee panel on the phone. Free.',
    h1: '{sport}: online tournament',
    intro: 'Set up a tournament with the ready-made rules of the sport. Fans follow live results, tables and the schedule on their phones, and referees enter scores from a phone.',
    rulesH: 'Rules and scoring in the template',
    points: 'Table points: {w} for a win, {l} for a loss.',
    pointsDraw: 'Table points: {w} for a win, {d} for a draw, {l} for a loss.',
    entrants: 'Entrants: {e}.',
    formatsH: 'Match formats to choose from',
    whatH: 'What you get',
    features: [
      'A public page with live results, tables and the schedule, with team search',
      'A referee panel on the phone for entering results, with corrections by the head referee',
      'Groups, bracket and schedule built from your list of teams (paste from Excel)',
      'TV mode for the screen in the hall: courts and tables switch by themselves',
      'Export of results to CSV and Excel',
      'Live stream with the score on the picture',
    ],
    cta: 'Create a tournament for free',
    otherH: 'Other sports',
    all: 'All sports',
    home: 'SportLiveArena – home',
  },
  de: {
    hubTitle: 'Turniersoftware: {n} Sportarten, Live-Ergebnisse | SportLiveArena',
    hubDesc: 'Organisiere ein Turnier in {n} Sportarten: Gruppen, K.-o.-Baum, Spielplan, Live-Ergebnisse für Fans und Schiedsrichter-Panel am Handy. Kostenlos.',
    hubH1: 'Turnier online organisieren – Sportart wählen',
    hubIntro: 'SportLiveArena richtet dein Turnier in Minuten ein und zeigt Fans Live-Ergebnisse, Tabellen und den Spielplan auf dem Handy. Wähle eine Sportart und sieh dir die fertigen Regeln an.',
    title: '{sport} – Turnier online, Live-Ergebnisse | SportLiveArena',
    desc: '{sport} – Turnier online organisieren: fertige Regeln, Gruppen und K.-o.-Baum, Spielplan, Live-Ergebnisse für Fans und Schiedsrichter-Panel am Handy. Kostenlos.',
    h1: '{sport}: Turnier online',
    intro: 'Lege ein Turnier mit den fertigen Regeln der Sportart an. Fans verfolgen Live-Ergebnisse, Tabellen und den Spielplan auf dem Handy, Schiedsrichter tragen Ergebnisse vom Handy ein.',
    rulesH: 'Regeln und Punktevergabe in der Vorlage',
    points: 'Tabellenpunkte: {w} für einen Sieg, {l} für eine Niederlage.',
    pointsDraw: 'Tabellenpunkte: {w} für einen Sieg, {d} für ein Unentschieden, {l} für eine Niederlage.',
    entrants: 'Teilnehmer: {e}.',
    formatsH: 'Spielformate zur Auswahl',
    whatH: 'Das bekommst du',
    features: [
      'Öffentliche Seite mit Live-Ergebnissen, Tabellen und Spielplan samt Teamsuche',
      'Schiedsrichter-Panel am Handy zum Eintragen der Ergebnisse, mit Korrekturen durch die Turnierleitung',
      'Gruppen, K.-o.-Baum und Spielplan aus deiner Teamliste (Einfügen aus Excel)',
      'TV-Modus für den Bildschirm in der Halle: Felder und Tabellen wechseln automatisch',
      'Export der Ergebnisse als CSV und Excel',
      'Livestream mit dem Spielstand im Bild',
    ],
    cta: 'Turnier kostenlos anlegen',
    otherH: 'Weitere Sportarten',
    all: 'Alle Sportarten',
    home: 'SportLiveArena – Startseite',
  },
  fr: {
    hubTitle: 'Logiciel de tournoi : {n} sports, résultats en direct | SportLiveArena',
    hubDesc: "Organisez un tournoi dans {n} sports : poules, tableau à élimination, calendrier, résultats en direct pour les supporters et panneau d'arbitre sur téléphone. Gratuit.",
    hubH1: 'Organisez votre tournoi en ligne – choisissez un sport',
    hubIntro: "SportLiveArena prépare votre tournoi en quelques minutes et affiche résultats en direct, classements et calendrier aux supporters sur leur téléphone. Choisissez un sport pour voir ses règles prêtes à l'emploi.",
    title: '{sport} – tournoi en ligne, résultats en direct | SportLiveArena',
    desc: "{sport} – organisez un tournoi en ligne : règles prêtes à l'emploi, poules et tableau, calendrier, résultats en direct pour les supporters et panneau d'arbitre sur téléphone. Gratuit.",
    h1: '{sport} : tournoi en ligne',
    intro: "Créez un tournoi avec les règles prêtes à l'emploi du sport. Les supporters suivent résultats en direct, classements et calendrier sur leur téléphone, et les arbitres saisissent les scores depuis un téléphone.",
    rulesH: 'Règles et points dans le modèle',
    points: 'Points au classement : {w} pour une victoire, {l} pour une défaite.',
    pointsDraw: 'Points au classement : {w} pour une victoire, {d} pour un match nul, {l} pour une défaite.',
    entrants: 'Participants : {e}.',
    formatsH: 'Formats de match au choix',
    whatH: 'Ce que vous obtenez',
    features: [
      "Une page publique avec résultats en direct, classements et calendrier, avec recherche d'équipe",
      "Un panneau d'arbitre sur téléphone pour saisir les résultats, avec corrections par l'arbitre principal",
      "Poules, tableau et calendrier générés à partir de votre liste d'équipes (collage depuis Excel)",
      "Mode TV pour l'écran de la salle : terrains et classements défilent automatiquement",
      'Export des résultats en CSV et Excel',
      "Diffusion en direct avec le score à l'écran",
    ],
    cta: 'Créer un tournoi gratuitement',
    otherH: 'Autres sports',
    all: 'Tous les sports',
    home: 'SportLiveArena – accueil',
  },
  es: {
    hubTitle: 'Software de torneos: {n} deportes, resultados en directo | SportLiveArena',
    hubDesc: 'Organiza un torneo en {n} deportes: grupos, cuadro eliminatorio, calendario, resultados en directo para los aficionados y panel de árbitro en el móvil. Gratis.',
    hubH1: 'Organiza tu torneo online – elige un deporte',
    hubIntro: 'SportLiveArena prepara tu torneo en minutos y muestra a los aficionados resultados en directo, clasificaciones y calendario en el móvil. Elige un deporte para ver sus reglas ya preparadas.',
    title: '{sport} – torneo online, resultados en directo | SportLiveArena',
    desc: '{sport} – organiza un torneo online: reglas ya preparadas, grupos y cuadro, calendario, resultados en directo para los aficionados y panel de árbitro en el móvil. Gratis.',
    h1: '{sport}: torneo online',
    intro: 'Crea un torneo con las reglas ya preparadas del deporte. Los aficionados siguen resultados en directo, clasificaciones y calendario en el móvil, y los árbitros introducen los resultados desde el móvil.',
    rulesH: 'Reglas y puntuación en la plantilla',
    points: 'Puntos en la clasificación: {w} por victoria, {l} por derrota.',
    pointsDraw: 'Puntos en la clasificación: {w} por victoria, {d} por empate, {l} por derrota.',
    entrants: 'Participantes: {e}.',
    formatsH: 'Formatos de partido a elegir',
    whatH: 'Qué obtienes',
    features: [
      'Página pública con resultados en directo, clasificaciones y calendario, con buscador de equipos',
      'Panel de árbitro en el móvil para introducir resultados, con correcciones del árbitro principal',
      'Grupos, cuadro y calendario generados a partir de tu lista de equipos (pegado desde Excel)',
      'Modo TV para la pantalla del pabellón: pistas y clasificaciones cambian solas',
      'Exportación de resultados a CSV y Excel',
      'Retransmisión en directo con el marcador en la imagen',
    ],
    cta: 'Crear un torneo gratis',
    otherH: 'Otros deportes',
    all: 'Todos los deportes',
    home: 'SportLiveArena – inicio',
  },
  it: {
    hubTitle: 'Software per tornei: {n} sport, risultati in diretta | SportLiveArena',
    hubDesc: 'Organizza un torneo in {n} sport: gironi, tabellone a eliminazione, calendario, risultati in diretta per i tifosi e pannello arbitro sul telefono. Gratis.',
    hubH1: 'Organizza il tuo torneo online – scegli uno sport',
    hubIntro: 'SportLiveArena prepara il tuo torneo in pochi minuti e mostra ai tifosi risultati in diretta, classifiche e calendario sul telefono. Scegli uno sport per vedere le sue regole già pronte.',
    title: '{sport} – torneo online, risultati in diretta | SportLiveArena',
    desc: '{sport} – organizza un torneo online: regole già pronte, gironi e tabellone, calendario, risultati in diretta per i tifosi e pannello arbitro sul telefono. Gratis.',
    h1: '{sport}: torneo online',
    intro: 'Crea un torneo con le regole già pronte dello sport. I tifosi seguono risultati in diretta, classifiche e calendario sul telefono e gli arbitri inseriscono i punteggi dal telefono.',
    rulesH: 'Regole e punteggio nel modello',
    points: 'Punti in classifica: {w} per la vittoria, {l} per la sconfitta.',
    pointsDraw: 'Punti in classifica: {w} per la vittoria, {d} per il pareggio, {l} per la sconfitta.',
    entrants: 'Partecipanti: {e}.',
    formatsH: 'Formati di gara tra cui scegliere',
    whatH: 'Cosa ottieni',
    features: [
      'Pagina pubblica con risultati in diretta, classifiche e calendario, con ricerca delle squadre',
      "Pannello arbitro sul telefono per inserire i risultati, con correzioni dell'arbitro principale",
      "Gironi, tabellone e calendario generati dall'elenco delle squadre (incolla da Excel)",
      'Modalità TV per lo schermo del palazzetto: campi e classifiche cambiano da soli',
      'Esportazione dei risultati in CSV ed Excel',
      "Diretta streaming con il punteggio sull'immagine",
    ],
    cta: 'Crea un torneo gratis',
    otherH: 'Altri sport',
    all: 'Tutti gli sport',
    home: 'SportLiveArena – home',
  },
  pt: {
    hubTitle: 'Software de torneios: {n} desportos, resultados ao vivo | SportLiveArena',
    hubDesc: 'Organize um torneio em {n} desportos: grupos, quadro de eliminatórias, calendário, resultados ao vivo para os adeptos e painel de árbitro no telemóvel. Grátis.',
    hubH1: 'Organize o seu torneio online – escolha um desporto',
    hubIntro: 'O SportLiveArena prepara o seu torneio em minutos e mostra aos adeptos resultados ao vivo, classificações e calendário no telemóvel. Escolha um desporto para ver as regras já prontas.',
    title: '{sport} – torneio online, resultados ao vivo | SportLiveArena',
    desc: '{sport} – organize um torneio online: regras já prontas, grupos e quadro, calendário, resultados ao vivo para os adeptos e painel de árbitro no telemóvel. Grátis.',
    h1: '{sport}: torneio online',
    intro: 'Crie um torneio com as regras já prontas do desporto. Os adeptos acompanham resultados ao vivo, classificações e calendário no telemóvel, e os árbitros registam os resultados a partir do telemóvel.',
    rulesH: 'Regras e pontuação no modelo',
    points: 'Pontos na classificação: {w} por vitória, {l} por derrota.',
    pointsDraw: 'Pontos na classificação: {w} por vitória, {d} por empate, {l} por derrota.',
    entrants: 'Participantes: {e}.',
    formatsH: 'Formatos de jogo à escolha',
    whatH: 'O que obtém',
    features: [
      'Página pública com resultados ao vivo, classificações e calendário, com pesquisa de equipas',
      'Painel de árbitro no telemóvel para registar resultados, com correções do árbitro principal',
      'Grupos, quadro e calendário gerados a partir da sua lista de equipas (colar do Excel)',
      'Modo TV para o ecrã do pavilhão: campos e classificações mudam sozinhos',
      'Exportação dos resultados para CSV e Excel',
      'Transmissão em direto com o resultado na imagem',
    ],
    cta: 'Criar um torneio grátis',
    otherH: 'Outros desportos',
    all: 'Todos os desportos',
    home: 'SportLiveArena – início',
  },
  uk: {
    hubTitle: 'Програма для турнірів: {n} видів спорту, результати наживо | SportLiveArena',
    hubDesc: 'Організуйте турнір у {n} видах спорту: групи, сітка на вибування, розклад, результати наживо для вболівальників і панель судді в телефоні. Безкоштовно.',
    hubH1: 'Проведіть турнір онлайн – оберіть вид спорту',
    hubIntro: 'SportLiveArena налаштовує турнір за кілька хвилин і показує вболівальникам результати наживо, таблиці та розклад у телефоні. Оберіть вид спорту, щоб побачити готові правила.',
    title: '{sport} – турнір онлайн, результати наживо | SportLiveArena',
    desc: '{sport} – організуйте турнір онлайн: готові правила, групи та сітка, розклад, результати наживо для вболівальників і панель судді в телефоні. Безкоштовно.',
    h1: '{sport}: турнір онлайн',
    intro: 'Створіть турнір із готовими правилами виду спорту. Вболівальники стежать за результатами наживо, таблицями та розкладом у телефоні, а судді вводять рахунок із телефону.',
    rulesH: 'Правила та нарахування очок у шаблоні',
    points: 'Очки в таблиці: {w} за перемогу, {l} за поразку.',
    pointsDraw: 'Очки в таблиці: {w} за перемогу, {d} за нічию, {l} за поразку.',
    entrants: 'Учасники: {e}.',
    formatsH: 'Формати матчів на вибір',
    whatH: 'Що ви отримуєте',
    features: [
      'Публічна сторінка з результатами наживо, таблицями та розкладом, з пошуком команди',
      'Панель судді в телефоні для введення результатів, з виправленнями від головного судді',
      'Групи, сітка та розклад зі списку ваших команд (вставка з Excel)',
      'Режим ТВ для екрана в залі: майданчики й таблиці перемикаються самі',
      'Експорт результатів у CSV та Excel',
      'Трансляція наживо з рахунком на картинці',
    ],
    cta: 'Створити турнір безкоштовно',
    otherH: 'Інші види спорту',
    all: 'Усі види спорту',
    home: 'SportLiveArena – головна',
  },
  cs: {
    hubTitle: 'Software pro turnaje: {n} sportů, živé výsledky | SportLiveArena',
    hubDesc: 'Uspořádejte turnaj v {n} sportech: skupiny, pavouk, rozpis zápasů, živé výsledky pro fanoušky a panel rozhodčího v telefonu. Zdarma.',
    hubH1: 'Uspořádejte turnaj online – vyberte sport',
    hubIntro: 'SportLiveArena připraví váš turnaj během několika minut a ukáže fanouškům živé výsledky, tabulky a rozpis zápasů v telefonu. Vyberte sport a podívejte se na hotová pravidla.',
    title: '{sport} – turnaj online, živé výsledky | SportLiveArena',
    desc: '{sport} – uspořádejte turnaj online: hotová pravidla, skupiny a pavouk, rozpis zápasů, živé výsledky pro fanoušky a panel rozhodčího v telefonu. Zdarma.',
    h1: '{sport}: turnaj online',
    intro: 'Založte turnaj s hotovými pravidly sportu. Fanoušci sledují živé výsledky, tabulky a rozpis v telefonu a rozhodčí zadávají skóre z telefonu.',
    rulesH: 'Pravidla a bodování v šabloně',
    points: 'Body v tabulce: {w} za výhru, {l} za prohru.',
    pointsDraw: 'Body v tabulce: {w} za výhru, {d} za remízu, {l} za prohru.',
    entrants: 'Účastníci: {e}.',
    formatsH: 'Formáty zápasů k výběru',
    whatH: 'Co získáte',
    features: [
      'Veřejná stránka s živými výsledky, tabulkami a rozpisem, s hledáním týmů',
      'Panel rozhodčího v telefonu pro zadávání výsledků, s opravami od hlavního rozhodčího',
      'Skupiny, pavouk a rozpis vytvořené ze seznamu týmů (vložení z Excelu)',
      'TV režim pro obrazovku v hale: hřiště a tabulky se přepínají samy',
      'Export výsledků do CSV a Excelu',
      'Živé vysílání se skóre v obraze',
    ],
    cta: 'Založit turnaj zdarma',
    otherH: 'Další sporty',
    all: 'Všechny sporty',
    home: 'SportLiveArena – úvod',
  },
}

/** Search results cut titles at about 60–70 characters: long ones lose the brand suffix. */
const fitTitle = (title) => (title.length > 70 ? title.replace(/ \| SportLiveArena$/, '') : title)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all))

const CSS = `
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0e1b2c;background:#eef2f7}
a{color:#1c4fd6}header,main,footer{max-width:820px;margin:0 auto;padding:0 16px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding-top:14px;padding-bottom:14px}
.brand{font-weight:800;font-size:20px;text-decoration:none;color:#0e1b2c}
.langs{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:14px}.langs b{font-weight:700}
main{background:#fff;border:1px solid #d5dde8;border-radius:10px;padding:24px 20px 28px;margin-bottom:20px}
h1{font-size:30px;line-height:1.2;margin:0 0 12px}h2{font-size:20px;margin:26px 0 8px}
ul{padding-left:20px;margin:8px 0}li{margin:4px 0}.cta{display:inline-block;margin:18px 0 4px;padding:12px 22px;background:#1c4fd6;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.chips a{display:inline-block;padding:6px 12px;border:1px solid #d5dde8;border-radius:999px;text-decoration:none;font-size:15px}
.crumb{font-size:14px;margin:0 0 12px}footer{font-size:14px;padding-bottom:28px;color:#5a6b82}
@media(prefers-color-scheme:dark){body{background:#0a111c;color:#f3f6fb}main{background:#111c2c;border-color:#24344c}a{color:#8db0ff}.brand{color:#f3f6fb}.chips a{border-color:#24344c}footer{color:#9fb0c8}}
`.replace(/\n/g, '')

/** Loads the disciplines translated into `lang` (each language needs fresh modules: texts are translated on load). */
async function loadSports(server, lang) {
  server.moduleGraph.invalidateAll()
  const i18n = await server.ssrLoadModule('/src/i18n.ts')
  await i18n.initLang(lang)
  const mod = await server.ssrLoadModule('/src/logic/sports.ts')
  if (i18n.currentLang() !== lang) throw new Error(`language ${lang} did not load`)
  return { t: i18n.t, sports: mod.SPORTS.filter((s) => !s.custom) }
}

function alternates(pathFor) {
  const links = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${pathFor(l)}">`)
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${pathFor('en')}">`)
  return links.join('\n')
}

function shell({ lang, title, desc, path, pathFor, body, jsonld }) {
  const langBar = LANGS.map((l) => (l === lang ? `<b>${LANG_NAMES[l]}</b>` : `<a href="${pathFor(l)}" hreflang="${l}" lang="${l}">${LANG_NAMES[l]}</a>`)).join('\n')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
${alternates(pathFor)}
<meta property="og:type" content="website">
<meta property="og:site_name" content="SportLiveArena">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1c4fd6">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>${CSS}</style>
</head>
<body>
<header><a class="brand" href="/?lang=${lang}">SportLiveArena</a><nav class="langs" aria-label="Language">${langBar}</nav></header>
<main>
${body}
</main>
<footer><a href="/?lang=${lang}">${esc(COPY[lang].home)}</a> · <a href="${hubPath(lang)}">${esc(COPY[lang].all)}</a></footer>
</body>
</html>
`
}

const breadcrumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
})

const cta = (lang) => `<p><a class="cta" href="/?lang=${lang}#rejestracja">${esc(COPY[lang].cta)}</a></p>`

function hubPage(lang, { t, sports }) {
  const c = COPY[lang]
  const groups = []
  for (const s of sports) {
    let g = groups.find((x) => x.name === s.group)
    if (!g) groups.push((g = { name: s.group, items: [] }))
    g.items.push(s)
  }
  const list = groups
    .map((g) => `<h2>${esc(t(g.name))}</h2>\n<ul class="chips">${g.items.map((s) => `<li><a href="${sportPath(lang, s.id)}">${esc(t(s.label))}</a></li>`).join('')}</ul>`)
    .join('\n')
  const body = `<h1>${esc(c.hubH1)}</h1>\n<p>${esc(c.hubIntro)}</p>\n${cta(lang)}\n${list}`
  return shell({
    lang, path: hubPath(lang), pathFor: hubPath,
    title: fitTitle(fill(c.hubTitle, { n: sports.length })), desc: fill(c.hubDesc, { n: sports.length }), body,
    jsonld: breadcrumbs([['SportLiveArena', '/'], [c.all, hubPath(lang)]]),
  })
}

function sportPage(lang, sport, { t, sports }) {
  const c = COPY[lang]
  const name = t(sport.label)
  const measured = sport.formats.every((f) => f.rules.scoring === 'measured')
  const draws = sport.formats.some((f) => f.rules.draws) || sport.table[1] > 0
  const [w, d, l] = sport.table
  const rules = [
    `<p>${esc(sport.note)}</p>`,
    measured ? '' : `<p>${esc(fill(draws ? c.pointsDraw : c.points, { w, d, l }))}</p>`,
    `<p>${esc(fill(c.entrants, { e: t(sport.entrants) }))}</p>`,
  ].join('\n')
  const formats = sport.formats.length > 1
    ? `<h2>${esc(c.formatsH)}</h2>\n<ul>${sport.formats.map((f) => `<li>${esc(f.label)}</li>`).join('')}</ul>`
    : ''
  const others = sports.filter((s) => s.id !== sport.id)
  const body = [
    `<p class="crumb"><a href="${hubPath(lang)}">${esc(c.all)}</a> › ${esc(name)}</p>`,
    `<h1>${esc(fill(c.h1, { sport: name }))}</h1>`,
    `<p>${esc(c.intro)}</p>`,
    cta(lang),
    `<h2>${esc(c.rulesH)}</h2>\n${rules}`,
    formats,
    `<h2>${esc(c.whatH)}</h2>\n<ul>${c.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`,
    cta(lang),
    `<h2>${esc(c.otherH)}</h2>\n<ul class="chips">${others.map((s) => `<li><a href="${sportPath(lang, s.id)}">${esc(t(s.label))}</a></li>`).join('')}</ul>`,
  ].filter(Boolean).join('\n')
  return shell({
    lang, path: sportPath(lang, sport.id), pathFor: (l) => sportPath(l, sport.id),
    title: fitTitle(fill(c.title, { sport: name })), desc: fill(c.desc, { sport: name }), body,
    jsonld: breadcrumbs([['SportLiveArena', '/'], [c.all, hubPath(lang)], [name, sportPath(lang, sport.id)]]),
  })
}

async function write(path, html) {
  const file = join(DIST, path, 'index.html')
  await mkdir(join(DIST, path), { recursive: true })
  await writeFile(file, html)
}

function sitemap(ids) {
  const day = new Date().toISOString().slice(0, 10)
  const entry = (pathFor) => LANGS
    .map((l) => `<url><loc>${SITE}${pathFor(l)}</loc><lastmod>${day}</lastmod>\n${[...LANGS.map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${SITE}${pathFor(a)}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pathFor('en')}"/>`].join('\n')}\n</url>`)
    .join('\n')
  const urls = [`<url><loc>${SITE}/</loc><lastmod>${day}</lastmod></url>`, entry(hubPath), ...ids.map((id) => entry((l) => sportPath(l, id)))]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}

async function main() {
  await access(DIST).catch(() => { throw new Error('dist/ not found: run `vite build` first') })
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    let ids = null
    let pages = 0
    for (const lang of LANGS) {
      const data = await loadSports(server, lang)
      const own = data.sports.map((s) => s.id)
      if (ids && own.join() !== ids.join()) throw new Error(`disciplines differ in ${lang}`)
      ids = own
      await write(hubPath(lang), hubPage(lang, data))
      pages++
      for (const sport of data.sports) {
        await write(sportPath(lang, sport.id), sportPage(lang, sport, data))
        pages++
      }
    }
    await writeFile(join(DIST, 'sitemap.xml'), sitemap(ids))
    console.log(`SEO: ${pages} pages in ${LANGS.length} languages, sitemap.xml with ${1 + LANGS.length * (1 + ids.length)} addresses`)
  } finally {
    await server.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
