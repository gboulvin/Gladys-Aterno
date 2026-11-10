// -----------------------------------------------------------------------------
// Every text the integration produces at runtime, in the four languages of
// the Gladys UI (English, French, German, Spanish).
//
// Gladys picks the language itself: wherever the SDK accepts a multi-language
// object, `t(key)` returns `{ en, fr, de, es }`. `tl(key, language)` returns
// one string, for the few places that take plain text (device and feature
// names, scene variables).
//
// The manifest texts live in gladys-assistant-integration.json, the user
// documentation in docs/<language>.md: test/i18n.test.js checks that all of
// them cover the same four languages.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

const MESSAGES = {
  // --- Device features (plain text, in the configured language) -------------
  'feature.target': {
    en: 'Target temperature',
    fr: 'Température demandée',
    de: 'Solltemperatur',
    es: 'Temperatura deseada',
  },
  'feature.temperature': {
    en: 'Room temperature',
    fr: 'Température ambiante',
    de: 'Raumtemperatur',
    es: 'Temperatura ambiente',
  },
  'feature.mode': { en: 'Heating', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  'feature.frost': {
    en: 'Frost protection',
    fr: 'Hors-gel',
    de: 'Frostschutz',
    es: 'Antihielo',
  },
  'feature.boost': { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },
  'feature.window': {
    en: 'Window',
    fr: 'Fenêtre',
    de: 'Fenster',
    es: 'Ventana',
  },
  'feature.presence': {
    en: 'Presence',
    fr: 'Présence',
    de: 'Anwesenheit',
    es: 'Presencia',
  },

  // --- Vocabulary -------------------------------------------------------------
  'mode.heating': { en: 'Heating', fr: 'En marche', de: 'Heizen', es: 'En marcha' },
  'mode.off': { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  'mode.frost': { en: 'Frost protection', fr: 'Hors-gel', de: 'Frostschutz', es: 'Antihielo' },
  'mode.unknown': { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  'transport.local': { en: 'Local', fr: 'Locale', de: 'Lokal', es: 'Local' },
  'transport.cloud': { en: 'Cloud', fr: 'Cloud', de: 'Cloud', es: 'Nube' },
  'transport.unreachable': {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  'transport.degraded': {
    en: '{transport} (fallback)',
    fr: '{transport} (secours)',
    de: '{transport} (Ausweichweg)',
    es: '{transport} (respaldo)',
  },
  'fault.temperature_sensor': {
    en: 'Temperature sensor fault',
    fr: 'Défaut de la sonde de température',
    de: 'Fehler des Temperaturfühlers',
    es: 'Fallo de la sonda de temperatura',
  },
  'fault.heating': {
    en: 'Heating fault',
    fr: 'Défaut de chauffe',
    de: 'Heizfehler',
    es: 'Fallo de calefacción',
  },
  'fault.battery': {
    en: 'Low battery on the thermostat',
    fr: 'Pile faible sur le thermostat',
    de: 'Schwache Batterie am Thermostat',
    es: 'Pila baja en el termostato',
  },
  yes: { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' },
  no: { en: 'No', fr: 'Non', de: 'Nein', es: 'No' },
  open: { en: 'Open', fr: 'Ouverte', de: 'Offen', es: 'Abierta' },
  closed: { en: 'Closed', fr: 'Fermée', de: 'Geschlossen', es: 'Cerrada' },
  on: { en: 'On', fr: 'Actif', de: 'Ein', es: 'Activo' },
  off: { en: 'Off', fr: 'Inactif', de: 'Aus', es: 'Inactivo' },

  // --- Connection status (Configuration screen, transport badge) -------------
  'status.not_configured': {
    en: 'Enter the MAC address and the password of your Eco Aterno box.',
    fr: "Saisissez l'adresse MAC et le mot de passe de votre box Eco Aterno.",
    de: 'Geben Sie die MAC-Adresse und das Passwort Ihrer Eco-Aterno-Box ein.',
    es: 'Introduzca la dirección MAC y la contraseña de su box Eco Aterno.',
  },
  'status.auth': {
    en: 'The box refused the MAC address or the password.',
    fr: "La box a refusé l'adresse MAC ou le mot de passe.",
    de: 'Die Box hat die MAC-Adresse oder das Passwort abgelehnt.',
    es: 'La box ha rechazado la dirección MAC o la contraseña.',
  },
  'status.unreachable': {
    en: 'The Eco Aterno box cannot be reached. New attempts follow automatically.',
    fr: 'La box Eco Aterno est injoignable. De nouvelles tentatives suivent automatiquement.',
    de: 'Die Eco-Aterno-Box ist nicht erreichbar. Weitere Versuche folgen automatisch.',
    es: 'No se puede acceder a la box Eco Aterno. Se reintentará automáticamente.',
  },
  'status.local_failed': {
    en: 'The box does not answer on the local network: connected through the cloud instead.',
    fr: 'La box ne répond pas sur le réseau local : connexion par le cloud à la place.',
    de: 'Die Box antwortet im lokalen Netz nicht: stattdessen über die Cloud verbunden.',
    es: 'La box no responde en la red local: conectado a través de la nube en su lugar.',
  },
  'status.cloud_failed': {
    en: 'The cloud does not answer: connected through the local network instead.',
    fr: 'Le cloud ne répond pas : connexion par le réseau local à la place.',
    de: 'Die Cloud antwortet nicht: stattdessen über das lokale Netz verbunden.',
    es: 'La nube no responde: conectado a través de la red local en su lugar.',
  },

  // --- Configuration screen actions ------------------------------------------
  'action.test.ok': {
    en: 'Connected ({transport}) to {product}: {count} radiator(s) found.',
    fr: 'Connecté ({transport}) à {product} : {count} radiateur(s) trouvé(s).',
    de: 'Verbunden ({transport}) mit {product}: {count} Heizkörper gefunden.',
    es: 'Conectado ({transport}) a {product}: {count} radiador(es) encontrado(s).',
  },
  'action.refresh.ok': {
    en: '{count} radiator(s) on the box. New ones are waiting in the Discovery tab.',
    fr: "{count} radiateur(s) sur la box. Les nouveaux vous attendent dans l'onglet Découverte.",
    de: '{count} Heizkörper an der Box. Neue warten im Tab „Entdeckung“.',
    es: '{count} radiador(es) en la box. Los nuevos esperan en la pestaña Descubrimiento.',
  },

  // --- Dashboard widgets -----------------------------------------------------
  'widget.heating': { en: 'Heating', fr: 'En marche', de: 'Heizen', es: 'En marcha' },
  'widget.average': {
    en: 'Average temperature',
    fr: 'Température moyenne',
    de: 'Mitteltemperatur',
    es: 'Temperatura media',
  },
  'widget.connection': { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  'widget.box': { en: 'Box', fr: 'Box', de: 'Box', es: 'Box' },
  'widget.windows_open': {
    en: 'Open windows',
    fr: 'Fenêtres ouvertes',
    de: 'Offene Fenster',
    es: 'Ventanas abiertas',
  },
  'widget.faults': { en: 'Faults', fr: 'Défauts', de: 'Störungen', es: 'Fallos' },
  'widget.all_heating': {
    en: 'All on',
    fr: 'Tout en marche',
    de: 'Alle ein',
    es: 'Todo en marcha',
  },
  'widget.all_frost': {
    en: 'All frost protection',
    fr: 'Tout en hors-gel',
    de: 'Alle Frostschutz',
    es: 'Todo en antihielo',
  },
  'widget.all_off': { en: 'All off', fr: 'Tout arrêter', de: 'Alle aus', es: 'Apagar todo' },
  'widget.refresh': { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  'widget.not_connected': {
    en: 'The Eco Aterno box is not connected.',
    fr: "La box Eco Aterno n'est pas connectée.",
    de: 'Die Eco-Aterno-Box ist nicht verbunden.',
    es: 'La box Eco Aterno no está conectada.',
  },
  'widget.pick_radiator': {
    en: 'Pick a radiator in the settings of this widget.',
    fr: 'Choisissez un radiateur dans les réglages de ce widget.',
    de: 'Wählen Sie in den Einstellungen dieses Widgets einen Heizkörper.',
    es: 'Elija un radiador en los ajustes de este widget.',
  },
  'widget.mode': { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  'widget.room': { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Habitación' },
  'widget.warmer': { en: 'Warmer', fr: 'Plus chaud', de: 'Wärmer', es: 'Más calor' },
  'widget.cooler': { en: 'Cooler', fr: 'Moins chaud', de: 'Kühler', es: 'Menos calor' },
  'widget.boost_start': {
    en: 'Start boost',
    fr: 'Lancer le boost',
    de: 'Boost starten',
    es: 'Iniciar boost',
  },
  'widget.boost_stop': {
    en: 'Stop boost',
    fr: 'Arrêter le boost',
    de: 'Boost beenden',
    es: 'Detener boost',
  },
  'widget.turn_on': { en: 'Turn on', fr: 'Mettre en marche', de: 'Einschalten', es: 'Encender' },
  'widget.turn_off': { en: 'Turn off', fr: 'Arrêter', de: 'Ausschalten', es: 'Apagar' },
  'widget.frost': { en: 'Frost protection', fr: 'Hors-gel', de: 'Frostschutz', es: 'Antihielo' },

  // --- Toasts ----------------------------------------------------------------
  'toast.mode': {
    en: '{count} radiator(s) set to: {mode}.',
    fr: '{count} radiateur(s) : {mode}.',
    de: '{count} Heizkörper: {mode}.',
    es: '{count} radiador(es): {mode}.',
  },
  'toast.temperature': {
    en: 'Target temperature: {value} °C.',
    fr: 'Température demandée : {value} °C.',
    de: 'Solltemperatur: {value} °C.',
    es: 'Temperatura deseada: {value} °C.',
  },
  'toast.boost_on': {
    en: 'Boost started.',
    fr: 'Boost lancé.',
    de: 'Boost gestartet.',
    es: 'Boost iniciado.',
  },
  'toast.boost_off': {
    en: 'Boost stopped.',
    fr: 'Boost arrêté.',
    de: 'Boost beendet.',
    es: 'Boost detenido.',
  },
  'toast.refreshed': {
    en: 'Values refreshed.',
    fr: 'Valeurs actualisées.',
    de: 'Werte aktualisiert.',
    es: 'Valores actualizados.',
  },
};

export const MESSAGE_KEYS = Object.keys(MESSAGES);

// Replace `{name}` placeholders. A value may itself be a multi-language
// object (a translated mode inside a translated sentence).
function fill(template, vars, language) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => {
    const value = vars[name];
    if (value === undefined || value === null) {
      return placeholder;
    }
    return typeof value === 'object' ? (value[language] ?? value.en) : String(value);
  });
}

/**
 * A text in every language, as the SDK expects it.
 * @param {string} key key of MESSAGES
 * @param {Record<string, unknown>} [vars] `{placeholder}` values
 * @returns {{ en: string, fr: string, de: string, es: string }}
 */
export function t(key, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message key: ${key}`);
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, fill(message[language], vars, language)]),
  );
}

/** A text in one language (English when the language is not one of ours). */
export function tl(key, language, vars = {}) {
  const texts = t(key, vars);
  return texts[language] ?? texts.en;
}
