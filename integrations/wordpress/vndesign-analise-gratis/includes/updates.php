<?php
/**
 * Atualizações como nos outros plugins: a plataforma diz qual é a versão atual (no mesmo
 * pedido que já faz para ligar o formulário) e o WordPress mostra "Há uma nova versão —
 * Atualizar agora" (e deixa ligar as atualizações automáticas). O .zip vem da plataforma,
 * já ligado à mesma página.
 *
 * Também limpa a cache das páginas (LiteSpeed e outros) depois de o plugin mudar de versão
 * ou de as definições do formulário mudarem: os visitantes veem logo a versão nova.
 */

if (!defined('ABSPATH')) {
	exit;
}

const VND_FA_SLUG = 'vndesign-analise-gratis';

/** A versão atual e o endereço do .zip, ou null (sem ligação à plataforma). */
function vnd_fa_update_info() {
	$o = vnd_fa_options();
	$endpoint = vnd_fa_endpoint($o['page_url']);
	if (!$endpoint) {
		return null;
	}
	$config = vnd_fa_remote_config($endpoint);
	if (empty($config['plugin_version'])) {
		return null;
	}
	return array('version' => $config['plugin_version'], 'package' => $endpoint . '/plugin');
}

function vnd_fa_update_item($info) {
	return (object) array(
		'id'           => 'vndesign/' . VND_FA_SLUG,
		'slug'         => VND_FA_SLUG,
		'plugin'       => plugin_basename(VND_FA_FILE),
		'new_version'  => $info['version'],
		'url'          => 'https://vndesign.pt',
		'package'      => $info['package'],
		'requires'     => '6.0',
		'requires_php' => '7.4',
		'icons'        => array(),
		'banners'      => array(),
	);
}

add_filter('pre_set_site_transient_update_plugins', function ($transient) {
	if (!is_object($transient)) {
		return $transient;
	}
	$info = vnd_fa_update_info();
	if (!$info) {
		return $transient;
	}
	$basename = plugin_basename(VND_FA_FILE);
	if (version_compare(VND_FA_VERSION, $info['version'], '<')) {
		$transient->response = isset($transient->response) && is_array($transient->response) ? $transient->response : array();
		$transient->response[$basename] = vnd_fa_update_item($info);
	} else {
		// Em dia: aparece na mesma, para se poder ligar "Ativar atualizações automáticas".
		$transient->no_update = isset($transient->no_update) && is_array($transient->no_update) ? $transient->no_update : array();
		$transient->no_update[$basename] = vnd_fa_update_item(array('version' => VND_FA_VERSION, 'package' => ''));
	}
	return $transient;
});

// "Ver detalhes" na lista de plugins.
add_filter('plugins_api', function ($result, $action, $args) {
	if ($action !== 'plugin_information' || !is_object($args) || !isset($args->slug) || $args->slug !== VND_FA_SLUG) {
		return $result;
	}
	$info = vnd_fa_update_info();
	return (object) array(
		'name'          => 'VNDesign — Análise grátis do site',
		'slug'          => VND_FA_SLUG,
		'version'       => $info ? $info['version'] : VND_FA_VERSION,
		'author'        => '<a href="https://vndesign.pt">VNDesign</a>',
		'homepage'      => 'https://vndesign.pt',
		'requires'      => '6.0',
		'requires_php'  => '7.4',
		'download_link' => $info ? $info['package'] : '',
		'sections'      => array(
			'description' => '<p>Formulário “Analisar o meu site grátis” ligado à plataforma VNDesign Leads: quem o preenche entra como lead quente e recebe o diagnóstico do site em PDF por email.</p>',
			'changelog'   => '<p>As novidades de cada versão estão na plataforma (Definições → Formulário do site).</p>',
		),
	);
}, 10, 3);

/** Limpa a cache das páginas nos plugins de cache mais comuns (os que não existirem são ignorados). */
function vnd_fa_purge_page_cache() {
	do_action('litespeed_purge_all');
	if (function_exists('rocket_clean_domain')) {
		rocket_clean_domain();
	}
	if (function_exists('w3tc_flush_all')) {
		w3tc_flush_all();
	}
	if (function_exists('wp_cache_clear_cache')) {
		wp_cache_clear_cache();
	}
	if (function_exists('sg_cachepress_purge_cache')) {
		sg_cachepress_purge_cache();
	}
	do_action('breeze_clear_all_cache');
	if (class_exists('autoptimizeCache') && method_exists('autoptimizeCache', 'clearall')) {
		autoptimizeCache::clearall();
	}
}

// Mudou de versão (atualizado por aqui, automaticamente ou carregando o .zip): limpa uma vez.
// É a versão nova que o faz, logo no primeiro pedido depois de atualizar.
add_action('init', function () {
	if (get_option('vnd_fa_seen_version') === VND_FA_VERSION) {
		return;
	}
	update_option('vnd_fa_seen_version', VND_FA_VERSION, true);
	vnd_fa_purge_page_cache();
});

// Definições do formulário guardadas: as páginas mostram logo as novas.
add_action('update_option_' . VND_FA_OPTION, 'vnd_fa_purge_page_cache');
add_action('add_option_' . VND_FA_OPTION, 'vnd_fa_purge_page_cache');
