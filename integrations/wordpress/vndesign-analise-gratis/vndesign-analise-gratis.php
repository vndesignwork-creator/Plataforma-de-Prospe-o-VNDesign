<?php
/**
 * Plugin Name:       VNDesign — Análise grátis do site
 * Plugin URI:        https://leads.vndesign.pt
 * Description:       Formulário “Analisar o meu site grátis” ligado à plataforma VNDesign Leads: quem o preenche entra como lead quente e recebe o diagnóstico do site em PDF por email. Elemento para o Bricks Builder e shortcode [vndesign_analise_gratis].
 * Version:           1.6.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            VNDesign
 * Author URI:        https://vndesign.pt
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       vndesign-analise-gratis
 */

if (!defined('ABSPATH')) {
	exit;
}

define('VND_FA_VERSION', '1.6.0');
define('VND_FA_FILE', __FILE__);
define('VND_FA_DIR', plugin_dir_path(__FILE__));
define('VND_FA_URL', plugin_dir_url(__FILE__));

require_once VND_FA_DIR . 'includes/options.php';
require_once VND_FA_DIR . 'includes/render.php';
if (is_admin()) {
	require_once VND_FA_DIR . 'includes/admin.php';
}

add_action('wp_enqueue_scripts', 'vnd_fa_register_assets');
add_shortcode('vndesign_analise_gratis', 'vnd_fa_shortcode');

// Elemento do Bricks Builder (só se o tema Bricks estiver ativo).
add_action('init', function () {
	if (class_exists('\Bricks\Elements')) {
		\Bricks\Elements::register_element(VND_FA_DIR . 'includes/bricks-element.php');
	}
}, 11);

register_activation_hook(__FILE__, 'vnd_fa_activate');

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
	array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=vnd-analise-gratis')) . '">Definições</a>');
	return $links;
});
