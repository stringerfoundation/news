// response.ts
var MAX_RESPONSE_BYTES = 5e6;
async function readResponseText(response, limit = MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  const chunks = [];
  let received = 0;
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw new Error("Source response too large");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw new Error("Source response too large");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// locales/fr.ts
var french = {
  "Headlines from publishers in this language.": "Titres de m\xE9dias francophones.",
  "Close menu": "Fermer le menu",
  "Open menu": "Ouvrir le menu",
  "Sources": "Sources",
  "Choose news sources": "Choisir les sources d\u2019actualit\xE9s",
  "Enable all": "Tout activer",
  "Your choices are saved in this browser.": "Vos choix sont enregistr\xE9s dans ce navigateur.",
  "{enabled} of {total} enabled": "{enabled} sur {total} activ\xE9es",
  "Search sources": "Rechercher des sources",
  "No sources selected.": "Aucune source s\xE9lectionn\xE9e.",
  "No matching sources.": "Aucune source correspondante.",
  "May require subscription": "Abonnement \xE9ventuellement requis",
  "{count} articles": "{count} articles",
  "View {count} articles": "Voir {count} articles",
  "Show fewer headlines": "Afficher moins de titres",
  "More headlines ({count})": "Plus de titres ({count})",
  "Show more headlines": "Afficher plus de titres",
  "Show more courageous stories": "Afficher plus de reportages courageux",
  "Show fewer courageous stories": "Afficher moins de reportages courageux",
  "View source for this build": "Voir la source de cette version",
  "Global headlines are currently unavailable.": "Les titres internationaux sont momentan\xE9ment indisponibles.",
  "No headlines available in this collection.": "Aucun titre disponible dans cette s\xE9lection.",
  "Loading headlines\u2026": "Chargement des titres\u2026",
  "Loading news\u2026": "Chargement des actualit\xE9s\u2026",
  "Loading courageous stories\u2026": "Chargement des reportages courageux\u2026",
  "Loading the latest published collection\u2026": "Chargement de la derni\xE8re s\xE9lection publi\xE9e\u2026",
  "Headlines unavailable.": "Titres indisponibles.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "Les reportages courageux sont indisponibles. Vous pouvez toujours consulter la s\xE9lection de Stringer ci-dessous.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "Les reportages courageux sont momentan\xE9ment indisponibles. Consultez la s\xE9lection de Stringer ci-dessous.",
  "Could not check for updates. Keeping the previously loaded collection.": "Impossible de v\xE9rifier les mises \xE0 jour. La s\xE9lection d\xE9j\xE0 charg\xE9e est conserv\xE9e.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "La s\xE9lection d\u2019actualit\xE9s est indisponible. Une nouvelle tentative sera effectu\xE9e automatiquement.",
  "Local time ({zone})": "Heure locale ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "Date de publication ; la source ne pr\xE9cise ni l\u2019heure ni le fuseau horaire",
  "Publication date unavailable": "Date de publication indisponible",
  "Date unavailable": "Date indisponible",
  "{source}: refresh unavailable.{retained}": "{source} : actualisation indisponible.{retained}",
  " Showing previously collected stories.": " Affichage des articles recueillis pr\xE9c\xE9demment.",
  " No stories available.": " Aucun article disponible.",
  "{count} unavailable": "{count} indisponibles",
  "{count} queued": "{count} en attente",
  "Read {title} at the original source": "Lire {title} sur la source d\u2019origine",
  "Atomstr mirror timestamp ({zone})": "Horodatage du miroir Atomstr ({zone})",
  "via {network} / Atomstr": "via {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Miroirs Atomstr ; il ne s\u2019agit pas de comptes Nostr officiels des \xE9diteurs.",
  "Feed status": "\xC9tat des flux",
  "Unavailable sources ({count})": "Sources indisponibles ({count})",
  "Language": "Langue",
  "Skip to news": "Aller aux actualit\xE9s",
  "The Stringer Foundation home": "Accueil de The Stringer Foundation",
  "Main navigation": "Navigation principale",
  "Donate": "Faire un don",
  "Donate now": "Faire un don maintenant",
  "Home": "Accueil",
  "Mission": "Mission",
  "Who we are": "Qui sommes-nous ?",
  "Awards": "R\xE9compenses",
  "Contact us": "Nous contacter",
  "World news": "Actualit\xE9s internationales",
  "Stringer social media": "R\xE9seaux sociaux de Stringer",
  "Stringer on Nostr via Primal": "Stringer sur Nostr via Primal",
  "Stringer on Instagram": "Stringer sur Instagram",
  "Stringer on Facebook": "Stringer sur Facebook",
  "Stringer on LinkedIn": "Stringer sur LinkedIn",
  "Stringer on YouTube": "Stringer sur YouTube",
  "Stringer World News": "Actualit\xE9s mondiales de Stringer",
  "Around the world": "\xC0 travers le monde",
  "Global Newswire": "Actualit\xE9s en fran\xE7ais",
  "Courageous Stories": "Reportages courageux",
  "Headlines from global publishers.": "Titres de m\xE9dias francophones.",
  "Beyond the headlines": "Au-del\xE0 des titres",
  "Stringer's Courageous Stories": "Les reportages courageux de Stringer",
  "Reporting selected by The Stringer Foundation.": "Reportages s\xE9lectionn\xE9s par The Stringer Foundation.",
  "Explore the Stringer collection": "Explorer la s\xE9lection de Stringer",
  "Enable JavaScript to load the news collection, or": "Activez JavaScript pour charger la s\xE9lection d\u2019actualit\xE9s, ou",
  "read Courageous Stories on Stringer\u2019s website": "lisez les reportages courageux sur le site de Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "The Stringer Foundation (EIN : 33-4278131) est une organisation \xE0 but non lucratif de type 501(c)(3).",
  "Support courageous journalism": "Soutenez le journalisme courageux",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "Contribuez au d\xE9veloppement du journalisme courageux et \xE0 la formation de la prochaine g\xE9n\xE9ration de reporters audacieux.",
  "Footer navigation": "Navigation de pied de page",
  "Explore Stringer": "D\xE9couvrir Stringer",
  "Our mission": "Notre mission",
  "Stringer Awards": "Prix Stringer",
  "Courageous stories": "Reportages courageux",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "Les articles appartiennent \xE0 leurs \xE9diteurs d\u2019origine. Suivez chaque titre pour lire ou regarder le reportage original.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "Les images d\u2019aper\xE7u, y compris les cartes des r\xE9seaux sociaux, appartiennent \xE0 leurs ayants droit. Leur affichage n\u2019implique ni approbation ni droit de r\xE9utilisation. Droits ou retrait :",
  "English": "Fran\xE7ais",
  "Global headlines": "Titres internationaux",
  "Build": "Version",
  "Global publisher headlines and Stringer reporting in their original languages.": "Les titres des m\xE9dias internationaux et les reportages de Stringer dans leurs langues d\u2019origine.",
  "Stringer on X": "Stringer sur X",
  "Loading \xB7 {seconds} s elapsed": "Chargement \xB7 {seconds} s \xE9coul\xE9es",
  "{outcome} in {seconds} s": "{outcome} en {seconds} s",
  "{stage} Total elapsed: {seconds} s.": "{stage} Temps total \xE9coul\xE9 : {seconds} s.",
  "Latest feed load: {timing}.": "Dernier chargement des flux : {timing}.",
  "Story retrieval from news relays:": "R\xE9cup\xE9ration des articles depuis les relais d\u2019actualit\xE9s :",
  "no published stories": "aucun article publi\xE9",
  "loaded in {seconds} s": "charg\xE9 en {seconds} s",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "chargement \xB7 {seconds} s \xE9coul\xE9es \xB7 {received}/{total} articles",
  "{received}/{total} stories received after {seconds} s": "{received}/{total} articles re\xE7us apr\xE8s {seconds} s",
  "Feed status \xB7 {timing}": "\xC9tat des flux \xB7 {timing}",
  "Loaded": "Charg\xE9",
  "Failed": "\xC9chec",
  "Partial": "Partiel",
  "Checking for updates\u2026": "V\xE9rification des mises \xE0 jour\u2026",
  "Connecting to news relays\u2026": "Connexion aux relais d\u2019actualit\xE9s\u2026",
  "Verified collection. Loading published stories\u2026": "S\xE9lection v\xE9rifi\xE9e. Chargement des articles publi\xE9s\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "{received} notes publi\xE9es re\xE7ues. Nouvelle tentative pour r\xE9cup\xE9rer les {missing} notes manquantes\u2026"
};
var fr_default = french;

// locales/es.ts
var spanish = {
  "Headlines from publishers in this language.": "Titulares de medios en espa\xF1ol.",
  "Close menu": "Cerrar men\xFA",
  "Open menu": "Abrir men\xFA",
  "Sources": "Fuentes",
  "Choose news sources": "Elegir fuentes de noticias",
  "Enable all": "Activar todas",
  "Your choices are saved in this browser.": "Tus opciones se guardan en este navegador.",
  "{enabled} of {total} enabled": "{enabled} de {total} activadas",
  "Search sources": "Buscar fuentes",
  "No sources selected.": "No hay fuentes seleccionadas.",
  "No matching sources.": "No hay fuentes que coincidan.",
  "May require subscription": "Puede requerir una suscripci\xF3n",
  "{count} articles": "{count} art\xEDculos",
  "View {count} articles": "Ver {count} art\xEDculos",
  "Show fewer headlines": "Mostrar menos titulares",
  "More headlines ({count})": "M\xE1s titulares ({count})",
  "Show more headlines": "Mostrar m\xE1s titulares",
  "Show more courageous stories": "Mostrar m\xE1s reportajes valientes",
  "Show fewer courageous stories": "Mostrar menos reportajes valientes",
  "View source for this build": "Ver el c\xF3digo fuente de esta versi\xF3n",
  "Global headlines are currently unavailable.": "Los titulares internacionales no est\xE1n disponibles en este momento.",
  "No headlines available in this collection.": "No hay titulares disponibles en esta colecci\xF3n.",
  "Loading headlines\u2026": "Cargando titulares\u2026",
  "Loading news\u2026": "Cargando noticias\u2026",
  "Loading courageous stories\u2026": "Cargando reportajes valientes\u2026",
  "Loading the latest published collection\u2026": "Cargando la colecci\xF3n publicada m\xE1s reciente\u2026",
  "Headlines unavailable.": "Titulares no disponibles.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "Los reportajes valientes no est\xE1n disponibles. A\xFAn puedes visitar la colecci\xF3n de Stringer que aparece abajo.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "Los reportajes valientes no est\xE1n disponibles en este momento. Visita la colecci\xF3n de Stringer que aparece abajo.",
  "Could not check for updates. Keeping the previously loaded collection.": "No se pudieron comprobar las actualizaciones. Se conserva la colecci\xF3n cargada anteriormente.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "La colecci\xF3n de noticias no est\xE1 disponible. Lo volveremos a intentar autom\xE1ticamente.",
  "Local time ({zone})": "Hora local ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "Fecha de publicaci\xF3n; la fuente no confirma la hora ni la zona horaria",
  "Publication date unavailable": "Fecha de publicaci\xF3n no disponible",
  "Date unavailable": "Fecha no disponible",
  "{source}: refresh unavailable.{retained}": "{source}: actualizaci\xF3n no disponible.{retained}",
  " Showing previously collected stories.": " Se muestran art\xEDculos recopilados anteriormente.",
  " No stories available.": " No hay art\xEDculos disponibles.",
  "{count} unavailable": "{count} no disponibles",
  "{count} queued": "{count} en cola",
  "Read {title} at the original source": "Leer {title} en la fuente original",
  "Atomstr mirror timestamp ({zone})": "Fecha y hora del espejo de Atomstr ({zone})",
  "via {network} / Atomstr": "v\xEDa {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Espejos de Atomstr; no son cuentas oficiales de Nostr de los editores.",
  "Feed status": "Estado de los canales",
  "Unavailable sources ({count})": "Fuentes no disponibles ({count})",
  "Language": "Idioma",
  "Skip to news": "Ir a las noticias",
  "The Stringer Foundation home": "P\xE1gina de inicio de The Stringer Foundation",
  "Main navigation": "Navegaci\xF3n principal",
  "Donate": "Donar",
  "Donate now": "Donar ahora",
  "Home": "Inicio",
  "Mission": "Misi\xF3n",
  "Who we are": "Qui\xE9nes somos",
  "Awards": "Premios",
  "Contact us": "Contactar",
  "World news": "Noticias del mundo",
  "Stringer social media": "Redes sociales de Stringer",
  "Stringer on Nostr via Primal": "Stringer en Nostr a trav\xE9s de Primal",
  "Stringer on Instagram": "Stringer en Instagram",
  "Stringer on Facebook": "Stringer en Facebook",
  "Stringer on LinkedIn": "Stringer en LinkedIn",
  "Stringer on YouTube": "Stringer en YouTube",
  "Stringer World News": "Noticias mundiales de Stringer",
  "Around the world": "Por todo el mundo",
  "Global Newswire": "Noticias en espa\xF1ol",
  "Courageous Stories": "Reportajes valientes",
  "Headlines from global publishers.": "Titulares de medios en espa\xF1ol.",
  "Beyond the headlines": "M\xE1s all\xE1 de los titulares",
  "Stringer's Courageous Stories": "Los reportajes valientes de Stringer",
  "Reporting selected by The Stringer Foundation.": "Reportajes seleccionados por The Stringer Foundation.",
  "Explore the Stringer collection": "Explorar la colecci\xF3n de Stringer",
  "Enable JavaScript to load the news collection, or": "Activa JavaScript para cargar la colecci\xF3n de noticias, o",
  "read Courageous Stories on Stringer\u2019s website": "lee los reportajes valientes en el sitio web de Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "The Stringer Foundation (EIN: 33-4278131) es una organizaci\xF3n sin \xE1nimo de lucro 501(c)(3).",
  "Support courageous journalism": "Apoya el periodismo valiente",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "Contribuye a ampliar el periodismo valiente y a formar a la pr\xF3xima generaci\xF3n de periodistas audaces.",
  "Footer navigation": "Navegaci\xF3n del pie de p\xE1gina",
  "Explore Stringer": "Descubre Stringer",
  "Our mission": "Nuestra misi\xF3n",
  "Stringer Awards": "Premios Stringer",
  "Courageous stories": "Reportajes valientes",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "Los art\xEDculos pertenecen a sus medios originales. Sigue cada titular para leer o ver el reportaje original.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "Las im\xE1genes de vista previa, incluidas las tarjetas de redes sociales, pertenecen a sus titulares de derechos. Su presencia no implica respaldo ni derechos de reutilizaci\xF3n. Derechos o retirada:",
  "English": "Espa\xF1ol",
  "Global headlines": "Titulares internacionales",
  "Build": "Versi\xF3n",
  "Global publisher headlines and Stringer reporting in their original languages.": "Titulares de medios internacionales y reportajes de Stringer en sus idiomas originales.",
  "Stringer on X": "Stringer en X",
  "Loading \xB7 {seconds} s elapsed": "Cargando \xB7 {seconds} s transcurridos",
  "{outcome} in {seconds} s": "{outcome} en {seconds} s",
  "{stage} Total elapsed: {seconds} s.": "{stage} Tiempo total transcurrido: {seconds} s.",
  "Latest feed load: {timing}.": "\xDAltima carga de canales: {timing}.",
  "Story retrieval from news relays:": "Recuperaci\xF3n de art\xEDculos desde los rel\xE9s de noticias:",
  "no published stories": "no hay art\xEDculos publicados",
  "loaded in {seconds} s": "cargado en {seconds} s",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "cargando \xB7 {seconds} s transcurridos \xB7 {received}/{total} art\xEDculos",
  "{received}/{total} stories received after {seconds} s": "{received}/{total} art\xEDculos recibidos despu\xE9s de {seconds} s",
  "Feed status \xB7 {timing}": "Estado de los canales \xB7 {timing}",
  "Loaded": "Cargado",
  "Failed": "Error",
  "Partial": "Parcial",
  "Checking for updates\u2026": "Comprobando actualizaciones\u2026",
  "Connecting to news relays\u2026": "Conectando con los rel\xE9s de noticias\u2026",
  "Verified collection. Loading published stories\u2026": "Colecci\xF3n verificada. Cargando art\xEDculos publicados\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "Se recibieron {received} notas publicadas. Reintentando la recuperaci\xF3n de las {missing} notas que faltan\u2026"
};
var es_default = spanish;

// locales/ar.ts
var arabic = {
  "Headlines from publishers in this language.": "\u0639\u0646\u0627\u0648\u064A\u0646 \u0645\u0646 \u0648\u0633\u0627\u0626\u0644 \u0625\u0639\u0644\u0627\u0645 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629.",
  "Close menu": "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
  "Open menu": "\u0641\u062A\u062D \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
  "Sources": "\u0627\u0644\u0645\u0635\u0627\u062F\u0631",
  "Choose news sources": "\u0627\u062E\u062A\u0631 \u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u0623\u062E\u0628\u0627\u0631",
  "Enable all": "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0643\u0644",
  "Your choices are saved in this browser.": "\u062A\u064F\u062D\u0641\u064E\u0638 \u0627\u062E\u062A\u064A\u0627\u0631\u0627\u062A\u0643 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u0635\u0641\u062D.",
  "{enabled} of {total} enabled": "\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 {enabled} \u0645\u0646 \u0623\u0635\u0644 {total}",
  "Search sources": "\u0627\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631",
  "No sources selected.": "\u0644\u0645 \u064A\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 \u0623\u064A \u0645\u0635\u0627\u062F\u0631.",
  "No matching sources.": "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0635\u0627\u062F\u0631 \u0645\u0637\u0627\u0628\u0642\u0629.",
  "May require subscription": "\u0642\u062F \u064A\u062A\u0637\u0644\u0628 \u0627\u0634\u062A\u0631\u0627\u0643\u064B\u0627",
  "{count} articles": "{count} \u0645\u0642\u0627\u0644\u064B\u0627",
  "View {count} articles": "\u0639\u0631\u0636 {count} \u0645\u0642\u0627\u0644\u064B\u0627",
  "Show fewer headlines": "\u0639\u0631\u0636 \u0639\u0646\u0627\u0648\u064A\u0646 \u0623\u0642\u0644",
  "More headlines ({count})": "\u0645\u0632\u064A\u062F \u0645\u0646 \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 ({count})",
  "Global headlines are currently unavailable.": "\u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627.",
  "No headlines available in this collection.": "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0639\u0646\u0627\u0648\u064A\u0646 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629.",
  "Loading headlines\u2026": "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646\u2026",
  "Loading news\u2026": "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u062E\u0628\u0627\u0631\u2026",
  "Loading courageous stories\u2026": "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062C\u0631\u064A\u0626\u0629\u2026",
  "Loading the latest published collection\u2026": "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0623\u062D\u062F\u062B \u0645\u062C\u0645\u0648\u0639\u0629 \u0645\u0646\u0634\u0648\u0631\u0629\u2026",
  "Headlines unavailable.": "\u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "\u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062C\u0631\u064A\u0626\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629. \u0644\u0627 \u064A\u0632\u0627\u0644 \u0628\u0625\u0645\u0643\u0627\u0646\u0643 \u0632\u064A\u0627\u0631\u0629 \u0645\u062C\u0645\u0648\u0639\u0629 Stringer \u0623\u062F\u0646\u0627\u0647.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "\u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062C\u0631\u064A\u0626\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627. \u062A\u0641\u0636\u0651\u0644 \u0628\u0632\u064A\u0627\u0631\u0629 \u0645\u062C\u0645\u0648\u0639\u0629 Stringer \u0623\u062F\u0646\u0627\u0647.",
  "Could not check for updates. Keeping the previously loaded collection.": "\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0648\u062C\u0648\u062F \u062A\u062D\u062F\u064A\u062B\u0627\u062A. \u0633\u0646\u062D\u062A\u0641\u0638 \u0628\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u0627\u0644\u062A\u064A \u062A\u0645 \u062A\u062D\u0645\u064A\u0644\u0647\u0627 \u0633\u0627\u0628\u0642\u064B\u0627.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "\u0645\u062C\u0645\u0648\u0639\u0629 \u0627\u0644\u0623\u062E\u0628\u0627\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629. \u0633\u0646\u0639\u064A\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.",
  "Local time ({zone})": "\u0627\u0644\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0645\u062D\u0644\u064A ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0646\u0634\u0631\u061B \u0644\u0627 \u064A\u0648\u0641\u0651\u0631 \u0627\u0644\u0645\u0635\u062F\u0631 \u0648\u0642\u062A\u064B\u0627 \u0648\u0645\u0646\u0637\u0642\u0629 \u0632\u0645\u0646\u064A\u0629 \u0645\u0624\u0643\u0651\u062F\u064A\u0646",
  "Publication date unavailable": "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0646\u0634\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D",
  "Date unavailable": "\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0645\u062A\u0627\u062D",
  "{source}: refresh unavailable.{retained}": "{source}: \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u063A\u064A\u0631 \u0645\u062A\u0627\u062D.{retained}",
  " Showing previously collected stories.": " \u064A\u062C\u0631\u064A \u0639\u0631\u0636 \u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062A\u064A \u062C\u064F\u0645\u0639\u062A \u0633\u0627\u0628\u0642\u064B\u0627.",
  " No stories available.": " \u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0642\u0635\u0635.",
  "{count} unavailable": "{count} \u063A\u064A\u0631 \u0645\u062A\u0627\u062D",
  "{count} queued": "{count} \u0641\u064A \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631",
  "Read {title} at the original source": "\u0627\u0642\u0631\u0623 {title} \u0641\u064A \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0623\u0635\u0644\u064A",
  "Atomstr mirror timestamp ({zone})": "\u0648\u0642\u062A \u0627\u0644\u0646\u0634\u0631 \u0641\u064A \u0646\u0633\u062E\u0629 Atomstr ({zone})",
  "via {network} / Atomstr": "\u0639\u0628\u0631 {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "\u0646\u0633\u062E Atomstr\u061B \u0647\u0630\u0647 \u0644\u064A\u0633\u062A \u062D\u0633\u0627\u0628\u0627\u062A Nostr \u0627\u0644\u0631\u0633\u0645\u064A\u0629 \u0644\u0644\u0646\u0627\u0634\u0631\u064A\u0646.",
  "Feed status": "\u062D\u0627\u0644\u0629 \u0627\u0644\u062E\u0644\u0627\u0635\u0627\u062A",
  "Unavailable sources ({count})": "\u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u063A\u064A\u0631 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 ({count})",
  "Language": "\u0627\u0644\u0644\u063A\u0629",
  "Skip to news": "\u0627\u0646\u062A\u0642\u0644 \u0625\u0644\u0649 \u0627\u0644\u0623\u062E\u0628\u0627\u0631",
  "The Stringer Foundation home": "\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0644\u0645\u0624\u0633\u0633\u0629 Stringer",
  "Main navigation": "\u0627\u0644\u062A\u0646\u0642\u0644 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
  "Donate": "\u062A\u0628\u0631\u0651\u0639",
  "Donate now": "\u062A\u0628\u0631\u0651\u0639 \u0627\u0644\u0622\u0646",
  "Home": "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",
  "Mission": "\u0631\u0633\u0627\u0644\u062A\u0646\u0627",
  "Who we are": "\u0645\u0646 \u0646\u062D\u0646",
  "Awards": "\u0627\u0644\u062C\u0648\u0627\u0626\u0632",
  "Contact us": "\u0627\u062A\u0635\u0644 \u0628\u0646\u0627",
  "World news": "\u0623\u062E\u0628\u0627\u0631 \u0627\u0644\u0639\u0627\u0644\u0645",
  "Stringer social media": "\u062D\u0633\u0627\u0628\u0627\u062A Stringer \u0639\u0644\u0649 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A",
  "Stringer on Nostr via Primal": "Stringer \u0639\u0644\u0649 Nostr \u0639\u0628\u0631 Primal",
  "Stringer on Instagram": "Stringer \u0639\u0644\u0649 Instagram",
  "Stringer on Facebook": "Stringer \u0639\u0644\u0649 Facebook",
  "Stringer on LinkedIn": "Stringer \u0639\u0644\u0649 LinkedIn",
  "Stringer on YouTube": "Stringer \u0639\u0644\u0649 YouTube",
  "Stringer World News": "\u0623\u062E\u0628\u0627\u0631 Stringer \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629",
  "Around the world": "\u062D\u0648\u0644 \u0627\u0644\u0639\u0627\u0644\u0645",
  "Global Newswire": "\u0623\u062E\u0628\u0627\u0631 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  "Courageous Stories": "\u0642\u0635\u0635 \u062C\u0631\u064A\u0626\u0629",
  "Headlines from global publishers.": "\u0639\u0646\u0627\u0648\u064A\u0646 \u0645\u0646 \u0648\u0633\u0627\u0626\u0644 \u0625\u0639\u0644\u0627\u0645 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629.",
  "Beyond the headlines": "\u0645\u0627 \u0648\u0631\u0627\u0621 \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646",
  "Stringer's Courageous Stories": "\u0642\u0635\u0635 Stringer \u0627\u0644\u062C\u0631\u064A\u0626\u0629",
  "Reporting selected by The Stringer Foundation.": "\u062A\u063A\u0637\u064A\u0627\u062A \u0627\u062E\u062A\u0627\u0631\u062A\u0647\u0627 \u0645\u0624\u0633\u0633\u0629 Stringer.",
  "Explore the Stringer collection": "\u0627\u0633\u062A\u0643\u0634\u0641 \u0645\u062C\u0645\u0648\u0639\u0629 Stringer",
  "Enable JavaScript to load the news collection, or": "\u0641\u0639\u0651\u0644 JavaScript \u0644\u062A\u062D\u0645\u064A\u0644 \u0645\u062C\u0645\u0648\u0639\u0629 \u0627\u0644\u0623\u062E\u0628\u0627\u0631\u060C \u0623\u0648",
  "read Courageous Stories on Stringer\u2019s website": "\u0627\u0642\u0631\u0623 \u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062C\u0631\u064A\u0626\u0629 \u0639\u0644\u0649 \u0645\u0648\u0642\u0639 Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "\u0645\u0624\u0633\u0633\u0629 Stringer (\u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641 \u0635\u0627\u062D\u0628 \u0627\u0644\u0639\u0645\u0644 EIN: 33-4278131) \u0645\u0646\u0638\u0645\u0629 \u063A\u064A\u0631 \u0631\u0628\u062D\u064A\u0629 \u0628\u0645\u0648\u062C\u0628 \u0627\u0644\u0645\u0627\u062F\u0629 501(c)(3).",
  "Support courageous journalism": "\u0627\u062F\u0639\u0645 \u0627\u0644\u0635\u062D\u0627\u0641\u0629 \u0627\u0644\u062C\u0631\u064A\u0626\u0629",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "\u0633\u0627\u0647\u0645 \u0641\u064A \u062A\u0648\u0633\u064A\u0639 \u0646\u0637\u0627\u0642 \u0627\u0644\u0635\u062D\u0627\u0641\u0629 \u0627\u0644\u062C\u0631\u064A\u0626\u0629 \u0648\u0631\u0639\u0627\u064A\u0629 \u0627\u0644\u062C\u064A\u0644 \u0627\u0644\u0642\u0627\u062F\u0645 \u0645\u0646 \u0627\u0644\u0635\u062D\u0641\u064A\u064A\u0646 \u0627\u0644\u0634\u062C\u0639\u0627\u0646.",
  "Footer navigation": "\u0627\u0644\u062A\u0646\u0642\u0644 \u0641\u064A \u0627\u0644\u062A\u0630\u064A\u064A\u0644",
  "Explore Stringer": "\u0627\u0643\u062A\u0634\u0641 Stringer",
  "Our mission": "\u0631\u0633\u0627\u0644\u062A\u0646\u0627",
  "Stringer Awards": "\u062C\u0648\u0627\u0626\u0632 Stringer",
  "Courageous stories": "\u0642\u0635\u0635 \u062C\u0631\u064A\u0626\u0629",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "\u062A\u0639\u0648\u062F \u0645\u0644\u0643\u064A\u0629 \u0627\u0644\u0642\u0635\u0635 \u0625\u0644\u0649 \u0646\u0627\u0634\u0631\u064A\u0647\u0627 \u0627\u0644\u0623\u0635\u0644\u064A\u064A\u0646. \u0627\u062A\u0628\u0639 \u0643\u0644 \u0639\u0646\u0648\u0627\u0646 \u0644\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062A\u063A\u0637\u064A\u0629 \u0627\u0644\u0623\u0635\u0644\u064A\u0629 \u0623\u0648 \u0645\u0634\u0627\u0647\u062F\u062A\u0647\u0627.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "\u062A\u0639\u0648\u062F \u0645\u0644\u0643\u064A\u0629 \u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629\u060C \u0628\u0645\u0627 \u0641\u064A\u0647\u0627 \u0628\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A\u060C \u0625\u0644\u0649 \u0623\u0635\u062D\u0627\u0628 \u0627\u0644\u062D\u0642\u0648\u0642. \u0648\u0644\u0627 \u064A\u0639\u0646\u064A \u0639\u0631\u0636\u0647\u0627 \u062A\u0623\u064A\u064A\u062F\u064B\u0627 \u0623\u0648 \u0645\u0646\u062D\u064B\u0627 \u0644\u062D\u0642\u0648\u0642 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645. \u0644\u0644\u0627\u0633\u062A\u0641\u0633\u0627\u0631 \u0639\u0646 \u0627\u0644\u062D\u0642\u0648\u0642 \u0623\u0648 \u0637\u0644\u0628 \u0627\u0644\u0625\u0632\u0627\u0644\u0629:",
  "English": "\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629",
  "Global headlines": "\u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629",
  "Build": "\u0627\u0644\u0625\u0635\u062F\u0627\u0631",
  "Global publisher headlines and Stringer reporting in their original languages.": "\u0639\u0646\u0627\u0648\u064A\u0646 \u0627\u0644\u0646\u0627\u0634\u0631\u064A\u0646 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u064A\u0646 \u0648\u062A\u063A\u0637\u064A\u0627\u062A Stringer \u0628\u0644\u063A\u0627\u062A\u0647\u0627 \u0627\u0644\u0623\u0635\u0644\u064A\u0629.",
  "Stringer on X": "Stringer \u0639\u0644\u0649 X",
  "Loading \xB7 {seconds} s elapsed": "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \xB7 \u0645\u0636\u062A {seconds} \u062B",
  "{outcome} in {seconds} s": "{outcome} \u062E\u0644\u0627\u0644 {seconds} \u062B",
  "{stage} Total elapsed: {seconds} s.": "{stage} \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u0646\u0642\u0636\u064A: {seconds} \u062B.",
  "Latest feed load: {timing}.": "\u0623\u062D\u062F\u062B \u062A\u062D\u0645\u064A\u0644 \u0644\u0644\u062E\u0644\u0627\u0635\u0629: {timing}.",
  "Story retrieval from news relays:": "\u0627\u0633\u062A\u0631\u062C\u0627\u0639 \u0627\u0644\u0642\u0635\u0635 \u0645\u0646 \u0645\u0631\u062D\u0651\u0644\u0627\u062A \u0627\u0644\u0623\u062E\u0628\u0627\u0631:",
  "no published stories": "\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0635\u0635 \u0645\u0646\u0634\u0648\u0631\u0629",
  "loaded in {seconds} s": "\u062A\u0645 \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \u062E\u0644\u0627\u0644 {seconds} \u062B",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \xB7 \u0645\u0636\u062A {seconds} \u062B \xB7 {received}/{total} \u0642\u0635\u0629",
  "{received}/{total} stories received after {seconds} s": "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 {received}/{total} \u0642\u0635\u0629 \u0628\u0639\u062F {seconds} \u062B",
  "Feed status \xB7 {timing}": "\u062D\u0627\u0644\u0629 \u0627\u0644\u062E\u0644\u0627\u0635\u0629 \xB7 {timing}",
  "Loaded": "\u062A\u0645 \u0627\u0644\u062A\u062D\u0645\u064A\u0644",
  "Failed": "\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u062A\u062D\u0645\u064A\u0644",
  "Partial": "\u062C\u0632\u0626\u064A",
  "Checking for updates\u2026": "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A\u2026",
  "Connecting to news relays\u2026": "\u062C\u0627\u0631\u064D \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0645\u0631\u062D\u0651\u0644\u0627\u062A \u0627\u0644\u0623\u062E\u0628\u0627\u0631\u2026",
  "Verified collection. Loading published stories\u2026": "\u062A\u0645 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629. \u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 {received} \u0645\u0644\u0627\u062D\u0638\u0629 \u0645\u0646\u0634\u0648\u0631\u0629. \u062C\u0627\u0631\u064D \u0625\u0639\u0627\u062F\u0629 \u0645\u062D\u0627\u0648\u0644\u0629 \u062C\u0644\u0628 {missing} \u0645\u0644\u0627\u062D\u0638\u0629 \u0645\u0641\u0642\u0648\u062F\u0629\u2026",
  "Show more headlines": "\u0639\u0631\u0636 \u0645\u0632\u064A\u062F \u0645\u0646 \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646",
  "Show more courageous stories": "\u0639\u0631\u0636 \u0645\u0632\u064A\u062F \u0645\u0646 \u0627\u0644\u0642\u0635\u0635 \u0627\u0644\u062C\u0631\u064A\u0626\u0629",
  "Show fewer courageous stories": "\u0639\u0631\u0636 \u0642\u0635\u0635 \u062C\u0631\u064A\u0626\u0629 \u0623\u0642\u0644",
  "View source for this build": "\u0639\u0631\u0636 \u0645\u0635\u062F\u0631 \u0647\u0630\u0627 \u0627\u0644\u0625\u0635\u062F\u0627\u0631"
};
var ar_default = arabic;

// locales/zh.ts
var chinese = {
  "Headlines from publishers in this language.": "\u4E2D\u6587\u5A92\u4F53\u7684\u65B0\u95FB\u6807\u9898\u3002",
  "Close menu": "\u5173\u95ED\u83DC\u5355",
  "Open menu": "\u6253\u5F00\u83DC\u5355",
  "Sources": "\u6765\u6E90",
  "Choose news sources": "\u9009\u62E9\u65B0\u95FB\u6765\u6E90",
  "Enable all": "\u5168\u90E8\u542F\u7528",
  "Your choices are saved in this browser.": "\u4F60\u7684\u9009\u62E9\u4F1A\u4FDD\u5B58\u5728\u6B64\u6D4F\u89C8\u5668\u4E2D\u3002",
  "{enabled} of {total} enabled": "\u5DF2\u542F\u7528 {enabled}/{total}",
  "Search sources": "\u641C\u7D22\u6765\u6E90",
  "No sources selected.": "\u672A\u9009\u62E9\u4EFB\u4F55\u6765\u6E90\u3002",
  "No matching sources.": "\u6CA1\u6709\u5339\u914D\u7684\u6765\u6E90\u3002",
  "May require subscription": "\u53EF\u80FD\u9700\u8981\u8BA2\u9605",
  "{count} articles": "{count} \u7BC7\u6587\u7AE0",
  "View {count} articles": "\u67E5\u770B {count} \u7BC7\u6587\u7AE0",
  "Show fewer headlines": "\u6536\u8D77\u90E8\u5206\u6807\u9898",
  "More headlines ({count})": "\u66F4\u591A\u6807\u9898\uFF08{count}\uFF09",
  "Global headlines are currently unavailable.": "\u5168\u7403\u65B0\u95FB\u6807\u9898\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u3002",
  "No headlines available in this collection.": "\u6B64\u680F\u76EE\u6682\u65E0\u65B0\u95FB\u6807\u9898\u3002",
  "Loading headlines\u2026": "\u6B63\u5728\u52A0\u8F7D\u6807\u9898\u2026",
  "Loading news\u2026": "\u6B63\u5728\u52A0\u8F7D\u65B0\u95FB\u2026",
  "Loading courageous stories\u2026": "\u6B63\u5728\u52A0\u8F7D\u52C7\u6C14\u62A5\u9053\u2026",
  "Loading the latest published collection\u2026": "\u6B63\u5728\u52A0\u8F7D\u6700\u65B0\u53D1\u5E03\u7684\u680F\u76EE\u2026",
  "Headlines unavailable.": "\u6807\u9898\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u3002",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "\u52C7\u6C14\u62A5\u9053\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u3002\u4F60\u4ECD\u53EF\u8BBF\u95EE\u4E0B\u65B9\u7684 Stringer \u680F\u76EE\u3002",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "\u52C7\u6C14\u62A5\u9053\u76EE\u524D\u65E0\u6CD5\u83B7\u53D6\u3002\u8BF7\u8BBF\u95EE\u4E0B\u65B9\u7684 Stringer \u680F\u76EE\u3002",
  "Could not check for updates. Keeping the previously loaded collection.": "\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\u3002\u7EE7\u7EED\u663E\u793A\u5148\u524D\u52A0\u8F7D\u7684\u680F\u76EE\u3002",
  "The news collection is unavailable. We\u2019ll retry automatically.": "\u65B0\u95FB\u680F\u76EE\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u3002\u6211\u4EEC\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002",
  "Local time ({zone})": "\u5F53\u5730\u65F6\u95F4\uFF08{zone}\uFF09",
  "Publication date; source does not provide a confirmed time zone and time": "\u53D1\u5E03\u65E5\u671F\uFF1B\u6765\u6E90\u672A\u63D0\u4F9B\u7ECF\u786E\u8BA4\u7684\u65F6\u523B\u548C\u65F6\u533A",
  "Publication date unavailable": "\u53D1\u5E03\u65E5\u671F\u65E0\u6CD5\u83B7\u53D6",
  "Date unavailable": "\u65E5\u671F\u65E0\u6CD5\u83B7\u53D6",
  "{source}: refresh unavailable.{retained}": "{source}\uFF1A\u65E0\u6CD5\u5237\u65B0\u3002{retained}",
  " Showing previously collected stories.": " \u6B63\u5728\u663E\u793A\u5148\u524D\u6536\u96C6\u7684\u62A5\u9053\u3002",
  " No stories available.": " \u6682\u65E0\u62A5\u9053\u3002",
  "{count} unavailable": "{count} \u4E2A\u65E0\u6CD5\u83B7\u53D6",
  "{count} queued": "{count} \u4E2A\u6392\u961F\u4E2D",
  "Read {title} at the original source": "\u524D\u5F80\u539F\u59CB\u6765\u6E90\u9605\u8BFB\u300A{title}\u300B",
  "Atomstr mirror timestamp ({zone})": "Atomstr \u955C\u50CF\u65F6\u95F4\uFF08{zone}\uFF09",
  "via {network} / Atomstr": "\u901A\u8FC7 {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Atomstr \u955C\u50CF\uFF1B\u8FD9\u4E9B\u5E76\u975E\u51FA\u7248\u65B9\u7684\u5B98\u65B9 Nostr \u8D26\u53F7\u3002",
  "Feed status": "\u4FE1\u606F\u6E90\u72B6\u6001",
  "Unavailable sources ({count})": "\u65E0\u6CD5\u83B7\u53D6\u7684\u6765\u6E90\uFF08{count}\uFF09",
  "Language": "\u8BED\u8A00",
  "Skip to news": "\u8DF3\u8F6C\u5230\u65B0\u95FB",
  "The Stringer Foundation home": "Stringer \u57FA\u91D1\u4F1A\u4E3B\u9875",
  "Main navigation": "\u4E3B\u5BFC\u822A",
  "Donate": "\u6350\u8D60",
  "Donate now": "\u7ACB\u5373\u6350\u8D60",
  "Home": "\u4E3B\u9875",
  "Mission": "\u4F7F\u547D",
  "Who we are": "\u5173\u4E8E\u6211\u4EEC",
  "Awards": "\u5956\u9879",
  "Contact us": "\u8054\u7CFB\u6211\u4EEC",
  "World news": "\u4E16\u754C\u65B0\u95FB",
  "Stringer social media": "Stringer \u793E\u4EA4\u5A92\u4F53",
  "Stringer on Nostr via Primal": "Stringer \u7684 Primal Nostr \u8D26\u53F7",
  "Stringer on Instagram": "Stringer \u7684 Instagram \u8D26\u53F7",
  "Stringer on Facebook": "Stringer \u7684 Facebook \u8D26\u53F7",
  "Stringer on LinkedIn": "Stringer \u7684 LinkedIn \u8D26\u53F7",
  "Stringer on YouTube": "Stringer \u7684 YouTube \u9891\u9053",
  "Stringer World News": "Stringer \u4E16\u754C\u65B0\u95FB",
  "Around the world": "\u73AF\u7403\u65B0\u95FB",
  "Global Newswire": "\u4E2D\u6587\u65B0\u95FB",
  "Courageous Stories": "\u52C7\u6C14\u62A5\u9053",
  "Headlines from global publishers.": "\u4E2D\u6587\u5A92\u4F53\u7684\u65B0\u95FB\u6807\u9898\u3002",
  "Beyond the headlines": "\u6807\u9898\u4E4B\u5916",
  "Stringer's Courageous Stories": "Stringer \u7684\u52C7\u6C14\u62A5\u9053",
  "Reporting selected by The Stringer Foundation.": "\u7531 Stringer \u57FA\u91D1\u4F1A\u7CBE\u9009\u7684\u62A5\u9053\u3002",
  "Explore the Stringer collection": "\u6D4F\u89C8 Stringer \u680F\u76EE",
  "Enable JavaScript to load the news collection, or": "\u542F\u7528 JavaScript \u4EE5\u52A0\u8F7D\u65B0\u95FB\u680F\u76EE\uFF0C\u6216",
  "read Courageous Stories on Stringer\u2019s website": "\u524D\u5F80 Stringer \u7F51\u7AD9\u9605\u8BFB\u52C7\u6C14\u62A5\u9053",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "Stringer \u57FA\u91D1\u4F1A\uFF08\u96C7\u4E3B\u8BC6\u522B\u53F7 EIN\uFF1A33-4278131\uFF09\u662F\u7B26\u5408\u7F8E\u56FD 501(c)(3) \u6761\u6B3E\u7684\u975E\u8425\u5229\u7EC4\u7EC7\u3002",
  "Support courageous journalism": "\u652F\u6301\u52C7\u6562\u7684\u65B0\u95FB\u62A5\u9053",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "\u652F\u6301\u52C7\u6562\u65B0\u95FB\u4E8B\u4E1A\u7684\u53D1\u5C55\uFF0C\u57F9\u80B2\u65B0\u4E00\u4EE3\u52C7\u6562\u7684\u8BB0\u8005\u3002",
  "Footer navigation": "\u9875\u811A\u5BFC\u822A",
  "Explore Stringer": "\u4E86\u89E3 Stringer",
  "Our mission": "\u6211\u4EEC\u7684\u4F7F\u547D",
  "Stringer Awards": "Stringer \u5956\u9879",
  "Courageous stories": "\u52C7\u6C14\u62A5\u9053",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "\u62A5\u9053\u7248\u6743\u5F52\u539F\u59CB\u51FA\u7248\u65B9\u6240\u6709\u3002\u70B9\u51FB\u6807\u9898\u5373\u53EF\u9605\u8BFB\u6216\u89C2\u770B\u539F\u59CB\u62A5\u9053\u3002",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "\u9884\u89C8\u56FE\u7247\uFF08\u5305\u62EC\u793E\u4EA4\u5A92\u4F53\u5361\u7247\uFF09\u7684\u6743\u5229\u5F52\u5176\u6301\u6709\u8005\u6240\u6709\u3002\u5C55\u793A\u56FE\u7247\u4E0D\u4EE3\u8868\u8BA4\u53EF\uFF0C\u4E5F\u4E0D\u6388\u4E88\u8F6C\u8F7D\u6743\u3002\u5982\u9700\u54A8\u8BE2\u6743\u5229\u6216\u7533\u8BF7\u79FB\u9664\uFF0C\u8BF7\u8054\u7CFB\uFF1A",
  "English": "\u82F1\u8BED",
  "Global headlines": "\u5168\u7403\u65B0\u95FB\u6807\u9898",
  "Build": "\u7248\u672C",
  "Global publisher headlines and Stringer reporting in their original languages.": "\u5168\u7403\u51FA\u7248\u65B9\u7684\u65B0\u95FB\u6807\u9898\u53CA Stringer \u4EE5\u539F\u8BED\u8A00\u53D1\u5E03\u7684\u62A5\u9053\u3002",
  "Stringer on X": "Stringer \u7684 X \u8D26\u53F7",
  "Loading \xB7 {seconds} s elapsed": "\u6B63\u5728\u52A0\u8F7D \xB7 \u5DF2\u7528\u65F6 {seconds} \u79D2",
  "{outcome} in {seconds} s": "{outcome}\uFF0C\u7528\u65F6 {seconds} \u79D2",
  "{stage} Total elapsed: {seconds} s.": "{stage} \u603B\u7528\u65F6\uFF1A{seconds} \u79D2\u3002",
  "Latest feed load: {timing}.": "\u6700\u8FD1\u4E00\u6B21\u4FE1\u606F\u6E90\u52A0\u8F7D\uFF1A{timing}\u3002",
  "Story retrieval from news relays:": "\u4ECE\u65B0\u95FB\u4E2D\u7EE7\u83B7\u53D6\u62A5\u9053\uFF1A",
  "no published stories": "\u6CA1\u6709\u5DF2\u53D1\u5E03\u7684\u62A5\u9053",
  "loaded in {seconds} s": "\u7528\u65F6 {seconds} \u79D2\u52A0\u8F7D\u5B8C\u6210",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "\u6B63\u5728\u52A0\u8F7D \xB7 \u5DF2\u7528\u65F6 {seconds} \u79D2 \xB7 \u5DF2\u6536\u5230 {received}/{total} \u7BC7\u62A5\u9053",
  "{received}/{total} stories received after {seconds} s": "{seconds} \u79D2\u540E\u6536\u5230 {received}/{total} \u7BC7\u62A5\u9053",
  "Feed status \xB7 {timing}": "\u4FE1\u606F\u6E90\u72B6\u6001 \xB7 {timing}",
  "Loaded": "\u5DF2\u52A0\u8F7D",
  "Failed": "\u5931\u8D25",
  "Partial": "\u90E8\u5206\u5B8C\u6210",
  "Checking for updates\u2026": "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  "Connecting to news relays\u2026": "\u6B63\u5728\u8FDE\u63A5\u65B0\u95FB\u4E2D\u7EE7\u2026",
  "Verified collection. Loading published stories\u2026": "\u5DF2\u9A8C\u8BC1\u680F\u76EE\u3002\u6B63\u5728\u52A0\u8F7D\u5DF2\u53D1\u5E03\u7684\u62A5\u9053\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "\u5DF2\u6536\u5230 {received} \u6761\u5DF2\u53D1\u5E03\u7684\u6D88\u606F\u3002\u6B63\u5728\u91CD\u8BD5\u83B7\u53D6\u7F3A\u5931\u7684 {missing} \u6761\u6D88\u606F\u2026",
  "Show more headlines": "\u663E\u793A\u66F4\u591A\u65B0\u95FB\u6807\u9898",
  "Show more courageous stories": "\u663E\u793A\u66F4\u591A\u52C7\u6C14\u62A5\u9053",
  "Show fewer courageous stories": "\u6536\u8D77\u90E8\u5206\u52C7\u6C14\u62A5\u9053",
  "View source for this build": "\u67E5\u770B\u6B64\u7248\u672C\u7684\u6E90\u4EE3\u7801"
};
var zh_default = chinese;

// locales/ru.ts
var russian = {
  "Headlines from publishers in this language.": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0440\u0443\u0441\u0441\u043A\u043E\u044F\u0437\u044B\u0447\u043D\u044B\u0445 \u0421\u041C\u0418.",
  "Close menu": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E",
  "Open menu": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E",
  "Sources": "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438",
  "Choose news sources": "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u043D\u043E\u0432\u043E\u0441\u0442\u0435\u0439",
  "Enable all": "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0441\u0435",
  "Your choices are saved in this browser.": "\u0412\u0430\u0448 \u0432\u044B\u0431\u043E\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.",
  "{enabled} of {total} enabled": "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E: {enabled} \u0438\u0437 {total}",
  "Search sources": "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430\u043C",
  "No sources selected.": "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u044B.",
  "No matching sources.": "\u041F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E.",
  "May require subscription": "\u0414\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u0435\u0442 \u043F\u043E\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430",
  "{count} articles": "{count} \u0441\u0442\u0430\u0442\u0435\u0439",
  "View {count} articles": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u0442\u0430\u0442\u044C\u0438: {count}",
  "Show fewer headlines": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u043D\u044C\u0448\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u0432",
  "More headlines ({count})": "\u0415\u0449\u0451 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 ({count})",
  "Global headlines are currently unavailable.": "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.",
  "No headlines available in this collection.": "\u0412 \u044D\u0442\u043E\u0439 \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u0432.",
  "Loading headlines\u2026": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438\u2026",
  "Loading news\u2026": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u043D\u043E\u0432\u043E\u0441\u0442\u0438\u2026",
  "Loading courageous stories\u2026": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0441\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438\u2026",
  "Loading the latest published collection\u2026": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044E\u044E \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u0443\u044E \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443\u2026",
  "Headlines unavailable.": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "\u0421\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B. \u0412\u044B \u0432\u0441\u0451 \u0435\u0449\u0451 \u043C\u043E\u0436\u0435\u0442\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443 Stringer \u043D\u0438\u0436\u0435.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "\u0421\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443 Stringer \u043D\u0438\u0436\u0435.",
  "Could not check for updates. Keeping the previously loaded collection.": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F. \u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u043C \u0440\u0430\u043D\u0435\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u0443\u044E \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u043D\u043E\u0432\u043E\u0441\u0442\u0435\u0439 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u041C\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u043C \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
  "Local time ({zone})": "\u041C\u0435\u0441\u0442\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "\u0414\u0430\u0442\u0430 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438; \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0432\u0440\u0435\u043C\u044F \u0438 \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441",
  "Publication date unavailable": "\u0414\u0430\u0442\u0430 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430",
  "Date unavailable": "\u0414\u0430\u0442\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430",
  "{source}: refresh unavailable.{retained}": "{source}: \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E.{retained}",
  " Showing previously collected stories.": " \u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u043C \u0440\u0430\u043D\u0435\u0435 \u0441\u043E\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B.",
  " No stories available.": " \u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B.",
  "{count} unavailable": "\u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E: {count}",
  "{count} queued": "\u0412 \u043E\u0447\u0435\u0440\u0435\u0434\u0438: {count}",
  "Read {title} at the original source": "\u0427\u0438\u0442\u0430\u0442\u044C \xAB{title}\xBB \u0432 \u043F\u0435\u0440\u0432\u043E\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0435",
  "Atomstr mirror timestamp ({zone})": "\u0412\u0440\u0435\u043C\u044F \u0432 \u0437\u0435\u0440\u043A\u0430\u043B\u0435 Atomstr ({zone})",
  "via {network} / Atomstr": "\u0447\u0435\u0440\u0435\u0437 {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "\u0417\u0435\u0440\u043A\u0430\u043B\u0430 Atomstr; \u044D\u0442\u043E \u043D\u0435 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u044B \u0438\u0437\u0434\u0430\u0442\u0435\u043B\u0435\u0439 \u0432 Nostr.",
  "Feed status": "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043B\u0435\u043D\u0442\u044B",
  "Unavailable sources ({count})": "\u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 ({count})",
  "Language": "\u042F\u0437\u044B\u043A",
  "Skip to news": "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u043D\u043E\u0432\u043E\u0441\u0442\u044F\u043C",
  "The Stringer Foundation home": "\u0413\u043B\u0430\u0432\u043D\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 The Stringer Foundation",
  "Main navigation": "\u041E\u0441\u043D\u043E\u0432\u043D\u0430\u044F \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
  "Donate": "\u041F\u043E\u0436\u0435\u0440\u0442\u0432\u043E\u0432\u0430\u0442\u044C",
  "Donate now": "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E\u0436\u0435\u0440\u0442\u0432\u043E\u0432\u0430\u043D\u0438\u0435",
  "Home": "\u0413\u043B\u0430\u0432\u043D\u0430\u044F",
  "Mission": "\u041D\u0430\u0448\u0430 \u043C\u0438\u0441\u0441\u0438\u044F",
  "Who we are": "\u041E \u043D\u0430\u0441",
  "Awards": "\u041D\u0430\u0433\u0440\u0430\u0434\u044B",
  "Contact us": "\u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0441 \u043D\u0430\u043C\u0438",
  "World news": "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u043D\u043E\u0432\u043E\u0441\u0442\u0438",
  "Stringer social media": "\u0421\u043E\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u0435\u0442\u0438 Stringer",
  "Stringer on Nostr via Primal": "Stringer \u0432 Nostr \u0447\u0435\u0440\u0435\u0437 Primal",
  "Stringer on Instagram": "Stringer \u0432 Instagram",
  "Stringer on Facebook": "Stringer \u0432 Facebook",
  "Stringer on LinkedIn": "Stringer \u0432 LinkedIn",
  "Stringer on YouTube": "Stringer \u043D\u0430 YouTube",
  "Stringer World News": "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u043D\u043E\u0432\u043E\u0441\u0442\u0438 Stringer",
  "Around the world": "\u0421\u043E \u0432\u0441\u0435\u0433\u043E \u043C\u0438\u0440\u0430",
  "Global Newswire": "\u041D\u043E\u0432\u043E\u0441\u0442\u0438 \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C",
  "Courageous Stories": "\u0421\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438",
  "Headlines from global publishers.": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u0440\u0443\u0441\u0441\u043A\u043E\u044F\u0437\u044B\u0447\u043D\u044B\u0445 \u0421\u041C\u0418.",
  "Beyond the headlines": "\u0417\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u0432",
  "Stringer's Courageous Stories": "\u0421\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438 Stringer",
  "Reporting selected by The Stringer Foundation.": "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B, \u043E\u0442\u043E\u0431\u0440\u0430\u043D\u043D\u044B\u0435 The Stringer Foundation.",
  "Explore the Stringer collection": "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443 Stringer",
  "Enable JavaScript to load the news collection, or": "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 JavaScript, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443 \u043D\u043E\u0432\u043E\u0441\u0442\u0435\u0439, \u0438\u043B\u0438",
  "read Courageous Stories on Stringer\u2019s website": "\u0447\u0438\u0442\u0430\u0439\u0442\u0435 \u0441\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438 \u043D\u0430 \u0441\u0430\u0439\u0442\u0435 Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "The Stringer Foundation (EIN: 33-4278131) \u2014 \u043D\u0435\u043A\u043E\u043C\u043C\u0435\u0440\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0441\u043E \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u043C 501(c)(3).",
  "Support courageous journalism": "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0442\u0435 \u0441\u043C\u0435\u043B\u0443\u044E \u0436\u0443\u0440\u043D\u0430\u043B\u0438\u0441\u0442\u0438\u043A\u0443",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "\u041F\u043E\u043C\u043E\u0433\u0438\u0442\u0435 \u0440\u0430\u0437\u0432\u0438\u0432\u0430\u0442\u044C \u0441\u043C\u0435\u043B\u0443\u044E \u0436\u0443\u0440\u043D\u0430\u043B\u0438\u0441\u0442\u0438\u043A\u0443 \u0438 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0442\u044C \u043D\u043E\u0432\u043E\u0435 \u043F\u043E\u043A\u043E\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u0432\u0430\u0436\u043D\u044B\u0445 \u0440\u0435\u043F\u043E\u0440\u0442\u0451\u0440\u043E\u0432.",
  "Footer navigation": "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F \u0432 \u043D\u0438\u0436\u043D\u0435\u0439 \u0447\u0430\u0441\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
  "Explore Stringer": "\u0423\u0437\u043D\u0430\u0439\u0442\u0435 \u043E Stringer",
  "Our mission": "\u041D\u0430\u0448\u0430 \u043C\u0438\u0441\u0441\u0438\u044F",
  "Stringer Awards": "\u041D\u0430\u0433\u0440\u0430\u0434\u044B Stringer",
  "Courageous stories": "\u0421\u043C\u0435\u043B\u044B\u0435 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0438",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0430\u0442 \u0438\u0445 \u0438\u0437\u0434\u0430\u0442\u0435\u043B\u044F\u043C. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043F\u043E \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0438\u043B\u0438 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430, \u0432 \u0442\u043E\u043C \u0447\u0438\u0441\u043B\u0435 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0438\u0437 \u0441\u043E\u0446\u0441\u0435\u0442\u0435\u0439, \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0430\u0442 \u043F\u0440\u0430\u0432\u043E\u043E\u0431\u043B\u0430\u0434\u0430\u0442\u0435\u043B\u044F\u043C. \u041F\u043E\u043A\u0430\u0437 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043F\u0440\u0430\u0432 \u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435. \u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043E \u043F\u0440\u0430\u0432\u0430\u0445 \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438:",
  "English": "\u0410\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439",
  "Global headlines": "\u041C\u0438\u0440\u043E\u0432\u044B\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438",
  "Build": "\u0421\u0431\u043E\u0440\u043A\u0430",
  "Global publisher headlines and Stringer reporting in their original languages.": "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0438 \u043C\u0438\u0440\u043E\u0432\u044B\u0445 \u0438\u0437\u0434\u0430\u0442\u0435\u043B\u0435\u0439 \u0438 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B Stringer \u043D\u0430 \u044F\u0437\u044B\u043A\u0430\u0445 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u0430.",
  "Stringer on X": "Stringer \u0432 X",
  "Show more headlines": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u0432",
  "Show fewer courageous stories": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u043D\u044C\u0448\u0435 \u0441\u043C\u0435\u043B\u044B\u0445 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0435\u0439",
  "Show more courageous stories": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u0441\u043C\u0435\u043B\u044B\u0445 \u0440\u0435\u043F\u043E\u0440\u0442\u0430\u0436\u0435\u0439",
  "View source for this build": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043A\u043E\u0434 \u044D\u0442\u043E\u0439 \u0441\u0431\u043E\u0440\u043A\u0438",
  "Loading \xB7 {seconds} s elapsed": "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \xB7 \u043F\u0440\u043E\u0448\u043B\u043E {seconds} \u0441",
  "{outcome} in {seconds} s": "{outcome} \u0437\u0430 {seconds} \u0441",
  "{stage} Total elapsed: {seconds} s.": "{stage} \u041E\u0431\u0449\u0435\u0435 \u0432\u0440\u0435\u043C\u044F: {seconds} \u0441.",
  "Latest feed load: {timing}.": "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043B\u0435\u043D\u0442\u044B: {timing}.",
  "Story retrieval from news relays:": "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0441 \u043D\u043E\u0432\u043E\u0441\u0442\u043D\u044B\u0445 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0442\u043E\u0440\u043E\u0432:",
  "no published stories": "\u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u043D\u0435\u0442",
  "loaded in {seconds} s": "\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E \u0437\u0430 {seconds} \u0441",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \xB7 \u043F\u0440\u043E\u0448\u043B\u043E {seconds} \u0441 \xB7 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432: {received}/{total}",
  "{received}/{total} stories received after {seconds} s": "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432: {received}/{total} \u0437\u0430 {seconds} \u0441",
  "Feed status \xB7 {timing}": "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043B\u0435\u043D\u0442\u044B \xB7 {timing}",
  "Loaded": "\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E",
  "Failed": "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
  "Partial": "\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u043E",
  "Checking for updates\u2026": "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F\u2026",
  "Connecting to news relays\u2026": "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C\u0441\u044F \u043A \u043D\u043E\u0432\u043E\u0441\u0442\u043D\u044B\u043C \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0442\u043E\u0440\u0430\u043C\u2026",
  "Verified collection. Loading published stories\u2026": "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430. \u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0437\u0430\u043C\u0435\u0442\u043E\u043A: {received}. \u041F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u043C \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u043B\u044F {missing} \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0445 \u0437\u0430\u043C\u0435\u0442\u043E\u043A\u2026"
};
var ru_default = russian;

// locales/nl.ts
var dutch = {
  "Headlines from publishers in this language.": "Koppen van Nederlandstalige nieuwsmedia.",
  "Close menu": "Menu sluiten",
  "Open menu": "Menu openen",
  "Sources": "Bronnen",
  "Choose news sources": "Kies nieuwsbronnen",
  "Enable all": "Alles inschakelen",
  "Your choices are saved in this browser.": "Je keuzes worden in deze browser opgeslagen.",
  "{enabled} of {total} enabled": "{enabled} van {total} ingeschakeld",
  "Search sources": "Bronnen zoeken",
  "No sources selected.": "Geen bronnen geselecteerd.",
  "No matching sources.": "Geen overeenkomende bronnen.",
  "May require subscription": "Mogelijk is een abonnement vereist",
  "{count} articles": "{count} artikelen",
  "View {count} articles": "Bekijk {count} artikelen",
  "Show fewer headlines": "Minder koppen weergeven",
  "More headlines ({count})": "Meer koppen ({count})",
  "Show more headlines": "Meer koppen weergeven",
  "Show more courageous stories": "Meer moedige reportages weergeven",
  "Show fewer courageous stories": "Minder moedige reportages weergeven",
  "View source for this build": "Broncode van deze versie bekijken",
  "Global headlines are currently unavailable.": "Wereldnieuws is momenteel niet beschikbaar.",
  "No headlines available in this collection.": "Er zijn geen koppen beschikbaar in deze selectie.",
  "Loading headlines\u2026": "Koppen laden\u2026",
  "Loading news\u2026": "Nieuws laden\u2026",
  "Loading courageous stories\u2026": "Moedige reportages laden\u2026",
  "Loading the latest published collection\u2026": "De nieuwste gepubliceerde selectie laden\u2026",
  "Headlines unavailable.": "Koppen niet beschikbaar.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "De moedige reportages zijn niet beschikbaar. Je kunt hieronder nog wel de selectie van Stringer bekijken.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "De moedige reportages zijn momenteel niet beschikbaar. Bekijk hieronder de selectie van Stringer.",
  "Could not check for updates. Keeping the previously loaded collection.": "Updates konden niet worden gecontroleerd. De eerder geladen selectie blijft beschikbaar.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "De nieuwsoverzicht is niet beschikbaar. We proberen het automatisch opnieuw.",
  "Local time ({zone})": "Lokale tijd ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "Publicatiedatum; de bron geeft geen bevestigde tijd en tijdzone op",
  "Publication date unavailable": "Publicatiedatum niet beschikbaar",
  "Date unavailable": "Datum niet beschikbaar",
  "{source}: refresh unavailable.{retained}": "{source}: vernieuwen niet mogelijk.{retained}",
  " Showing previously collected stories.": " Eerder verzamelde artikelen worden weergegeven.",
  " No stories available.": " Geen artikelen beschikbaar.",
  "{count} unavailable": "{count} niet beschikbaar",
  "{count} queued": "{count} in de wachtrij",
  "Read {title} at the original source": "Lees {title} bij de oorspronkelijke bron",
  "Atomstr mirror timestamp ({zone})": "Tijdstip van de Atomstr-spiegel ({zone})",
  "via {network} / Atomstr": "via {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Atomstr-spiegels; dit zijn geen offici\xEBle Nostr-accounts van uitgevers.",
  "Feed status": "Feedstatus",
  "Unavailable sources ({count})": "Niet-beschikbare bronnen ({count})",
  "Language": "Taal",
  "Skip to news": "Ga naar het nieuws",
  "The Stringer Foundation home": "Startpagina van The Stringer Foundation",
  "Main navigation": "Hoofdnavigatie",
  "Donate": "Doneren",
  "Donate now": "Doneer nu",
  "Home": "Startpagina",
  "Mission": "Missie",
  "Who we are": "Wie we zijn",
  "Awards": "Prijzen",
  "Contact us": "Contact",
  "World news": "Wereldnieuws",
  "Stringer social media": "Sociale media van Stringer",
  "Stringer on Nostr via Primal": "Stringer op Nostr via Primal",
  "Stringer on Instagram": "Stringer op Instagram",
  "Stringer on Facebook": "Stringer op Facebook",
  "Stringer on LinkedIn": "Stringer op LinkedIn",
  "Stringer on YouTube": "Stringer op YouTube",
  "Stringer World News": "Wereldnieuws van Stringer",
  "Around the world": "Over de hele wereld",
  "Global Newswire": "Nieuws in het Nederlands",
  "Courageous Stories": "Moedige reportages",
  "Headlines from global publishers.": "Koppen van Nederlandstalige nieuwsmedia.",
  "Beyond the headlines": "Meer dan alleen de koppen",
  "Stringer's Courageous Stories": "De moedige reportages van Stringer",
  "Reporting selected by The Stringer Foundation.": "Reportages geselecteerd door The Stringer Foundation.",
  "Explore the Stringer collection": "Bekijk de selectie van Stringer",
  "Enable JavaScript to load the news collection, or": "Schakel JavaScript in om de nieuwsoverzicht te laden, of",
  "read Courageous Stories on Stringer\u2019s website": "lees de moedige reportages op de website van Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "The Stringer Foundation (EIN: 33-4278131) is een non-profitorganisatie volgens 501(c)(3).",
  "Support courageous journalism": "Steun moedige journalistiek",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "Help moedige journalistiek uit te breiden en de volgende generatie dappere verslaggevers op te leiden.",
  "Footer navigation": "Voettekstnavigatie",
  "Explore Stringer": "Ontdek Stringer",
  "Our mission": "Onze missie",
  "Stringer Awards": "Stringer-prijzen",
  "Courageous stories": "Moedige reportages",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "Artikelen zijn eigendom van de oorspronkelijke uitgevers. Volg elke kop om de oorspronkelijke reportage te lezen of te bekijken.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "Voorbeeldafbeeldingen, waaronder kaarten van sociale media, zijn eigendom van de rechthebbenden. Weergave betekent geen aanbeveling of hergebruikrecht. Rechten of verwijdering:",
  "English": "Nederlands",
  "Global headlines": "Wereldnieuws",
  "Build": "Versie",
  "Global publisher headlines and Stringer reporting in their original languages.": "Koppen van internationale uitgevers en reportages van Stringer in de oorspronkelijke talen.",
  "Stringer on X": "Stringer op X",
  "Loading \xB7 {seconds} s elapsed": "Laden \xB7 {seconds} s verstreken",
  "{outcome} in {seconds} s": "{outcome} in {seconds} s",
  "{stage} Total elapsed: {seconds} s.": "{stage} Totale verstreken tijd: {seconds} s.",
  "Latest feed load: {timing}.": "Laatste feed geladen: {timing}.",
  "Story retrieval from news relays:": "Artikelen ophalen uit nieuwsrelays:",
  "no published stories": "geen gepubliceerde artikelen",
  "loaded in {seconds} s": "geladen in {seconds} s",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "laden \xB7 {seconds} s verstreken \xB7 {received}/{total} artikelen",
  "{received}/{total} stories received after {seconds} s": "{received}/{total} artikelen ontvangen na {seconds} s",
  "Feed status \xB7 {timing}": "Feedstatus \xB7 {timing}",
  "Loaded": "Geladen",
  "Failed": "Mislukt",
  "Partial": "Gedeeltelijk",
  "Checking for updates\u2026": "Controleren op updates\u2026",
  "Connecting to news relays\u2026": "Verbinden met nieuwsrelays\u2026",
  "Verified collection. Loading published stories\u2026": "Selectie gecontroleerd. Gepubliceerde artikelen laden\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "{received} gepubliceerde berichten ontvangen. Opnieuw proberen de {missing} ontbrekende berichten op te halen\u2026"
};
var nl_default = dutch;

// locales/de.ts
var german = {
  "Headlines from publishers in this language.": "Schlagzeilen deutschsprachiger Medien.",
  "Close menu": "Men\xFC schlie\xDFen",
  "Open menu": "Men\xFC \xF6ffnen",
  "Sources": "Quellen",
  "Choose news sources": "Nachrichtenquellen ausw\xE4hlen",
  "Enable all": "Alle aktivieren",
  "Your choices are saved in this browser.": "Ihre Auswahl wird in diesem Browser gespeichert.",
  "{enabled} of {total} enabled": "{enabled} von {total} aktiviert",
  "Search sources": "Quellen suchen",
  "No sources selected.": "Keine Quellen ausgew\xE4hlt.",
  "No matching sources.": "Keine passenden Quellen gefunden.",
  "May require subscription": "M\xF6glicherweise ist ein Abonnement erforderlich",
  "{count} articles": "{count} Artikel",
  "View {count} articles": "{count} Artikel ansehen",
  "Show fewer headlines": "Weniger Schlagzeilen anzeigen",
  "More headlines ({count})": "Weitere Schlagzeilen ({count})",
  "Global headlines are currently unavailable.": "Internationale Schlagzeilen sind derzeit nicht verf\xFCgbar.",
  "No headlines available in this collection.": "In dieser Sammlung sind keine Schlagzeilen verf\xFCgbar.",
  "Loading headlines\u2026": "Schlagzeilen werden geladen\u2026",
  "Loading news\u2026": "Nachrichten werden geladen\u2026",
  "Loading courageous stories\u2026": "Mutige Reportagen werden geladen\u2026",
  "Loading the latest published collection\u2026": "Die neueste ver\xF6ffentlichte Sammlung wird geladen\u2026",
  "Headlines unavailable.": "Schlagzeilen nicht verf\xFCgbar.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "Mutige Reportagen sind nicht verf\xFCgbar. Sie k\xF6nnen die Stringer-Sammlung weiter unten trotzdem aufrufen.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "Mutige Reportagen sind derzeit nicht verf\xFCgbar. Rufen Sie die Stringer-Sammlung weiter unten auf.",
  "Could not check for updates. Keeping the previously loaded collection.": "Die Aktualisierungen konnten nicht abgerufen werden. Die zuvor geladene Sammlung bleibt verf\xFCgbar.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "Die Nachrichtensammlung ist nicht verf\xFCgbar. Wir versuchen es automatisch erneut.",
  "Local time ({zone})": "Ortszeit ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "Ver\xF6ffentlichungsdatum; die Quelle gibt keine best\xE4tigte Uhrzeit und Zeitzone an",
  "Publication date unavailable": "Ver\xF6ffentlichungsdatum nicht verf\xFCgbar",
  "Date unavailable": "Datum nicht verf\xFCgbar",
  "{source}: refresh unavailable.{retained}": "{source}: Aktualisierung nicht verf\xFCgbar.{retained}",
  " Showing previously collected stories.": " Zuvor gesammelte Beitr\xE4ge werden angezeigt.",
  " No stories available.": " Keine Beitr\xE4ge verf\xFCgbar.",
  "{count} unavailable": "{count} nicht verf\xFCgbar",
  "{count} queued": "{count} in der Warteschlange",
  "Read {title} at the original source": "\u201E{title}\u201C bei der Originalquelle lesen",
  "Atomstr mirror timestamp ({zone})": "Zeitangabe des Atomstr-Spiegels ({zone})",
  "via {network} / Atomstr": "\xFCber {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Atomstr-Spiegel; dies sind keine offiziellen Nostr-Konten der Verlage.",
  "Feed status": "Feed-Status",
  "Unavailable sources ({count})": "Nicht verf\xFCgbare Quellen ({count})",
  "Language": "Sprache",
  "Skip to news": "Zum Nachrichtenbereich springen",
  "The Stringer Foundation home": "Startseite der The Stringer Foundation",
  "Main navigation": "Hauptnavigation",
  "Donate": "Spenden",
  "Donate now": "Jetzt spenden",
  "Home": "Startseite",
  "Mission": "Mission",
  "Who we are": "\xDCber uns",
  "Awards": "Auszeichnungen",
  "Contact us": "Kontakt",
  "World news": "Weltnachrichten",
  "Stringer social media": "Stringer in sozialen Medien",
  "Stringer on Nostr via Primal": "Stringer auf Nostr \xFCber Primal",
  "Stringer on Instagram": "Stringer auf Instagram",
  "Stringer on Facebook": "Stringer auf Facebook",
  "Stringer on LinkedIn": "Stringer auf LinkedIn",
  "Stringer on YouTube": "Stringer auf YouTube",
  "Stringer World News": "Stringer-Weltnachrichten",
  "Around the world": "Aus aller Welt",
  "Global Newswire": "Nachrichten auf Deutsch",
  "Courageous Stories": "Mutige Reportagen",
  "Headlines from global publishers.": "Schlagzeilen deutschsprachiger Medien.",
  "Beyond the headlines": "Mehr als Schlagzeilen",
  "Stringer's Courageous Stories": "Mutige Reportagen von Stringer",
  "Reporting selected by The Stringer Foundation.": "Von The Stringer Foundation ausgew\xE4hlte Berichte.",
  "Explore the Stringer collection": "Die Stringer-Sammlung entdecken",
  "Enable JavaScript to load the news collection, or": "Aktivieren Sie JavaScript, um die Nachrichtensammlung zu laden, oder",
  "read Courageous Stories on Stringer\u2019s website": "lesen Sie die mutigen Reportagen auf der Website von Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "The Stringer Foundation (EIN: 33-4278131) ist eine gemeinn\xFCtzige Organisation nach US-Steuerrecht (501(c)(3)).",
  "Support courageous journalism": "Mutigen Journalismus unterst\xFCtzen",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "Helfen Sie, mutigen Journalismus auszubauen und die n\xE4chste Generation couragierter Reporterinnen und Reporter zu f\xF6rdern.",
  "Footer navigation": "Navigation im Fu\xDFbereich",
  "Explore Stringer": "Stringer entdecken",
  "Our mission": "Unsere Mission",
  "Stringer Awards": "Stringer-Auszeichnungen",
  "Courageous stories": "Mutige Reportagen",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "Die Beitr\xE4ge geh\xF6ren den jeweiligen Originalverlagen. Folgen Sie den Schlagzeilen, um die Originalberichte zu lesen oder anzusehen.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "Vorschaubilder, einschlie\xDFlich Social-Media-Karten, geh\xF6ren den jeweiligen Rechteinhabern. Die Anzeige bedeutet weder eine Empfehlung noch eine Erlaubnis zur Wiederverwendung. Fragen zu Rechten oder Entfernung:",
  "English": "Englisch",
  "Global headlines": "Internationale Schlagzeilen",
  "Build": "Build",
  "Global publisher headlines and Stringer reporting in their original languages.": "Schlagzeilen internationaler Verlage und Berichte von Stringer in ihren Originalsprachen.",
  "Stringer on X": "Stringer auf X",
  "Show more headlines": "Weitere Schlagzeilen anzeigen",
  "Show fewer courageous stories": "Weniger mutige Reportagen anzeigen",
  "Show more courageous stories": "Weitere mutige Reportagen anzeigen",
  "View source for this build": "Quellcode dieses Builds anzeigen",
  "Loading \xB7 {seconds} s elapsed": "Wird geladen \xB7 {seconds} s vergangen",
  "{outcome} in {seconds} s": "{outcome} in {seconds} s",
  "{stage} Total elapsed: {seconds} s.": "{stage} Gesamtdauer: {seconds} s.",
  "Latest feed load: {timing}.": "Letzter Feed-Ladevorgang: {timing}.",
  "Story retrieval from news relays:": "Abruf von Beitr\xE4gen \xFCber Nachrichten-Relays:",
  "no published stories": "keine ver\xF6ffentlichten Beitr\xE4ge",
  "loaded in {seconds} s": "in {seconds} s geladen",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "wird geladen \xB7 {seconds} s vergangen \xB7 {received}/{total} Beitr\xE4ge",
  "{received}/{total} stories received after {seconds} s": "{received}/{total} Beitr\xE4ge nach {seconds} s empfangen",
  "Feed status \xB7 {timing}": "Feed-Status \xB7 {timing}",
  "Loaded": "Geladen",
  "Failed": "Fehlgeschlagen",
  "Partial": "Teilweise geladen",
  "Checking for updates\u2026": "Aktualisierungen werden gepr\xFCft\u2026",
  "Connecting to news relays\u2026": "Verbindung zu Nachrichten-Relays wird hergestellt\u2026",
  "Verified collection. Loading published stories\u2026": "Sammlung gepr\xFCft. Ver\xF6ffentlichte Beitr\xE4ge werden geladen\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "{received} ver\xF6ffentlichte Notizen empfangen. {missing} fehlende Notizen werden erneut abgerufen\u2026"
};
var de_default = german;

// reader-locales.ts
var portuguese = {
  "Show more headlines": "Mostrar mais manchetes",
  "Show more courageous stories": "Mostrar mais reportagens corajosas",
  "Show fewer courageous stories": "Mostrar menos reportagens corajosas",
  "View source for this build": "Ver o c\xF3digo desta vers\xE3o",
  "Build": "Vers\xE3o",
  "Stringer on X": "Stringer no X",
  "Loading \xB7 {seconds} s elapsed": "Carregando \xB7 {seconds} s decorridos",
  "{outcome} in {seconds} s": "{outcome} em {seconds} s",
  "{stage} Total elapsed: {seconds} s.": "{stage} Tempo total: {seconds} s.",
  "Latest feed load: {timing}.": "\xDAltimo carregamento das fontes: {timing}.",
  "Story retrieval from news relays:": "Obten\xE7\xE3o de not\xEDcias dos relays:",
  "no published stories": "nenhuma not\xEDcia publicada",
  "loaded in {seconds} s": "carregado em {seconds} s",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "carregando \xB7 {seconds} s decorridos \xB7 {received}/{total} not\xEDcias",
  "{received}/{total} stories received after {seconds} s": "{received}/{total} not\xEDcias recebidas ap\xF3s {seconds} s",
  "Feed status \xB7 {timing}": "Estado das fontes \xB7 {timing}",
  "Loaded": "Carregado",
  "Failed": "Falhou",
  "Partial": "Parcial",
  "Checking for updates\u2026": "Verificando atualiza\xE7\xF5es\u2026",
  "Connecting to news relays\u2026": "Conectando aos relays de not\xEDcias\u2026",
  "Verified collection. Loading published stories\u2026": "Cole\xE7\xE3o verificada. Carregando not\xEDcias publicadas\u2026",
  "Received {received} published notes. Retrying {missing} missing notes\u2026": "{received} notas publicadas recebidas. Tentando novamente obter {missing} notas restantes\u2026",
  "Close menu": "Fechar menu",
  "Open menu": "Abrir menu",
  "Sources": "Fontes",
  "Choose news sources": "Escolha as fontes de not\xEDcias",
  "Enable all": "Ativar todas",
  "Your choices are saved in this browser.": "Suas escolhas s\xE3o salvas neste navegador.",
  "{enabled} of {total} enabled": "{enabled} de {total} ativas",
  "Search sources": "Buscar fontes",
  "No sources selected.": "Nenhuma fonte selecionada.",
  "No matching sources.": "Nenhuma fonte corresponde \xE0 busca.",
  "May require subscription": "Pode exigir assinatura",
  "{count} articles": "{count} not\xEDcias",
  "View {count} articles": "Ver {count} not\xEDcias",
  "Show fewer headlines": "Mostrar menos manchetes",
  "More headlines ({count})": "Mais manchetes ({count})",
  "Global headlines are currently unavailable.": "As manchetes est\xE3o indispon\xEDveis no momento.",
  "No headlines available in this collection.": "Nenhuma manchete dispon\xEDvel nesta cole\xE7\xE3o.",
  "Loading headlines\u2026": "Carregando manchetes\u2026",
  "Loading news\u2026": "Carregando not\xEDcias\u2026",
  "Loading courageous stories\u2026": "Carregando reportagens corajosas\u2026",
  "Loading the latest published collection\u2026": "Carregando a cole\xE7\xE3o mais recente\u2026",
  "Headlines unavailable.": "Manchetes indispon\xEDveis.",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "As reportagens est\xE3o indispon\xEDveis. Voc\xEA pode visitar a cole\xE7\xE3o da Stringer abaixo.",
  "Courageous stories are currently unavailable. Visit the Stringer collection below.": "As reportagens est\xE3o indispon\xEDveis no momento. Visite a cole\xE7\xE3o da Stringer abaixo.",
  "Could not check for updates. Keeping the previously loaded collection.": "N\xE3o foi poss\xEDvel verificar as atualiza\xE7\xF5es. A cole\xE7\xE3o anterior continua dispon\xEDvel.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "As not\xEDcias est\xE3o indispon\xEDveis. Tentaremos novamente automaticamente.",
  "Local time ({zone})": "Hor\xE1rio local ({zone})",
  "Publication date; source does not provide a confirmed time zone and time": "Data de publica\xE7\xE3o; a fonte n\xE3o informa hor\xE1rio e fuso confirmados",
  "Publication date unavailable": "Data de publica\xE7\xE3o indispon\xEDvel",
  "Date unavailable": "Data indispon\xEDvel",
  "{source}: refresh unavailable.{retained}": "{source}: atualiza\xE7\xE3o indispon\xEDvel.{retained}",
  " Showing previously collected stories.": " Exibindo not\xEDcias obtidas anteriormente.",
  " No stories available.": " Nenhuma not\xEDcia dispon\xEDvel.",
  "{count} unavailable": "{count} indispon\xEDveis",
  "{count} queued": "{count} na fila",
  "Read {title} at the original source": "Leia {title} na fonte original",
  "Atomstr mirror timestamp ({zone})": "Data informada pelo espelho Atomstr ({zone})",
  "via {network} / Atomstr": "via {network} / Atomstr",
  "Atomstr mirrors; these are not official publisher Nostr accounts.": "Espelhos do Atomstr; n\xE3o s\xE3o contas oficiais das fontes no Nostr.",
  "Feed status": "Estado das fontes",
  "Unavailable sources ({count})": "Fontes indispon\xEDveis ({count})",
  "Language": "Idioma",
  "Skip to news": "Ir para as not\xEDcias",
  "The Stringer Foundation home": "P\xE1gina inicial da The Stringer Foundation",
  "Main navigation": "Navega\xE7\xE3o principal",
  "Donate": "Doar",
  "Donate now": "Doe agora",
  "Home": "In\xEDcio",
  "Mission": "Miss\xE3o",
  "Who we are": "Quem somos",
  "Awards": "Pr\xEAmios",
  "Contact us": "Fale conosco",
  "World news": "Not\xEDcias do mundo",
  "Stringer social media": "Redes sociais da Stringer",
  "Stringer on Nostr via Primal": "Stringer no Nostr via Primal",
  "Stringer on Instagram": "Stringer no Instagram",
  "Stringer on Facebook": "Stringer no Facebook",
  "Stringer on LinkedIn": "Stringer no LinkedIn",
  "Stringer on YouTube": "Stringer no YouTube",
  "Stringer World News": "Stringer \u2014 Not\xEDcias em portugu\xEAs",
  "Around the world": "Em l\xEDngua portuguesa",
  "Global Newswire": "Not\xEDcias em portugu\xEAs",
  "Courageous Stories": "Reportagens corajosas",
  "Headlines from global publishers.": "Manchetes de fontes em l\xEDngua portuguesa.",
  "Beyond the headlines": "Al\xE9m das manchetes",
  "Stringer's Courageous Stories": "Reportagens corajosas da Stringer",
  "Reporting selected by The Stringer Foundation.": "Reportagens selecionadas pela The Stringer Foundation.",
  "Explore the Stringer collection": "Explore a cole\xE7\xE3o da Stringer",
  "Enable JavaScript to load the news collection, or": "Ative o JavaScript para carregar as not\xEDcias ou",
  "read Courageous Stories on Stringer\u2019s website": "leia as reportagens corajosas no site da Stringer",
  "The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.": "A The Stringer Foundation (EIN: 33-4278131) \xE9 uma organiza\xE7\xE3o sem fins lucrativos 501(c)(3).",
  "Support courageous journalism": "Apoie o jornalismo corajoso",
  "Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.": "Contribua para ampliar o jornalismo corajoso e apoiar a pr\xF3xima gera\xE7\xE3o de rep\xF3rteres.",
  "Footer navigation": "Navega\xE7\xE3o do rodap\xE9",
  "Explore Stringer": "Conhe\xE7a a Stringer",
  "Our mission": "Nossa miss\xE3o",
  "Stringer Awards": "Pr\xEAmios Stringer",
  "Courageous stories": "Reportagens corajosas",
  "Stories belong to their original publishers. Follow each headline to read or watch the original reporting.": "As reportagens pertencem \xE0s fontes originais. Siga cada manchete para ler ou assistir \xE0 reportagem original.",
  "Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:": "As imagens de pr\xE9via, incluindo cart\xF5es de redes sociais, pertencem aos respectivos titulares. A exibi\xE7\xE3o n\xE3o implica endosso nem direitos de reutiliza\xE7\xE3o. Direitos ou remo\xE7\xE3o:"
};
var portugal = {
  "Loading \xB7 {seconds} s elapsed": "A carregar \xB7 {seconds} s decorridos",
  "loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories": "a carregar \xB7 {seconds} s decorridos \xB7 {received}/{total} not\xEDcias",
  "Checking for updates\u2026": "A verificar atualiza\xE7\xF5es\u2026",
  "Connecting to news relays\u2026": "A ligar aos relays de not\xEDcias\u2026",
  "Verified collection. Loading published stories\u2026": "Cole\xE7\xE3o verificada. A carregar not\xEDcias publicadas\u2026",
  "Your choices are saved in this browser.": "As suas escolhas ficam guardadas neste navegador.",
  "Search sources": "Pesquisar fontes",
  "No matching sources.": "Nenhuma fonte corresponde \xE0 pesquisa.",
  "May require subscription": "Pode exigir subscri\xE7\xE3o",
  "Donate now": "Fa\xE7a um donativo",
  "Donate": "Fazer um donativo",
  "Contact us": "Contactos",
  "Awards": "Pr\xE9mios",
  "Stringer Awards": "Pr\xE9mios Stringer",
  "Loading headlines\u2026": "A carregar manchetes\u2026",
  "Loading news\u2026": "A carregar not\xEDcias\u2026",
  "Loading courageous stories\u2026": "A carregar reportagens corajosas\u2026",
  "Loading the latest published collection\u2026": "A carregar a cole\xE7\xE3o mais recente\u2026",
  "Courageous stories unavailable. You can still visit the Stringer collection below.": "As reportagens est\xE3o indispon\xEDveis. Pode visitar a cole\xE7\xE3o da Stringer abaixo.",
  "The news collection is unavailable. We\u2019ll retry automatically.": "As not\xEDcias est\xE3o indispon\xEDveis. Voltaremos a tentar automaticamente.",
  "Local time ({zone})": "Hora local ({zone})",
  " Showing previously collected stories.": " A mostrar not\xEDcias obtidas anteriormente.",
  "Our mission": "A nossa miss\xE3o",
  "Explore the Stringer collection": "Explore a cole\xE7\xE3o da Stringer"
};
var EDITIONS = [
  { path: "", locale: "en-US", label: "EN", direction: "ltr" },
  { path: "br", locale: "pt-BR", label: "Portugu\xEAs (Brasil)", direction: "ltr" },
  { path: "pt", locale: "pt-PT", label: "Portugu\xEAs (Portugal)", direction: "ltr" },
  { path: "fr", locale: "fr", label: "Fran\xE7ais", direction: "ltr" },
  { path: "es", locale: "es", label: "Espa\xF1ol", direction: "ltr" },
  { path: "ar", locale: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", direction: "rtl" },
  { path: "zh", locale: "zh", label: "\u4E2D\u6587", direction: "ltr" },
  { path: "ru", locale: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", direction: "ltr" },
  { path: "nl", locale: "nl", label: "Nederlands", direction: "ltr" },
  { path: "de", locale: "de", label: "Deutsch", direction: "ltr" }
];
var dictionaries = { fr: fr_default, es: es_default, ar: ar_default, zh: zh_default, ru: ru_default, nl: nl_default, de: de_default };
function localeForLanguage(language) {
  const normalized = language.toLowerCase();
  if (normalized === "pt-pt") return "pt-PT";
  const base = normalized.split("-")[0];
  if (base === "pt") return "pt-BR";
  return EDITIONS.find((edition) => edition.locale === base)?.locale ?? "en-US";
}
function translator(language) {
  const locale2 = localeForLanguage(language);
  return (message, values = {}) => {
    const translated = locale2 === "pt-PT" ? portugal[message] ?? portuguese[message] ?? message : locale2 === "pt-BR" ? portuguese[message] ?? message : dictionaries[locale2]?.[message] ?? message;
    return translated.replace(/\{([a-zA-Z]+)\}/g, (whole, key) => values[key] === void 0 ? whole : String(values[key]));
  };
}

// portuguese-sources.ts
var PORTUGUESE_SOURCES = Object.freeze([
  { "id": "pt-actualidadereligiosa", "name": "Actualidade Religiosa", "homepage": "https://actualidadereligiosa.blogspot.com", "feeds": [{ "url": "https://actualidadereligiosa.blogspot.com/feeds/posts/default?alt=rss", "pubkey": "95cd1be28e3093719d9ea4cb18b9dafcaecb1c6113706cf38d9f99db44122558" }] },
  { "id": "pt-agenciabrasil", "name": "Ag\xEAncia Brasil", "homepage": "http://agenciabrasil.ebc.com.br", "feeds": [{ "url": "http://agenciabrasil.ebc.com.br/rss/economia/feed.xml", "pubkey": "cd9b1e5666bc80aea18becf6cf0e42062f219d515f5ad880422613ef4498b8a2" }, { "url": "http://agenciabrasil.ebc.com.br/rss/direitos-humanos/feed.xml", "pubkey": "48ef2837462cfddb2eed727c11620868c7a48c111d618831c28c59a60e90e354" }] },
  { "id": "pt-agendadopoder", "name": "Agenda do Poder", "homepage": "https://agendadopoder.com.br", "feeds": [{ "url": "https://agendadopoder.com.br/feed/", "pubkey": "4273e9abb870526549c7fde955aae7c1029dde9457b6dd1c1a93bef21a058cc0" }] },
  { "id": "pt-airway", "name": "Airway", "homepage": "https://www.airway.com.br", "feeds": [{ "url": "https://www.airway.com.br/feed", "pubkey": "692c6a84e21f4c29122b1bc5e87f317896cf3cb2d018bb3c6c2a4934030ee92b" }] },
  { "id": "pt-areabitcoin", "name": "\xC1rea Bitcoin", "homepage": "https://blog.areabitcoin.com.br", "feeds": [{ "url": "https://blog.areabitcoin.com.br/feed", "pubkey": "b72af3bc977b870eb9d1024c94db79d69a1552a647c1239a959ac986f3adee63" }, { "url": "https://blog.areabitcoin.com.br/rss", "pubkey": "0d6a565bdd01b152c7d5f5ad5f7709c2bc05fecfac6f39f665f6d46a9abb7543" }] },
  { "id": "pt-autopapo", "name": "AutoPapo", "homepage": "https://autopapo.com.br", "feeds": [{ "url": "https://autopapo.com.br/feed/", "pubkey": "9575ede1932622c20345cebca7c2e22758badb093b9610d248c695e74c23b4d8" }] },
  { "id": "pt-bcb", "name": "Banco Central do Brasil", "homepage": "https://www.bcb.gov.br", "feeds": [{ "url": "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias", "pubkey": "ff60a7516e281bd39cae257c3811c62fed2620e7bbac9686c5f3ec8ae188431c" }] },
  { "id": "pt-blocktrends", "name": "BlockTrends", "homepage": "https://blocktrends.com.br", "feeds": [{ "url": "https://blocktrends.com.br/feed", "pubkey": "f865b8e3548b6deebb8f7df4f3669d118159f6c1c4dc8de1b340fe0a1926953b" }, { "url": "https://blocktrends.com.br/rss", "pubkey": "603813a2dcc06dfc7887b732890f706d81a75acc7a3651b6310870b808eb234b" }] },
  { "id": "pt-bmcnews", "name": "BMC News", "homepage": "https://bmcnews.com.br", "feeds": [{ "url": "https://bmcnews.com.br/feed/", "pubkey": "93c96c02bc9ac4b1910103edf7f2331a2243817274f44eded39be6f3739ef2fe" }] },
  { "id": "pt-bpmoney", "name": "BP Money", "homepage": "https://bpmoney.com.br", "feeds": [{ "url": "https://bpmoney.com.br/feed/", "pubkey": "5e3f8857e40f3a4a9357e70f9b2157b825a721fcf02a40d09cae38460fc35a29" }] },
  { "id": "pt-camara", "name": "C\xE2mara dos Deputados", "homepage": "https://www.camara.leg.br", "feeds": [{ "url": "https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA", "pubkey": "ac5b054e9edc027a2aa403661125893eebcd874318d81c16811b5506250ea4a9" }, { "url": "https://www.camara.leg.br/noticias/rss/ultimas-noticias", "pubkey": "68bcb38c3fe7588c039b537a4f93322a79baeae97b7388a8d044c3b41d95b142" }, { "url": "https://www.camara.leg.br/noticias/rss/dinamico/ELEICOES", "pubkey": "153d8c5cae3dc9399a459326047266adc47ed1d55f72b66fd18b1ecf7b428fef" }] },
  { "id": "pt-cnnbrasil", "name": "CNN Brasil", "homepage": "https://www.cnnbrasil.com.br", "feeds": [{ "url": "https://www.cnnbrasil.com.br/feed/", "pubkey": "94a21e428ef1e48273a3d011b6a0ef8e9f77663546661e1b2f9acffa1d1a8d6e" }] },
  { "id": "pt-comboinfinito", "name": "Combo Infinito", "homepage": "https://www.comboinfinito.com.br", "feeds": [{ "url": "https://www.comboinfinito.com.br/principal/feed/", "pubkey": "2d6f13cf18695c50cfcfec3e933b0ea8668d8ff40af9a82899da05aacf05f20f" }, { "url": "https://www.comboinfinito.com.br/principal/rss", "pubkey": "92bb85a5a13a3969c469d412811cc4eb84296c43332d097d1db803fb9133f96e" }, { "url": "https://www.comboinfinito.com.br/principal/feed", "pubkey": "266d5c0771b831622e6ce7a8ca8906a898ba82f987ae37e138453fe269a54fba" }] },
  { "id": "pt-concursosnobrasil", "name": "Concursos no Brasil", "homepage": "https://concursosnobrasil.com", "feeds": [{ "url": "https://concursosnobrasil.com/feed/", "pubkey": "74e06a5e90e7319614d60586b6c7d39202893cd84d3c83960fc8cba7bafb71d7" }] },
  { "id": "pt-conexaopolitica", "name": "Conex\xE3o Pol\xEDtica", "homepage": "https://www.conexaopolitica.com.br", "feeds": [{ "url": "https://www.conexaopolitica.com.br/feed", "pubkey": "bf93ad94b575216db38451be8a6a0811ae690c92a57bd677872d3821bc17d0a6" }] },
  { "id": "pt-conjur", "name": "Consultor Jur\xEDdico", "homepage": "https://www.conjur.com.br", "feeds": [{ "url": "https://www.conjur.com.br/feed/", "pubkey": "d6546832c42ad76282942cb4975532ca8ff5e6833c8cb7b70d96439f9200e84e" }] },
  { "id": "pt-convergenciadigital", "name": "Converg\xEAncia Digital", "homepage": "https://convergenciadigital.com.br", "feeds": [{ "url": "https://convergenciadigital.com.br/feed/", "pubkey": "b84ef6c32ae8cc3324acc9df311ff7423f93b2906fca599015e66a15394591cc" }] },
  { "id": "pt-correiobraziliense", "name": "Correio Braziliense", "homepage": "https://www.correiobraziliense.com.br", "feeds": [{ "url": "https://www.correiobraziliense.com.br/feed", "pubkey": "e530edde9b9bcb1d38c6750fadc4e4e276ce7b899becd28b2e522fa211f4eb38" }, { "url": "https://bsky.app/profile/correiocb.bsky.social/rss", "pubkey": "cab418d67811b26e891fd7c0700e132c9f175c85eec75b0e855170daf12467f9", "social": "Bluesky" }] },
  { "id": "pt-criptofacil", "name": "CriptoF\xE1cil", "homepage": "https://www.criptofacil.com", "feeds": [{ "url": "https://www.criptofacil.com/feed/", "pubkey": "8c5425fca0bfa585fae6e1f86217f33fa37324df953c736ddc2d15ff5c4d8908" }] },
  { "id": "pt-crusoe", "name": "Cruso\xE9", "homepage": "https://crusoe.com.br", "feeds": [{ "url": "https://crusoe.com.br/feed/", "pubkey": "3b156efe76bfcbb1beac8aa25bdadb18f0bd890afa6d77e2660ee3881c4b3fe3" }] },
  { "id": "pt-desbugados", "name": "Desbugados", "homepage": "https://desbugados.com.br", "feeds": [{ "url": "https://desbugados.com.br/atom.xml", "pubkey": "9026d985a84509fce8d83adb35112c3bad2337fa953285349ba56b04c9924c4b" }] },
  { "id": "pt-diariodobrasilnoticias", "name": "Di\xE1rio do Brasil Not\xEDcias", "homepage": "https://diariodobrasilnoticias.com.br", "feeds": [{ "url": "https://diariodobrasilnoticias.com.br/rss", "pubkey": "8c78efe9cc3355de01c59af679d98d23754a69b9509651500fa95c8e4a073900" }] },
  { "id": "pt-diariodotransporte", "name": "Di\xE1rio do Transporte", "homepage": "https://diariodotransporte.com.br", "feeds": [{ "url": "https://diariodotransporte.com.br/feed/", "pubkey": "41b6f0a937ae6891866a4e5ab4dff5f5b38076839a36d6be4f8e81ca3c09af1e" }] },
  { "id": "pt-diolinux", "name": "Diolinux Plus", "homepage": "https://plus.diolinux.com.br", "feeds": [{ "url": "https://plus.diolinux.com.br/c/noticias-tecnologia/20.rss", "pubkey": "008c381c154110eb19618e9dfd421ca78cf3a7b3dfb0c87d323bc176e892ec57" }] },
  { "id": "pt-direitaonline", "name": "Direita Online", "homepage": "https://direitaonline.com.br", "feeds": [{ "url": "https://direitaonline.com.br/rss", "pubkey": "1fd02acc609309e859baabc79e1525c5994409156eef9cf015e15bc3554bf7c9" }, { "url": "https://direitaonline.com.br/feed/", "pubkey": "ccb6ff128ce8d371e60304532df0f4b188b0229d39eacf6d520a2d304c57dd90" }] },
  { "id": "pt-epochtimes", "name": "Epoch Times Brasil", "homepage": "https://www.epochtimes.com.br", "feeds": [{ "url": "https://www.epochtimes.com.br/rss-feeds", "pubkey": "82f8ff1a9860cdcee110a48ff18ad47129f61063face346244e18e2505777377" }] },
  { "id": "pt-estadao", "name": "Estad\xE3o (perfil Bluesky)", "homepage": "https://bsky.app/profile/estadao.com.br", "feeds": [{ "url": "https://bsky.app/profile/estadao.com.br/rss", "pubkey": "c1fe1bc5c17d3b1a6f1944e8b58872fc0da975bc9b65bb62a0fe868d0e1800cf", "social": "Bluesky" }] },
  { "id": "pt-em", "name": "Estado de Minas", "homepage": "https://www.em.com.br", "feeds": [{ "url": "https://www.em.com.br/feed", "pubkey": "7d67e49b3c3ca2f0019c3d98c08f49f80bae2e5562655678fc527d52d6e88e21" }] },
  { "id": "pt-estrategiaconcursos", "name": "Estrat\xE9gia Concursos", "homepage": "https://www.estrategiaconcursos.com.br", "feeds": [{ "url": "https://www.estrategiaconcursos.com.br/blog/concursos/rj/feed/", "pubkey": "b9610843680c8c38321037274abc1356c09931959fe9a7bba62e668ea34e777a" }, { "url": "https://www.estrategiaconcursos.com.br/blog/concursos/sp/feed/", "pubkey": "0bd67f90ebe0e74ce1a5d207e5c177707b0e190108b7839e4a738a43dfe2b73d" }] },
  { "id": "pt-euronews", "name": "Euronews em portugu\xEAs", "homepage": "https://pt.euronews.com", "feeds": [{ "url": "https://pt.euronews.com/rss", "pubkey": "0cd54221d5ca8405cbf7761de3f1a0d0c02f92fdb024b299a0f4093bce9e714f" }] },
  { "id": "pt-expresso", "name": "Expresso", "homepage": "https://rss.impresa.pt", "feeds": [{ "url": "https://rss.impresa.pt/feed/latest/expresso.rss", "pubkey": "f7f3321e337343168bbccb8d8b7e10fe1a2692e86176766adb855528d52e96a9" }] },
  { "id": "pt-extra", "name": "Extra (perfil Bluesky)", "homepage": "https://bsky.app/profile/jornal-extra.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/jornal-extra.bsky.social/rss", "pubkey": "bacd113c9ad75a138b6413f8f348c18578123ba527ba5e6f471313281a54db92", "social": "Bluesky" }] },
  { "id": "pt-fernandoulrich", "name": "Fernando Ulrich (espelho social)", "homepage": "https://nitter.poast.org", "feeds": [{ "url": "https://nitter.poast.org/fernandoulrich/rss", "pubkey": "6f7deaa0f1551292bd7ef0d8c6e961fbb66eaa13037438e895ebdf3c3ec26e08", "social": "espelho social" }] },
  { "id": "pt-flowgames", "name": "Flow Games", "homepage": "https://flowgames.gg", "feeds": [{ "url": "https://flowgames.gg/feed/", "pubkey": "dc68ed2a527b21bc56fae87177fad0065336253567604f84dffe7dc9233242e8" }, { "url": "https://flowgames.gg/rss", "pubkey": "2c92282a4015eb77e6501b52ef4a0d463904accce1b05100e31f627cb4d82cc5" }] },
  { "id": "pt-flup", "name": "FLUP \u2014 Universidade do Porto", "homepage": "https://sigarra.up.pt", "feeds": [{ "url": "https://sigarra.up.pt/flup/noticias_web.rss?p_grupo_noticias=24", "pubkey": "d43e5b1fb9d49dd50fdd40380f74b91d63e448e9837df272da7fa212da1c8611" }] },
  { "id": "pt-folha", "name": "Folha de S.Paulo", "homepage": "https://bsky.app/profile/folha.com", "feeds": [{ "url": "https://bsky.app/profile/folha.com/rss", "pubkey": "c114d0747af9557c95f80f3a26a1b1aaa7b7c959b459cdd4d353b9dcdefe883f", "social": "Bluesky" }, { "url": "https://feeds.folha.uol.com.br/poder/rss091.xml", "pubkey": "0d4920863a3fdb694910c77a8380134e1a8bd728e8bde49559649d186acbfef7" }, { "url": "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml", "pubkey": "da45c2d17ace835f8d78990c293995e7b73ee87e58cec40bc408c637d2488d65" }, { "url": "https://feeds.folha.uol.com.br/mercado/rss091.xml", "pubkey": "b833768ba6022e399800da68b2dcd487b934916cd5dcc15506e9e6252acc910f" }, { "url": "https://feeds.folha.uol.com.br/tec/rss091.xml", "pubkey": "feb43e41005e9fd537def140a19222d00cc2e1c3cc234f7c955d6cc1631ec941" }] },
  { "id": "pt-gameplayscassi", "name": "Gameplayscassi", "homepage": "https://gameplayscassi.com.br", "feeds": [{ "url": "https://gameplayscassi.com.br/rss", "pubkey": "7480d25eb1073e0456842c3783e338618433a10fb5e5aaa349330b37a1171cfa" }] },
  { "id": "pt-gazetabrasil", "name": "Gazeta Brasil", "homepage": "https://gazetabrasil.com.br", "feeds": [{ "url": "https://gazetabrasil.com.br/feed", "pubkey": "6da9b80c4ab7609dd52d24f0263b73e658a30b2894615f38984f83662aeb0906" }] },
  { "id": "pt-gazetadopovo", "name": "Gazeta do Povo", "homepage": "https://www.gazetadopovo.com.br", "feeds": [{ "url": "https://www.gazetadopovo.com.br/feed/rss/economia.xml", "pubkey": "cdcbf1384f16d8a072b5b16c8f9493875b6de2449c8e160128a7b11ee735fa8a" }, { "url": "https://www.gazetadopovo.com.br/feed/rss/mundo.xml", "pubkey": "2510e87290cecb6698380d5a032c2db324fb6ad2ea60288658f0fc73266ef862" }] },
  { "id": "pt-gazetaesportiva", "name": "Gazeta Esportiva", "homepage": "https://www.gazetaesportiva.com", "feeds": [{ "url": "https://www.gazetaesportiva.com/feed", "pubkey": "a4b4449462deebce47aaeb734e9d696733504429855476d951d142761ddcdef4" }, { "url": "https://www.gazetaesportiva.com/feed/", "pubkey": "d6aac790b04b58862c9375be01ccc9956ed24a1c371229ad717aca877277035c" }, { "url": "https://www.gazetaesportiva.com/rss", "pubkey": "5e70920cf87dd90648445de1590e1171c481b2684f0e1146dcdaae55b8fe708b" }, { "url": "https://www.gazetaesportiva.com/futebol/futebol-internacional/feed/", "pubkey": "583f24ca3842533bd95779c27f754237668dd08fd69cd851340831663380e2fa" }, { "url": "https://www.gazetaesportiva.com/futebol/futebol-internacional/feed/rss", "pubkey": "d32aa70cc0938184a386475be5776f332f44647cc2413d60624d565ad7c6ca62" }] },
  { "id": "pt-ge", "name": "ge", "homepage": "https://ge.globo.com", "feeds": [{ "url": "https://ge.globo.com/ESP/Noticia/Rss/0,,AS0-4271,00.xml", "pubkey": "531cd3a882a16803f13d8a60e5bcabf03e3f51c31a82a349e1fc7f292dcef4bc" }, { "url": "https://bsky.app/profile/geglobooficial.bsky.social/rss", "pubkey": "d25605406071af76a5ad5b35d5da1bc5f1946836b53d2b18be17af3d71f02952", "social": "Bluesky" }] },
  { "id": "pt-globonews", "name": "GloboNews (perfil Bluesky)", "homepage": "https://bsky.app/profile/globo-news.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/globo-news.bsky.social/rss", "pubkey": "fd782540366f8b1307292c85d1eee05a79b21cc362188dcc3ab7727f44cebc9f", "social": "Bluesky" }] },
  { "id": "pt-gov", "name": "Governo do Brasil", "homepage": "https://www.gov.br", "feeds": [{ "url": "https://www.gov.br/pt-br/noticias/financas-impostos-e-gestao-publica/RSS", "pubkey": "2191429dc68c051f8d779daccc61b9dc18465925ba6e7ef408ecf0dd4bcfcbcd" }, { "url": "https://www.gov.br/pt-br/noticias/mais-noticias/RSS", "pubkey": "71b7bd72834d553f5c5f38a4d5c40d768a8a6ffc45326a00e42266827e047732" }] },
  { "id": "pt-grandepremio", "name": "Grande Pr\xEAmio", "homepage": "https://bsky.app/profile/grandepremio.com.br", "feeds": [{ "url": "https://bsky.app/profile/grandepremio.com.br/rss", "pubkey": "468591a5108da268008de2568425ba246f08001c4321401c2de2446905f62490", "social": "Bluesky" }] },
  { "id": "pt-hardware", "name": "Hardware.com.br", "homepage": "https://www.hardware.com.br", "feeds": [{ "url": "https://www.hardware.com.br/feed/", "pubkey": "5d786d8180f75d9bdfa183ef5585a1e59b15d61cef9f5e38f48827e6421fd606" }] },
  { "id": "pt-infodefportugal", "name": "InfodefPORTUGAL (Telegram)", "homepage": "https://ch2rss.fflow.net", "feeds": [{ "url": "https://ch2rss.fflow.net/infodefPORTUGAL", "pubkey": "af7347bd7c45c618e2b7dbffcda57662965e157353d32676e63d42d481d11143", "social": "Telegram" }] },
  { "id": "pt-infomoney", "name": "InfoMoney", "homepage": "https://bsky.app/profile/infomoneyoficial.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/infomoneyoficial.bsky.social/rss", "pubkey": "7c3192f3af0bed82512473b8fe8e50665f288bd0166aeff67ded91a0dff2440b", "social": "Bluesky" }, { "url": "https://www.infomoney.com.br/feed/", "pubkey": "be89769026a50d3d853802718afce01c4524afa1df5ac04d49f25f6511336fb5" }] },
  { "id": "pt-inmet", "name": "INMET", "homepage": "https://bsky.app/profile/inmet.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/inmet.bsky.social/rss", "pubkey": "25650be7018d673192cde103a186c7e83e508c8dfb838c50939bf5567f85889e", "social": "Bluesky" }, { "url": "https://apiprevmet3.inmet.gov.br/avisos/rss", "pubkey": "4b1f3a00aa9998edc5b4d1709fe199739e9fad7022867b363a8e6c769735d959" }] },
  { "id": "pt-inovacaotecnologica", "name": "Inova\xE7\xE3o Tecnol\xF3gica", "homepage": "https://bsky.app/profile/inovacaotecnologica.com.br", "feeds": [{ "url": "https://bsky.app/profile/inovacaotecnologica.com.br/rss", "pubkey": "fcb146d4296c101fdf31434021f3c13394e7dbd30c1ca291f485107f2fe39fe1", "social": "Bluesky" }] },
  { "id": "pt-institutolibertario", "name": "Instituto Libert\xE1rio Crist\xE3o", "homepage": "https://institutolibertariocristao.org", "feeds": [{ "url": "https://institutolibertariocristao.org/feed", "pubkey": "cfaaf350b75eb095b41dd31fc42166e3ed1d5dd05b9c50f16053ad86bc2857cd" }, { "url": "https://institutolibertariocristao.org/rss", "pubkey": "cbd85ff7e91539cb07dc3ec5b7dcf0fdc42d6791a2fff00008b254031b476779" }, { "url": "https://institutolibertariocristao.org/category/artigos/feed", "pubkey": "e54bedc40c5709be15e1eb0c9de7db7658066894f45e153a2aae65590c07076b" }] },
  { "id": "pt-rothbardbrasil", "name": "Instituto Rothbard Brasil", "homepage": "https://rothbardbrasil.com", "feeds": [{ "url": "https://rothbardbrasil.com/feed", "pubkey": "596b0dec684ce8878eefc00e1d5095bbae1ae71aa600662aac51ff8c4f9e26d5" }] },
  { "id": "pt-investnews", "name": "InvestNews", "homepage": "https://investnews.com.br", "feeds": [{ "url": "https://investnews.com.br/feed", "pubkey": "bf250cd8978cc1c7ae3a480fb7bbffae218931fb9215b21370be5ca30f03b129" }] },
  { "id": "pt-istoe", "name": "Isto\xC9 (perfil Bluesky)", "homepage": "https://bsky.app/profile/istoeonline.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/istoeonline.bsky.social/rss", "pubkey": "b04ee038ae02d03d695953df16520645543e84e6be0d25b8e1f915139df24dfc", "social": "Bluesky" }] },
  { "id": "pt-usp", "name": "Jornal da USP", "homepage": "https://jornal.usp.br", "feeds": [{ "url": "https://jornal.usp.br/feed/", "pubkey": "d108d3f1b901406bf9bf4923a2c96b6bc0214c57f01fe9d92b93bd7817b415eb" }] },
  { "id": "pt-jornaldr1", "name": "Jornal DR1", "homepage": "https://jornaldr1.com.br", "feeds": [{ "url": "https://jornaldr1.com.br/feed/", "pubkey": "2a6034ed227c20b22ba03cd5bcade671850571305f1c88933aef4fe15592f137" }] },
  { "id": "pt-jovempan", "name": "Jovem Pan", "homepage": "https://jovempan.com.br", "feeds": [{ "url": "https://jovempan.com.br/feed", "pubkey": "5f1603dfa34f70b7dcec45025ec9e9e96cdde0791ba719bc923a224436c2b0b3" }] },
  { "id": "pt-jovempanesporte", "name": "Jovem Pan Esporte (perfil Bluesky)", "homepage": "https://bsky.app/profile/jovempanesporte.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/jovempanesporte.bsky.social/rss", "pubkey": "8a40d77e1d3339ad2430e37a27bc51acdbc5b370af9fd7866e0a71ad97b15103", "social": "Bluesky" }] },
  { "id": "pt-livecoins", "name": "Livecoins", "homepage": "https://livecoins.com.br", "feeds": [{ "url": "https://livecoins.com.br/feed/", "pubkey": "eac855b64a8cc46e279c77d3bffc0e69be787dc76663a0351884869e725fb996" }, { "url": "https://livecoins.com.br/feed/rss", "pubkey": "18bc884edb5cd91aa29ec7981324ffbe74e0b9c5dcd5428fa03f2a01bd5ece02" }, { "url": "https://livecoins.com.br/bitcoin/feed", "pubkey": "a8f48dc566c3325bde3a3e989522195bd796af118ff7c9505d8a3c03f9f51930" }] },
  { "id": "pt-megacurioso", "name": "Mega Curioso", "homepage": "https://strapi.megacurioso.com.br", "feeds": [{ "url": "https://strapi.megacurioso.com.br/api/feed/10", "pubkey": "2d3d962736bfa7ff2557f25838ce11cf25483b5f7e877fee8b4b54d4f12bfefd" }] },
  { "id": "pt-metropoles", "name": "Metr\xF3poles", "homepage": "https://bsky.app/profile/metropoles.com", "feeds": [{ "url": "https://bsky.app/profile/metropoles.com/rss", "pubkey": "5f03a9cad7e9c4c2b859e0f0632bad3e104304d95716af1814327d5a9d6711aa", "social": "Bluesky" }] },
  { "id": "pt-metsul", "name": "MetSul", "homepage": "https://bsky.app/profile/metsul.com", "feeds": [{ "url": "https://bsky.app/profile/metsul.com/rss", "pubkey": "cca5c77f6e914ddd671c2bfc394f7eeb6212b09d082eb8f2974eb0bf50e26dd8", "social": "Bluesky" }] },
  { "id": "pt-meups", "name": "MeuPlayStation", "homepage": "https://meups.com.br", "feeds": [{ "url": "https://meups.com.br/feed/", "pubkey": "62a4f993934dee97823c13c69ba3366d0cc7551017a50cdb524f8f41d79e3ceb" }, { "url": "https://meups.com.br/rss", "pubkey": "282e04ca1e9bcea38e2449ac6568a5399eab8da3c3403ff5589e43156f3913de" }] },
  { "id": "pt-mundoconectado", "name": "Mundo Conectado", "homepage": "https://www.mundoconectado.com.br", "feeds": [{ "url": "https://www.mundoconectado.com.br/feed/", "pubkey": "509987a148a2cc75b540cb60bb0807751aeff7f1c81a33ebef63b5b9c04909ac" }] },
  { "id": "pt-neofeed", "name": "NeoFeed", "homepage": "https://neofeed.com.br", "feeds": [{ "url": "https://neofeed.com.br/feed/", "pubkey": "3332220e206c693b68f075b57df6e6b1660c72b161d62ca8115b5df015ed9876" }] },
  { "id": "pt-noticiasaominuto", "name": "Not\xEDcias ao Minuto", "homepage": "https://www.noticiasaominuto.com.br", "feeds": [{ "url": "https://www.noticiasaominuto.com.br/rss/ultima-hora", "pubkey": "edce5dcaa82a4621373ef1815e6d903622a6ce558b6a6333e547aabfc1b17abf" }] },
  { "id": "pt-oantagonista", "name": "O Antagonista", "homepage": "https://oantagonista.com.br", "feeds": [{ "url": "https://oantagonista.com.br/ultimas-noticias/feed/", "pubkey": "80d5c3ff9ca2c2f382316e2fae9ee9b0919925e01bb5c600cf738e0cd862d60d" }, { "url": "https://oantagonista.com.br/feed/", "pubkey": "26a798c59a809061ca427022a4d229821430ce9367f09846dbf767b3308c7bc9" }] },
  { "id": "pt-odia", "name": "O Dia", "homepage": "https://odia.ig.com.br", "feeds": [{ "url": "https://odia.ig.com.br/_conteudo/ultimas-noticias/rss.xml", "pubkey": "f59723d7b51c6005e586e55d44d6459bb9829abc51a1a2ec4503e7db9a3d8e49" }] },
  { "id": "pt-observador", "name": "Observador", "homepage": "https://observador.pt", "feeds": [{ "url": "https://observador.pt/feed/", "pubkey": "32417afec283da57878db430b24445339b2530a24336c6e4ddc08c523839790f" }] },
  { "id": "pt-ogol", "name": "oGol", "homepage": "https://www.ogol.com.br", "feeds": [{ "url": "https://www.ogol.com.br/rss/noticias.php", "pubkey": "e58d33cd89d9281dd1f2e13897e98a899f314a1190cfe1d469961693a0b05f30" }] },
  { "id": "pt-olhardigital", "name": "Olhar Digital", "homepage": "https://olhardigital.com.br", "feeds": [{ "url": "https://olhardigital.com.br/feed", "pubkey": "cdc291d23cf474d7deca5da70b591baefbef9e0f08e9a8a7b939c19ef01c66df" }, { "url": "https://olhardigital.com.br/feed/", "pubkey": "f3bc3a5ed8c8294cc4f6f30f71f7bb89a018ec8941a90e49befb1ccc9e25024d" }] },
  { "id": "pt-omelete", "name": "Omelete", "homepage": "https://bsky.app/profile/omelete.com.br", "feeds": [{ "url": "https://bsky.app/profile/omelete.com.br/rss", "pubkey": "136acf9d7d05e11f6ee7c72269ea889f86075904b1fa0a14535507e873ab921e", "social": "Bluesky" }] },
  { "id": "pt-fapesp", "name": "Pesquisa FAPESP", "homepage": "https://revistapesquisa.fapesp.br", "feeds": [{ "url": "https://revistapesquisa.fapesp.br/feed/", "pubkey": "c6db055b40e0ed366b6c317080bbf27d57cc644bc434b41232c956f519267c74" }] },
  { "id": "pt-phvox", "name": "PHVOX", "homepage": "https://news.phvox.com.br", "feeds": [{ "url": "https://news.phvox.com.br/feed", "pubkey": "cbb62fa6f3846c2f9b8b33a4cfe8e4744cc6d73171e266ac2c230a428b2a2f07" }] },
  { "id": "pt-piaui", "name": "piau\xED", "homepage": "https://piaui.uol.com.br", "feeds": [{ "url": "https://piaui.uol.com.br/feed", "pubkey": "1f11c51a1c2a7e14e5e6cd8cebf12624a019b7deef83a9e9b3902827f512808e" }] },
  { "id": "pt-pleno", "name": "Pleno.News", "homepage": "https://pleno.news", "feeds": [{ "url": "https://pleno.news/rss", "pubkey": "eb4a5b7cced0e18c54f54572450b5581193261e983a9739c78e964e0f92adba5" }] },
  { "id": "pt-poder360", "name": "Poder360", "homepage": "https://www.poder360.com.br", "feeds": [{ "url": "https://www.poder360.com.br/feed", "pubkey": "096ec6d4c8be83e54d04a124cdbd77a6e3865f6758897e85e2b600dd90d22fd6" }] },
  { "id": "pt-contabeis", "name": "Portal Cont\xE1beis", "homepage": "https://www.contabeis.com.br", "feeds": [{ "url": "https://www.contabeis.com.br/rss/noticias", "pubkey": "e1e91c372d58c5c00c1c42720e312c7ced06a0fb7a3e09a96ad9868178aa6407" }] },
  { "id": "pt-portaldobitcoin", "name": "Portal do Bitcoin", "homepage": "https://portaldobitcoin.uol.com.br", "feeds": [{ "url": "https://portaldobitcoin.uol.com.br/feed", "pubkey": "e8cee057899e3eab03997e020bcb01c5e4d8ce58875fa6e645db1b545e5f2467" }] },
  { "id": "pt-pplware", "name": "Pplware", "homepage": "https://pplware.sapo.pt", "feeds": [{ "url": "https://pplware.sapo.pt/feed/", "pubkey": "235762a604ddfcb6fc2106a3e00bf125aea7e227035e904713636cfef5291f41" }] },
  { "id": "pt-publico", "name": "P\xFAblico", "homepage": "https://feeds.feedburner.com", "feeds": [{ "url": "https://feeds.feedburner.com/PublicoRSS", "pubkey": "410006efd0a4098c12e10e8011a22073cbe724c8bf137d95c9b016458a3e5230" }, { "url": "https://feeds.feedburner.com/PublicoRSS.rss", "pubkey": "e7abc3da18ed5f52bdae8cce00eb0f3699f8d8f5148e73af3d2bf307b34878c3" }] },
  { "id": "pt-quatrorodas", "name": "Quatro Rodas", "homepage": "https://quatrorodas.abril.com.br", "feeds": [{ "url": "https://quatrorodas.abril.com.br/feed", "pubkey": "ed41bd3b391e5814457d41aee80225d2ce75f17e806aa67c23aa205e5f0f1b68" }] },
  { "id": "pt-r7", "name": "R7 (perfil Bluesky)", "homepage": "https://bsky.app/profile/portal-r7.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/portal-r7.bsky.social/rss", "pubkey": "b7a6d97be1ee57bd1ee5ab7f1ce8e3bc7537b8a40effed2bee10fb1d982e0ff5", "social": "Bluesky" }] },
  { "id": "pt-rapaduratech", "name": "Rapadura Tech", "homepage": "https://rapaduratech.com.br", "feeds": [{ "url": "https://rapaduratech.com.br/feed/", "pubkey": "de10b9618293be4d1f446ad8b9c639e7793c47379eefbc773940285244599a81" }] },
  { "id": "pt-revistacarro", "name": "Revista Carro", "homepage": "https://revistacarro.com.br", "feeds": [{ "url": "https://revistacarro.com.br/feed", "pubkey": "4651f6ba06c9ed58d6b4c47d46827ae29479f817f5eb394322f3972ad62cac00" }] },
  { "id": "pt-rtbrasil", "name": "RT Brasil (perfil Bluesky)", "homepage": "https://bsky.app/profile/rtbrasil.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/rtbrasil.bsky.social/rss", "pubkey": "6504461c1f49503b8de2a991aefd4fff5f72cc257cba791d978d54a2411ef4ae", "social": "Bluesky" }] },
  { "id": "pt-tek", "name": "SAPO Tek", "homepage": "https://tek.sapo.pt", "feeds": [{ "url": "https://tek.sapo.pt/feed/", "pubkey": "df096d11f62e324809ccffd2a4de32149d52407b1e03cc41d42a81b11b8b1814" }] },
  { "id": "pt-setemargens", "name": "Sete Margens", "homepage": "https://setemargens.com", "feeds": [{ "url": "https://setemargens.com/feed/", "pubkey": "7e1e04ee3234636d22feace9251804f258d160acdd73155f7a4b7afa00308a7e" }] },
  { "id": "pt-sportbuzz", "name": "SportBuzz", "homepage": "https://sportbuzz.com.br", "feeds": [{ "url": "https://sportbuzz.com.br/feed/", "pubkey": "8ae206b5445d0046b8870fd93a418d915769bd170668e18639baca0dca5bd39e" }] },
  { "id": "pt-stj", "name": "Superior Tribunal de Justi\xE7a", "homepage": "https://res.stj.jus.br", "feeds": [{ "url": "https://res.stj.jus.br/hrestp-c-portalp/RSS.xml", "pubkey": "4b018600629d9ecdff40c1fa89b805d5e3da092dff7c75da2bd73ad8997cfd50" }] },
  { "id": "pt-terrabrasilnoticias", "name": "Terra Brasil Not\xEDcias", "homepage": "https://terrabrasilnoticias.com", "feeds": [{ "url": "https://terrabrasilnoticias.com/feed", "pubkey": "7faac2c00a0cdec0b2fd165d74e28ed2df919fd4e96f64526853a221868d18f2" }] },
  { "id": "pt-theinvestor", "name": "The Investor", "homepage": "https://theinvestor.com.br", "feeds": [{ "url": "https://theinvestor.com.br/feed", "pubkey": "96e445f633367d5e8d045bc5a98000879d78ee42abfdceee9244e910893f620b" }] },
  { "id": "pt-umdoisesportes", "name": "UmDois Esportes", "homepage": "https://www.umdoisesportes.com.br", "feeds": [{ "url": "https://www.umdoisesportes.com.br/feed/", "pubkey": "e30b7dce07c8b99ebeba50e2a4d57df37deeca5f670478427668ff0f92581aa4" }] },
  { "id": "pt-unifesp", "name": "Unifesp \u2014 Reposit\xF3rio", "homepage": "https://repositorio.unifesp.br", "feeds": [{ "url": "https://repositorio.unifesp.br/server/opensearch/search?format=atom&scope=687744bf-d44a-404f-b3ce-f8bbd8680fdd&query=*", "pubkey": "a6cd1d5b4b6ae116c400a84f1cc47f73e89e4fa503a8e9ea002864c4a3da5f91" }, { "url": "https://repositorio.unifesp.br/server/opensearch/search?format=atom&scope=451c59da-a5b6-45ef-a92b-63e71ef79e38&query=*", "pubkey": "99361519a671fc3e899d7a21f1d67042a2dfb25fe9ca0eb33170048487769800" }] },
  { "id": "pt-up", "name": "Universidade do Porto", "homepage": "https://noticias.up.pt", "feeds": [{ "url": "https://noticias.up.pt/feed/", "pubkey": "d8b138c53e0dec30ca1cfa402c326546dca160092badac7965315b9ea55b3f46" }] },
  { "id": "pt-uol", "name": "UOL (perfil Bluesky)", "homepage": "https://bsky.app/profile/uol.com.br", "feeds": [{ "url": "https://bsky.app/profile/uol.com.br/rss", "pubkey": "7ce27f6cd913c0ee38bbeae74900b63991e586e31ec074ec56f1a16a992b0f21", "social": "Bluesky" }] },
  { "id": "pt-valor", "name": "Valor Econ\xF4mico (perfil Bluesky)", "homepage": "https://bsky.app/profile/valoreconomico.bsky.social", "feeds": [{ "url": "https://bsky.app/profile/valoreconomico.bsky.social/rss", "pubkey": "e4426249d7d0d3142caa305afc4d536997e575b0c7810abab7fc36b1bacb9ef2", "social": "Bluesky" }] },
  { "id": "pt-vrum", "name": "Vrum", "homepage": "https://www.vrum.com.br", "feeds": [{ "url": "https://www.vrum.com.br/feed", "pubkey": "9794253dafecd41fde23e8753dd37c4efc4d3f15ef73d4a7641b464932b630e9" }] },
  { "id": "pt-willtirando", "name": "Will Tirando", "homepage": "http://www.willtirando.com.br", "feeds": [{ "url": "http://www.willtirando.com.br/rss/", "pubkey": "94146551bb0fbc474f220496ac550e0f324d71f6dd1683fd7fae8f5ae757203f" }] }
].map((source) => Object.freeze({ ...source, feeds: Object.freeze(source.feeds.map((feed) => Object.freeze(feed))) })));

// sources/fr.ts
var fr_default2 = [
  {
    "id": "fr-le-monde",
    "name": "Le Monde",
    "homepage": "https://www.lemonde.fr",
    "feeds": [
      {
        "url": "https://www.lemonde.fr/rss/une.xml",
        "pubkey": "71b09828e771b5342ce6b86e69d7e55d33bbb8b00f1f80c2257b6d4c3dca8bc5"
      }
    ]
  },
  {
    "id": "fr-franceinfo",
    "name": "franceinfo",
    "homepage": "https://www.francetvinfo.fr",
    "feeds": [
      {
        "url": "https://www.francetvinfo.fr/titres.rss",
        "pubkey": "211dd9b4482d7869b6c55b88828e7e66ecc1127890e0a9fa14c594fd9fff0558"
      }
    ]
  },
  {
    "id": "fr-le-figaro",
    "name": "Le Figaro",
    "homepage": "https://www.lefigaro.fr",
    "feeds": [
      {
        "url": "https://www.lefigaro.fr/rss/figaro_actualites.xml",
        "pubkey": "8e229ea2bf1aadbabbe2d1874c85ab9ae949b30a8a225d722432dd5147b28c5d"
      }
    ]
  },
  {
    "id": "fr-liberation",
    "name": "Lib\xE9ration",
    "homepage": "https://www.liberation.fr",
    "feeds": [
      {
        "url": "https://www.liberation.fr/arc/outboundfeeds/rss/",
        "pubkey": "461ba946bede05880d1042c1df7d8bbca6a09daabb02f2538258a820161626cf"
      }
    ]
  },
  {
    "id": "fr-rfi",
    "name": "RFI Fran\xE7ais",
    "homepage": "https://www.rfi.fr/fr/",
    "feeds": [
      {
        "url": "https://www.rfi.fr/fr/rss",
        "pubkey": "c59867460d924acf6b0b8dc5f410b6a911aa49e39d3250b9799dc7ab8a580ae2"
      }
    ]
  }
];

// sources/es.ts
var es_default2 = [
  {
    "id": "es-el-pais",
    "name": "EL PA\xCDS",
    "homepage": "https://elpais.com",
    "feeds": [
      {
        "url": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
        "pubkey": "b9a8bce7b78fb5693b64fc6c84213f36bbbb96c5e4e3fe2f2b3648ae76a35f0e"
      },
      {
        "url": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/mexico/portada",
        "pubkey": "3fe9981716a32b978357861c7ebec316a78f6f6da22b2bf49ffa4707a9fb70d3"
      }
    ]
  },
  {
    "id": "es-ole",
    "name": "Ol\xE9 \u2014 deportes",
    "homepage": "https://www.ole.com.ar",
    "feeds": [
      {
        "url": "https://www.ole.com.ar/rss/ultimas-noticias/",
        "pubkey": "fb61df746733b2df8dd2177b6b1e046cac6f39a372b45e5cc8019d5a6d2ff096"
      }
    ]
  }
];

// sources/ar.ts
var arabicSources = Object.freeze([
  {
    id: "ar-al-sharq",
    name: "Al-Sharq",
    homepage: "https://al-sharq.com",
    feeds: [{
      url: "https://m.al-sharq.com/rss/latestNews",
      pubkey: "581bc12e8b87020171b942d22b5310301c20997ba854f72c760b41bb249f83b7"
    }]
  },
  {
    id: "ar-cnn-arabic",
    name: "CNN Arabic",
    homepage: "https://arabic.cnn.com/",
    feeds: [{
      url: "https://arabic.cnn.com/api/v1/rss/rss.xml",
      pubkey: "f94b40ee732c54d3a3ac6e6c39410cb95c01b0ad31531c9226ab70f0e35bd561"
    }]
  }
]);
var ar_default2 = arabicSources;

// sources/zh.ts
var chineseSources = Object.freeze([
  {
    id: "zh-bbc-chinese",
    name: "BBC News \u4E2D\u6587",
    homepage: "https://www.bbc.com/zhongwen/trad",
    feeds: [{
      url: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml",
      pubkey: "10b859ea48b0203d95ca155b956aecaeed4fa7d1874273d85288be2609e22f74"
    }]
  },
  {
    id: "zh-voa-chinese",
    name: "\u7F8E\u56FD\u4E4B\u97F3\u4E2D\u6587\u7F51",
    homepage: "https://www.voachinese.com/",
    feeds: [{
      url: "https://www.voachinese.com/api/zm_yqebbyi",
      pubkey: "ddc3cdf3187c24c298057e55f9eecf249ddcfcd98613c4c92240b090d5cb014f"
    }]
  },
  {
    id: "zh-voa-cantonese",
    name: "\u7F8E\u56FD\u4E4B\u97F3\u7CA4\u8BED",
    homepage: "https://www.voacantonese.com/",
    feeds: [
      { url: "https://www.voacantonese.com/api/zrqtyeuuty", pubkey: "7f15397b229c5dd75498b5b400a46702fb09251960663b908f7ef33ba7ef6e65" },
      { url: "https://www.voacantonese.com/api/z_rt_erut_", pubkey: "5243d6039e5d1f92f8783a1508191eaff810db5d909089c554e06b37fc40a5bb" },
      { url: "https://www.voacantonese.com/api/zyrtyequty", pubkey: "6494cc02242875998b1a7d4f442e060075cb08a4afa79874893f36ce5d7c5b43" },
      { url: "https://www.voacantonese.com/api/zbrtmetut_", pubkey: "9b4ea6d1cea3bbf597a9eee16a0088a93672e18cd983d84dbace57f1a0fb1fd1" },
      { url: "https://www.voacantonese.com/api/zvrtveoutv", pubkey: "f40b3aa933bf05f18b15f2b3e25903503b5d2039b19078b6f069ec56355e27a2" }
    ]
  },
  {
    id: "zh-mingpao",
    name: "\u660E\u62A5",
    homepage: "https://news.mingpao.com/",
    feeds: [{
      url: "https://news.mingpao.com/rss/ins/s00005.xml",
      pubkey: "6983f2df5ee2497cb3f2d0547cdf7dbd780d0e19120f696d1f5e19c0aef793f9"
    }]
  },
  {
    id: "zh-china-news-service",
    name: "\u4E2D\u56FD\u65B0\u95FB\u7F51",
    homepage: "https://www.chinanews.com.cn/",
    feeds: [{
      url: "https://www.chinanews.com.cn/rss/world.xml",
      pubkey: "9fee0f04ee2e3aa1dbae66e0d2361bfe5d4d8296926ed6be639aa8c95f8f0ddd"
    }]
  },
  {
    id: "zh-china-digital-times",
    name: "\u4E2D\u56FD\u6570\u5B57\u65F6\u4EE3",
    homepage: "https://chinadigitaltimes.net/chinese/",
    feeds: [{
      url: "https://chinadigitaltimes.net/chinese/feed",
      pubkey: "86c02f1b134b3bcd39c68d649286c8e0910e020080fd19fe87809f2ad4c2174e"
    }]
  },
  {
    id: "zh-rfi",
    name: "\u6CD5\u56FD\u56FD\u9645\u5E7F\u64AD\u7535\u53F0",
    homepage: "https://www.rfi.fr/cn/",
    feeds: [{
      url: "https://www.rfi.fr/cn/rss",
      pubkey: "abb7971abec2300f0d258aec1dde9a2e857fa115483ad558f8897e45d626a111"
    }]
  },
  {
    id: "zh-kyodo",
    name: "\u5171\u540C\u7F51",
    homepage: "https://tchina.kyodonews.net/",
    feeds: [{
      url: "https://tchina.kyodonews.net/rss/news.xml",
      pubkey: "798514f862787d582db9c2e7f28db421154f175ffcc519ad7327f6a8631c4f1d"
    }]
  }
]);
var zh_default2 = chineseSources;

// sources/ru.ts
var russianSources = Object.freeze([
  {
    id: "ru-novaya-gazeta",
    name: "\u041D\u043E\u0432\u0430\u044F \u0433\u0430\u0437\u0435\u0442\u0430",
    homepage: "https://novayagazeta.ru",
    feeds: [{ url: "https://novayagazeta.ru/feed/rss", pubkey: "24f987722ee5b75bc04350a48ec505f2723b8456acfe20db2bb02196fddbd4fa" }]
  },
  {
    id: "ru-ria-novosti",
    name: "\u0420\u0418\u0410 \u041D\u043E\u0432\u043E\u0441\u0442\u0438",
    homepage: "https://ria.ru",
    feeds: [{ url: "https://ria.ru/export/rss2/archive/index.xml", pubkey: "cfef013a4a8cc320eb60d81ee5684608221e3101eecda62cebcf68acbe1daa39" }]
  },
  {
    id: "ru-vedomosti",
    name: "\u0412\u0435\u0434\u043E\u043C\u043E\u0441\u0442\u0438",
    homepage: "https://www.vedomosti.ru",
    feeds: [{ url: "https://www.vedomosti.ru/rss/news.xml", pubkey: "f0e8d99e36fad8ff9d11f2f277a4efbff29cf50eb2c34ff3a7e04717029bb0e0" }]
  },
  {
    id: "ru-tass",
    name: "\u0422\u0410\u0421\u0421",
    homepage: "https://tass.ru",
    feeds: [{ url: "https://tass.ru/rss/v2.xml", pubkey: "43e738e29cf99e05ee3861df4e904368747044b0e98153edb54d1dea6402a7be" }]
  },
  {
    id: "ru-interfax",
    name: "\u0418\u043D\u0442\u0435\u0440\u0444\u0430\u043A\u0441",
    homepage: "https://www.interfax.ru",
    feeds: [{ url: "https://www.interfax.ru/rss.asp", pubkey: "331146863daf49431309b7ab8b1eb9ae7abc9156add9120251c822e115a2592b" }]
  }
]);
var ru_default2 = russianSources;

// sources/nl.ts
var dutchSources = Object.freeze([
  {
    id: "nl-nos-nieuws",
    name: "NOS Nieuws",
    homepage: "https://nos.nl",
    feeds: [{ url: "https://feeds.nos.nl/nosnieuwsalgemeen", pubkey: "64c524cd15c49f3ce10b8244bbef586f387a48e5ba76d48e71eecde0fd00ef22" }]
  },
  {
    id: "nl-nu",
    name: "NU.nl",
    homepage: "https://www.nu.nl",
    feeds: [{ url: "https://www.nu.nl/rss", pubkey: "d5769fade6ad4dd01cdb5ca9f6836474baf1ebd3713b9263661062c4951e9da1" }]
  },
  {
    id: "nl-volkskrant",
    name: "de Volkskrant",
    homepage: "https://www.volkskrant.nl",
    feeds: [{ url: "https://www.volkskrant.nl/voorpagina/rss.xml", pubkey: "c094a68dd8a38a1c8cd6c6c3e8cb11a0d37d6d9125a3e253808f42cf255c1359" }]
  },
  {
    id: "nl-nos-voetbal",
    name: "NOS Voetbal",
    homepage: "https://nos.nl/voetbal",
    feeds: [{ url: "https://feeds.nos.nl/nosvoetbal", pubkey: "e43d62c227a3622400bd2325345614dd87070bfcb3f6d49bf61427a76b8566fb" }]
  },
  {
    id: "nl-voetbal-international-ajax",
    name: "Voetbal International (Ajax)",
    homepage: "https://www.vi.nl",
    feeds: [{ url: "https://www.vi.nl/feed/news.xml?tag=ajax", pubkey: "0be74b0dfd3c226e6c2f9076ce2c419a9e62d3ac228f499de2f4e04bac6650ce" }]
  },
  {
    id: "nl-ajax1",
    name: "Ajax1",
    homepage: "https://www.ajax1.nl",
    feeds: [{ url: "https://www.ajax1.nl/feed/news.rss", pubkey: "4761e9e11f305b7e1c8bf2871151d238f2128e5d59a6938be67a7af384e97755" }]
  }
]);
var nl_default2 = dutchSources;

// sources/de.ts
var germanSources = Object.freeze([
  {
    id: "de-dw",
    name: "Deutsche Welle",
    homepage: "https://www.dw.com/de/",
    feeds: [{ url: "https://rss.dw.com/atom/rss-de-all", pubkey: "e2a619c564c63c393c8810f7d46f3753c354499b7126f40a61b6d4df1744bcfb" }]
  },
  {
    id: "de-tagesschau",
    name: "tagesschau",
    homepage: "https://www.tagesschau.de",
    feeds: [{ url: "https://www.tagesschau.de/xml/rss2/", pubkey: "c6b6286f7df60c5f3d16300fb4faec90f4d91e175e0025206a905e17f290d3f3" }]
  },
  {
    id: "de-sueddeutsche-zeitung",
    name: "S\xFCddeutsche Zeitung",
    homepage: "https://www.sueddeutsche.de",
    feeds: [{ url: "https://rss.sueddeutsche.de/rss/Alles", pubkey: "3b53d7c142cf0ca909961432b30c5195a14b9d424ee97b401b584b26e04f1f23" }]
  },
  {
    id: "de-berliner-zeitung",
    name: "Berliner Zeitung",
    homepage: "https://www.berliner-zeitung.de",
    feeds: [{ url: "https://www.berliner-zeitung.de/feed.xml", pubkey: "52578b56008fb9a47104810402b74bc2a92b9c9cce01889c84cb5dd1fb177484" }]
  },
  {
    id: "de-rp-online",
    name: "RP ONLINE",
    homepage: "https://rp-online.de",
    feeds: [{ url: "https://rp-online.de/feed.rss", pubkey: "a5806aaac8559e8de88812e639ad037cfc8e9348956ac6512dc7e10d497c3f5e" }]
  },
  {
    id: "de-hessenschau-rhein-main",
    name: "hessenschau Rhein-Main",
    homepage: "https://www.hessenschau.de",
    feeds: [{ url: "https://www.hessenschau.de/rheinmain/index.rss", pubkey: "4212138cd2a0d789ee47140675a16969badf79fb8ac722a0e6dfe2c70802ba44" }]
  }
]);
var de_default2 = germanSources;

// edition-sources.ts
var EDITION_SOURCES = {
  "pt-BR": PORTUGUESE_SOURCES,
  "pt-PT": PORTUGUESE_SOURCES,
  fr: fr_default2,
  es: es_default2,
  ar: ar_default2,
  zh: zh_default2,
  ru: ru_default2,
  nl: nl_default2,
  de: de_default2
};
function sourcesForLocale(language) {
  return EDITION_SOURCES[localeForLanguage(language)] ?? [];
}

// app.ts
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from "./news-model.js?v=98e46a0c524d537c";
import relayConfig from "./relay-config.js?v=98e46a0c524d537c";
import { STRINGER_MEDIA } from "./stringer-media.js?v=98e46a0c524d537c";
function requiredElement(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing reader element: ${selector}`);
  return node;
}
var locale = localeForLanguage(document.documentElement.lang);
var mirrorSources = sourcesForLocale(locale);
var atomstrEdition = mirrorSources.length > 0;
var t = translator(locale);
if (document.querySelector('base[href="/news-assets/"]')) requiredElement(".edition-switcher").hidden = true;
var menuToggle = requiredElement(".header-menu-toggle");
var headerMenu = requiredElement("#header-menu");
function setHeaderMenu(open) {
  headerMenu.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", t(open ? "Close menu" : "Open menu"));
}
menuToggle.addEventListener("click", () => setHeaderMenu(menuToggle.getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setHeaderMenu(false);
    menuToggle.focus();
  }
});
matchMedia("(max-width: 920px)").addEventListener("change", () => setHeaderMenu(false));
var feedback = requiredElement("#refresh-status");
var publisherSources = atomstrEdition ? mirrorSources : SOURCES.filter((source) => source.id !== "stringer");
var sourcePreferenceKey = `stringer-disabled-sources-${locale.startsWith("pt-") ? "pt" : locale}-v1`;
var disabledSources = /* @__PURE__ */ new Set();
try {
  const saved = atomstrEdition ? JSON.parse(localStorage.getItem(sourcePreferenceKey) || "[]") : [];
  if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) {
    disabledSources = new Set(saved.filter((id) => publisherSources.some((source) => source.id === id)));
  }
} catch {
}
var selectedSources = () => publisherSources.filter((source) => !disabledSources.has(source.id)).map((source) => source.id);
var sourceOptions = document.querySelector("#source-options");
for (const source of atomstrEdition ? publisherSources : []) {
  const label = element("label");
  const checkbox = element("input");
  checkbox.type = "checkbox";
  checkbox.value = source.id;
  checkbox.checked = !disabledSources.has(source.id);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) disabledSources.delete(source.id);
    else disabledSources.add(source.id);
    updateSourcePreferences();
  });
  label.append(checkbox, document.createTextNode(source.name));
  sourceOptions?.append(label);
}
function enableAllSources() {
  disabledSources.clear();
  updateSourcePreferences();
}
document.querySelector("#enable-all-sources")?.addEventListener("click", enableAllSources);
function updateSourcePreferences() {
  try {
    localStorage.setItem(sourcePreferenceKey, JSON.stringify([...disabledSources]));
  } catch {
  }
  updateSourceControls();
  if (snapshot) renderWorld();
}
function updateSourceControls() {
  if (!atomstrEdition) return;
  requiredElement("#source-count").textContent = t("{enabled} of {total} enabled", { enabled: selectedSources().length, total: publisherSources.length });
  for (const checkbox of sourceOptions?.querySelectorAll("input") || []) checkbox.checked = !disabledSources.has(checkbox.value);
  requiredElement("#enable-all-sources").disabled = disabledSources.size === 0;
}
updateSourceControls();
var sourceSearch = document.querySelector("#source-search");
if (sourceSearch) {
  sourceSearch.hidden = publisherSources.length <= 12;
  sourceSearch.setAttribute("aria-label", t("Search sources"));
  sourceSearch.placeholder = t("Search sources");
  sourceSearch.addEventListener("input", () => {
    const query = sourceSearch.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const label of sourceOptions.querySelectorAll("label"))
      label.hidden = !(label.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query);
    requiredElement("#no-matching-sources").hidden = [...sourceOptions.querySelectorAll("label")].some((label) => !label.hidden);
  });
}
var interval = 5 * 60 * 1e3;
var snapshot = null;
var retainedSources = /* @__PURE__ */ new Map();
function displayedSnapshot() {
  return { ...snapshot, sources: Object.fromEntries(Object.entries(snapshot.sources).map(([id, source]) => [id, retainedSources.get(id) ?? source])) };
}
var loading = false;
var lastAttempt = 0;
var loadStarted = 0;
var loadDuration = 0;
var loadOutcome = "";
var loadStage = "";
var feedTimings = {};
var stringerOrder = /* @__PURE__ */ new Map();
function shuffledStringerStories(stories) {
  for (const story of stories) {
    if (!stringerOrder.has(story.url)) stringerOrder.set(story.url, Math.random());
  }
  return [...stories].sort((a, b) => stringerOrder.get(a.url) - stringerOrder.get(b.url));
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderStories(target, stories, emptyMessage) {
  target.replaceChildren();
  const usePlaceholder = target.id === "stringer-news";
  const wire = target.id === "world-news";
  for (const [index, story] of stories.entries()) {
    const url = safeUrl(story.url);
    if (!url) continue;
    const approvedMedia = usePlaceholder ? STRINGER_MEDIA.get(url) : null;
    const localImage = CONTENT_PERMISSIONS.stringer.images && approvedMedia?.image ? locale !== "en-US" ? new URL(approvedMedia.image, import.meta.url).href : approvedMedia.image : null;
    const article = element("article", "", "story");
    article.dir = "auto";
    const body = element("div", "", "story-body");
    const showPlaceholder = () => {
      const placeholder = element("div", "", "story-media story-placeholder");
      placeholder.setAttribute("aria-hidden", "true");
      article.classList.add("with-image");
      article.prepend(placeholder);
    };
    const imageData = wire ? null : story.image;
    const imageUrl = wire ? null : safeImageUrl(imageData?.url) || localImage;
    if (imageUrl) {
      const figure = element("figure", "", "story-media");
      const image = element("img");
      image.alt = imageData?.alt || "";
      image.width = 240;
      image.height = 240;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      let triedLocal = imageUrl === localImage;
      image.addEventListener("error", () => {
        if (localImage && !triedLocal) {
          triedLocal = true;
          image.src = localImage;
          return;
        }
        const placeholder = element("div", "", "story-placeholder");
        placeholder.setAttribute("aria-hidden", "true");
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      if (wire) {
        figure.classList.add("wire-thumbnail");
        const imageLink = element("a");
        imageLink.href = url;
        imageLink.target = "_blank";
        imageLink.rel = "noopener noreferrer";
        imageLink.setAttribute("aria-label", t("Read {title} at the original source", { title: story.title }));
        imageLink.append(image);
        figure.append(imageLink);
      } else figure.append(image);
      if (imageData?.credit) figure.append(element("figcaption", imageData.credit));
      article.classList.add("with-image");
      article.append(figure);
    } else if (usePlaceholder) {
      showPlaceholder();
    }
    const link = element("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(element("h3", story.title));
    body.append(link);
    if (story.credits) body.append(element("p", story.credits, "credits"));
    if (story.summary) body.append(element("p", story.summary, "summary"));
    const meta = element("div", "", "meta");
    meta.append(element("span", story.source || new URL(url).hostname.replace(/^www\./, ""), "source"));
    if (story.mirroredVia) meta.append(element("span", t("via {network} / Atomstr", { network: story.mirroredVia }), "mirror-provenance"));
    const reviewedDate = target.id === "stringer-news" && story.url === "https://www.instagram.com/reel/DMsRo8JNRY8/?igsh=MWc5aXJiZml4c2l4cA==" ? "2025-07-29" : null;
    const publishedAt = story.publishedAt || approvedMedia?.publishedAt;
    if (publishedAt) {
      const time = element("time", formatLocalDateTime(publishedAt, locale));
      time.title = t(story.atomstr ? "Atomstr mirror timestamp ({zone})" : "Local time ({zone})", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      time.dateTime = publishedAt;
      meta.append(time);
    } else if (story.publicationDate || approvedMedia?.publicationDate || reviewedDate) {
      const publicationDate = story.publicationDate || approvedMedia?.publicationDate || reviewedDate;
      const time = element("time", formatPublicationDate(publicationDate, locale));
      time.dateTime = publicationDate;
      time.title = t("Publication date; source does not provide a confirmed time zone and time");
      meta.append(time);
    } else if (story.credits) {
      meta.append(element("span", t("Publication date unavailable")));
    }
    if (meta.querySelector("time")) {
      const separator = element("span", "\xB7");
      separator.setAttribute("aria-hidden", "true");
      meta.firstElementChild.after(separator);
    }
    body.append(meta);
    article.append(body);
    target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element("p", emptyMessage, "empty"));
}
var mobileLayout = matchMedia("(max-width: 767px)");
var sections = [
  { list: requiredElement("#world-news"), button: requiredElement("#world-more"), more: "Show more headlines", fewer: "Show fewer headlines", expanded: false },
  { list: requiredElement("#stringer-news"), button: requiredElement("#stringer-more"), more: "Show more courageous stories", fewer: "Show fewer courageous stories", expanded: false }
];
function updateStoryVisibility() {
  for (const section of sections) {
    const cards = [...section.list.querySelectorAll("article")];
    cards.forEach((card, index) => {
      card.hidden = mobileLayout.matches && !section.expanded && index >= 5;
    });
    section.button.hidden = !mobileLayout.matches || cards.length <= 5;
    section.button.setAttribute("aria-expanded", String(section.expanded));
    section.button.textContent = t(section.expanded ? section.fewer : section.more);
    section.button.setAttribute("aria-label", section.button.textContent || "");
  }
  if (!mobileLayout.matches) {
    const stringer = requiredElement("#stringer-news");
    if (!stringer.querySelector("article")) return;
    const bottom = stringer.getBoundingClientRect().bottom;
    let reachedEnd = false;
    for (const card of requiredElement("#world-news").querySelectorAll("article")) {
      card.hidden = reachedEnd;
      if (!reachedEnd && card.getBoundingClientRect().bottom >= bottom) reachedEnd = true;
    }
  }
}
for (const section of sections) {
  section.button.addEventListener("click", () => {
    section.expanded = !section.expanded;
    updateStoryVisibility();
  });
}
mobileLayout.addEventListener("change", updateStoryVisibility);
function renderStatuses() {
  const relayStatus = requiredElement("#relay-status");
  const relayDetails = requiredElement("#relay-status-details");
  relayDetails.replaceChildren();
  const notes = [];
  const seconds = ((loading ? performance.now() - loadStarted : loadDuration) / 1e3).toFixed(1);
  const timing = loading ? t("Loading \xB7 {seconds} s elapsed", { seconds }) : loadOutcome ? t("{outcome} in {seconds} s", { outcome: t(loadOutcome), seconds }) : "";
  if (timing) notes.push(loading ? t("{stage} Total elapsed: {seconds} s.", { stage: loadStage, seconds }) : t("Latest feed load: {timing}.", { timing }));
  if (Object.keys(feedTimings).length) {
    notes.push(t("Story retrieval from news relays:"));
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1e3).toFixed(1);
      const state = feed.state === "loading" && !loading ? "partial" : feed.state;
      const description = state === "empty" ? t("no published stories") : state === "loaded" ? t("loaded in {seconds} s", { seconds: elapsed }) : state === "loading" ? t("loading \xB7 {seconds} s elapsed \xB7 {received}/{total} stories", { seconds: elapsed, received: feed.received, total: feed.total }) : t("{received}/{total} stories received after {seconds} s", { seconds: elapsed, received: feed.received, total: feed.total });
      notes.push(`${source.name} \xB7 ${description}`);
    }
  }
  if (snapshot) for (const group of ["world", "stringer"]) {
    const target = requiredElement(`#${group}-status`);
    target.replaceChildren();
    const sources = group === "stringer" ? SOURCES.filter((s) => s.id === "stringer") : publisherSources.filter((s) => !disabledSources.has(s.id));
    for (const source of sources) {
      const entry = snapshot.sources[source.id];
      if (entry.status === "paused") continue;
      const retained = retainedSources.get(source.id);
      if (retained) notes.push(`${source.name} \xB7 Showing ${retained.stories.length} previously collected stories${retained.lastSuccessAt ? ` from ${formatLocalDateTime(retained.lastSuccessAt)}` : ""}.`);
      if (relayConfig.enabled) {
        const counts = [];
        if ((entry.unavailable ?? 0) > 0 && !loading) counts.push(t("{count} unavailable", { count: entry.unavailable }));
        if ((entry.pending ?? 0) > 0) counts.push(t("{count} queued", { count: entry.pending }));
        if (counts.length) notes.push(`${source.name} \xB7 ${counts.join(" \xB7 ")}`);
      }
      if (entry.status === "failure" && !(loading && entry.unavailable)) target.append(element("p", t("{source}: refresh unavailable.{retained}", { source: source.name, retained: t(retained?.stories.length || entry.stories.length ? " Showing previously collected stories." : " No stories available.") }), "warning"));
    }
  }
  if (atomstrEdition) {
    const target = requiredElement("#world-status");
    const warnings = [...target.children];
    if (warnings.length) {
      const details = element("details");
      details.append(element("summary", t("Unavailable sources ({count})", { count: warnings.length })), ...warnings);
      target.replaceChildren(details);
    }
  }
  for (const note of notes) relayDetails.append(element("p", note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector("summary");
  summary.textContent = timing ? t("Feed status \xB7 {timing}", { timing: locale === "en-US" ? timing.toLowerCase() : timing }) : t("Feed status");
  summary.title = notes.join("\n");
}
function renderWorld() {
  if (!snapshot) return;
  const current = snapshot;
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every((id) => current.sources[id].status === "paused");
  const list = requiredElement("#world-news");
  const stories = worldStories(displayedSnapshot(), selected, publisherSources);
  renderStories(
    list,
    atomstrEdition ? stories.slice(0, 300) : stories,
    !selected.length ? t("No sources selected.") : loading ? "" : worldPaused ? t("Global headlines are currently unavailable.") : t("No headlines available in this collection.")
  );
  if (!selected.length) {
    const button = element("button", t("Enable all"), "enable-all-empty");
    button.type = "button";
    button.addEventListener("click", enableAllSources);
    list.append(button);
  }
  if (worldPaused && !atomstrEdition) {
    const links = element("p", "", "publisher-links");
    for (const { id, name, homepage, linkLabel } of SOURCES.filter((source) => source.id !== "stringer")) {
      if (!selected.includes(id)) continue;
      const link = element("a", linkLabel || name);
      link.href = homepage;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (links.childNodes.length) links.append(document.createTextNode(" \xB7 "));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  updateStoryVisibility();
}
function render() {
  if (!snapshot) return;
  renderStories(requiredElement("#stringer-news"), shuffledStringerStories(displayedSnapshot().sources.stringer.stories), loading ? "" : t("Courageous stories are currently unavailable. Visit the Stringer collection below."));
  renderWorld();
}
async function load() {
  if (atomstrEdition) return loadAtomstr();
  if (loading) return;
  loading = true;
  lastAttempt = Date.now();
  loadStarted = performance.now();
  loadStage = t(snapshot ? "Checking for updates\u2026" : "Loading news\u2026");
  loadOutcome = "";
  feedTimings = {};
  renderStatuses();
  const loadTimer = setInterval(renderStatuses, 1e3);
  document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "true"));
  feedback.textContent = "";
  try {
    let next;
    if (relayConfig.enabled) {
      const reader = await import("./relay-reader.js?v=98e46a0c524d537c");
      if (!snapshot) {
        snapshot = reader.cachedRelaySnapshot(relayConfig);
        if (snapshot) render();
      }
      next = await reader.readRelaySnapshot(relayConfig, (message) => {
        const retry = message.match(/^Received (\d+) published notes\. Retrying (\d+) missing notes…$/);
        loadStage = retry ? t("Received {received} published notes. Retrying {missing} missing notes\u2026", { received: retry[1], missing: retry[2] }) : t(message);
        renderStatuses();
        console.info("[Stringer reader]", message);
      }, (partial) => {
        if (snapshot && Date.parse(partial.generatedAt) < Date.parse(snapshot.generatedAt)) return;
        for (const source of SOURCES) {
          const current = partial.sources[source.id];
          const previous = retainedSources.get(source.id) ?? snapshot?.sources[source.id];
          if (previous && current.status !== "paused" && previous.stories.length > current.stories.length)
            retainedSources.set(source.id, previous);
          else retainedSources.delete(source.id);
        }
        snapshot = partial;
        render();
      }, (timings) => {
        feedTimings = timings;
        renderStatuses();
      });
    } else {
      const response = await fetch(new URL("./data/news.json", import.meta.url), { cache: "no-cache", credentials: "omit", signal: AbortSignal.timeout(15e3) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      next = applyContentPermissions(validateSnapshot(JSON.parse(await readResponseText(response))));
    }
    if (snapshot && Date.parse(next.generatedAt) < Date.parse(snapshot.generatedAt)) throw new Error("Older snapshot returned");
    retainedSources.clear();
    snapshot = next;
    render();
    loadOutcome = "Loaded";
    feedback.textContent = "";
  } catch (error) {
    loadOutcome = "Failed";
    console.error("[Stringer reader] Collection refresh failed:", error);
    feedback.textContent = t(snapshot ? "Could not check for updates. Keeping the previously loaded collection." : "The news collection is unavailable. We\u2019ll retry automatically.");
    if (!snapshot) {
      requiredElement("#world-status").textContent = t("Headlines unavailable.");
      requiredElement("#stringer-status").textContent = t("Courageous stories unavailable. You can still visit the Stringer collection below.");
    }
  } finally {
    loadDuration = performance.now() - loadStarted;
    for (const feed of Object.values(feedTimings)) {
      if (feed.state === "loading") {
        feed.durationMs = performance.now() - feed.startedAt;
        feed.state = "partial";
      }
    }
    clearInterval(loadTimer);
    loading = false;
    document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "false"));
    if (snapshot) render();
    else renderStatuses();
  }
}
async function loadAtomstr() {
  if (loading) return;
  loading = true;
  lastAttempt = Date.now();
  loadStarted = performance.now();
  loadOutcome = "";
  loadStage = t("Loading news\u2026");
  feedTimings = {};
  feedback.textContent = t("Loading news\u2026");
  document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "true"));
  let redraw;
  try {
    const reader = await import("./atomstr-reader.js?v=98e46a0c524d537c");
    if (!snapshot) {
      const sources = reader.cachedAtomstrSources(mirrorSources);
      for (const source of Object.values(sources)) source.status = "loading";
      snapshot = { schemaVersion: 2, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), sources: {
        ...sources,
        stringer: { stories: [], status: "loading", lastSuccessAt: null, attemptedAt: (/* @__PURE__ */ new Date()).toISOString(), error: null }
      } };
      renderWorld();
      render();
    }
    const queueDraw = () => {
      if (!redraw) redraw = setTimeout(() => {
        redraw = void 0;
        renderWorld();
      }, 150);
    };
    await Promise.allSettled([
      reader.readAtomstrSources({ sources: mirrorSources, previous: snapshot.sources, onUpdate(id, entry) {
        snapshot.sources[id] = entry;
        queueDraw();
      } }),
      (async () => {
        try {
          let original;
          if (relayConfig.enabled) {
            const relay = await import("./relay-reader.js?v=98e46a0c524d537c");
            const cached = relay.cachedRelaySnapshot(relayConfig);
            if (cached) {
              snapshot.sources.stringer = cached.sources.stringer;
              render();
            }
            original = await relay.readRelaySnapshot(relayConfig);
          } else {
            const response = await fetch(new URL("./data/news.json", import.meta.url), { cache: "no-cache", credentials: "omit", signal: AbortSignal.timeout(15e3) });
            if (!response.ok) throw new Error("Unavailable collection");
            original = applyContentPermissions(validateSnapshot(JSON.parse(await readResponseText(response))));
          }
          snapshot.sources.stringer = original.sources.stringer;
        } catch {
          snapshot.sources.stringer = { ...snapshot.sources.stringer, status: "failure" };
        }
        render();
      })()
    ]);
    const completedSources = [...publisherSources.map((source) => snapshot.sources[source.id]), snapshot.sources.stringer];
    const successfulSources = completedSources.filter((source) => source.status === "success").length;
    loadOutcome = successfulSources === 0 ? "Failed" : successfulSources === completedSources.length ? "Loaded" : "Partial";
    feedback.textContent = successfulSources === 0 ? t("The news collection is unavailable. We\u2019ll retry automatically.") : "";
  } catch {
    loadOutcome = "Failed";
    feedback.textContent = t("The news collection is unavailable. We\u2019ll retry automatically.");
  } finally {
    clearTimeout(redraw);
    loadDuration = performance.now() - loadStarted;
    loadOutcome ||= "Loaded";
    loading = false;
    if (snapshot) render();
    else renderStatuses();
    document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "false"));
  }
}
var layoutObserver = new ResizeObserver(updateStoryVisibility);
layoutObserver.observe(requiredElement("#stringer-news"));
window.addEventListener("resize", updateStoryVisibility);
document.fonts.ready.then(updateStoryVisibility);
setInterval(() => {
  renderStatuses();
  if (!document.hidden && Date.now() - lastAttempt >= interval) load();
}, 3e4);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastAttempt >= interval) load();
});
load();
