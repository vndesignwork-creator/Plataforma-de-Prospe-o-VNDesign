<?php
/**
 * Visitas dos leads: quando alguém chega ao site por um link de um email da
 * plataforma, o endereço traz ?vnd=CÓDIGO. O código fica guardado no browser
 * dessa pessoa (60 dias) e, em cada visita, o site avisa a plataforma — assim
 * sabe-se quem está a voltar ao site antes de lhe ligar.
 *
 * Só identifica quem já clicou num email enviado pela plataforma: de mais
 * ninguém se guarda ou envia o que quer que seja.
 */

if (!defined('ABSPATH')) {
	exit;
}

/** Está ligado nas definições e a plataforma está configurada? */
function vnd_fa_visits_enabled() {
	$options = vnd_fa_options();
	if (empty($options['visits'])) {
		return false;
	}
	return vnd_fa_parse_page_url($options['page_url']) !== null;
}

/** O endereço para onde o site avisa das visitas (ou null). */
function vnd_fa_visits_endpoint() {
	$parsed = vnd_fa_parse_page_url(vnd_fa_options()['page_url']);
	return $parsed ? $parsed['base'] . '/api/v1/public/visits/' . $parsed['token'] : null;
}

/** O script só entra nas páginas do site (nunca no painel nem em feeds). */
function vnd_fa_visits_enqueue() {
	if (is_admin() || is_feed() || is_robots()) {
		return;
	}
	$endpoint = vnd_fa_visits_endpoint();
	if (!$endpoint || !vnd_fa_visits_enabled()) {
		return;
	}
	wp_register_script('vnd-fa-visits', VND_FA_URL . 'assets/visits.js', array(), VND_FA_VERSION, true);
	wp_localize_script('vnd-fa-visits', 'VND_FA_VISITS', array('endpoint' => $endpoint));
	wp_enqueue_script('vnd-fa-visits');
}
add_action('wp_enqueue_scripts', 'vnd_fa_visits_enqueue', 20);
