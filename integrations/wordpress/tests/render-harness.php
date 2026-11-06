<?php
/**
 * Teste do plugin sem WordPress: imita as funções do WordPress que o plugin usa e
 * imprime o HTML do shortcode. Uso: php render-harness.php '<json das opções guardadas>' '<json dos atributos>'
 */
define('ABSPATH', __DIR__ . '/');
$GLOBALS['vnd_options'] = json_decode($argv[1] ?? '{}', true) ?: array();
$GLOBALS['vnd_enqueued'] = array();
$GLOBALS['vnd_shortcodes'] = array();

function plugin_dir_path($f) { return rtrim(dirname($f), '/') . '/'; }
function plugin_dir_url($f) { return 'https://site.test/wp-content/plugins/vndesign-analise-gratis/'; }
function plugin_basename($f) { return 'vndesign-analise-gratis/vndesign-analise-gratis.php'; }
function is_admin() { return false; }
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function add_shortcode($tag, $cb) { $GLOBALS['vnd_shortcodes'][$tag] = $cb; }
function get_option($k, $d = false) { return $k === 'vnd_fa_options' ? $GLOBALS['vnd_options'] : $d; }
function add_option() {}
function get_bloginfo($k) { return 'Padaria & Filhos'; }
function wp_specialchars_decode($s) { return htmlspecialchars_decode($s, ENT_QUOTES); }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function esc_url($s) { $s = (string) $s; return preg_match('~^https?://~i', $s) ? htmlspecialchars($s, ENT_QUOTES, 'UTF-8') : ''; }
function sanitize_hex_color($c) { return preg_match('|^#([A-Fa-f0-9]{3}){1,2}$|', (string) $c) ? $c : null; }
function current_user_can() { return !empty($GLOBALS['vnd_admin']); }
function wp_unique_id($p) { static $n = 0; return $p . (++$n); }
function get_privacy_policy_url() { return 'https://site.test/privacidade/'; }
function wp_style_is() { return false; }
function wp_script_is() { return false; }
function wp_register_style($h) {}
function wp_register_script($h) {}
function wp_enqueue_style($h, $src = '') { $GLOBALS['vnd_enqueued'][] = "style:$h" . ($src ? " $src" : ''); }
function wp_enqueue_script($h) { $GLOBALS['vnd_enqueued'][] = "script:$h"; }

// Pedidos à plataforma (configuração remota): VND_REMOTE = o JSON que a plataforma devolve.
define('HOUR_IN_SECONDS', 3600);
define('MINUTE_IN_SECONDS', 60);
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function wp_remote_get($url, $args = array()) { return array('body' => getenv('VND_REMOTE') ?: '{"ok":true}'); }
function is_wp_error($v) { return false; }
function wp_remote_retrieve_body($r) { return $r['body']; }

require __DIR__ . '/../vndesign-analise-gratis/vndesign-analise-gratis.php';
$GLOBALS['vnd_admin'] = getenv('VND_ADMIN') === '1';
$atts = json_decode($argv[2] ?? '{}', true) ?: array();
echo call_user_func($GLOBALS['vnd_shortcodes']['vndesign_analise_gratis'], $atts);
echo "\n<!--enqueued:" . implode(',', $GLOBALS['vnd_enqueued']) . "-->";
