import { THIEN_RULES } from '/shared/room-rules.mjs';
import { initHomeI18n } from '/home-i18n.js';

initHomeI18n(document, localStorage, navigator.languages || [navigator.language], { count: THIEN_RULES.seats });
