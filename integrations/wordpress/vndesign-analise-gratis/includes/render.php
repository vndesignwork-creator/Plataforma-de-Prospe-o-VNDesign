<?php
/**
 * O formulário em HTML (usado pelo shortcode, pelo elemento do Bricks e pela pré-visualização).
 */

if (!defined('ABSPATH')) {
	exit;
}

function vnd_fa_register_assets() {
	if (!wp_style_is('vnd-fa', 'registered')) {
		wp_register_style('vnd-fa', VND_FA_URL . 'assets/form.css', array(), VND_FA_VERSION);
	}
	if (!wp_script_is('vnd-fa', 'registered')) {
		wp_register_script('vnd-fa', VND_FA_URL . 'assets/form.js', array(), VND_FA_VERSION, true);
	}
}

function vnd_fa_enqueue() {
	vnd_fa_register_assets();
	wp_enqueue_style('vnd-fa');
	wp_enqueue_script('vnd-fa');
}

/**
 * Junta as opções guardadas com as do sítio onde o formulário está (shortcode ou Bricks).
 * Valores vazios nas alterações = usar o que está nas definições.
 */
function vnd_fa_resolve($overrides = array()) {
	$options = vnd_fa_options();
	foreach ((array) $overrides as $key => $value) {
		if (!array_key_exists($key, $options) || $value === null || $value === '') {
			continue;
		}
		$options[$key] = is_bool($value) ? ($value ? '1' : '0') : (string) $value;
	}
	$choices = vnd_fa_choices();
	foreach ($choices as $key => $allowed) {
		if (!isset($allowed[$options[$key]])) {
			$options[$key] = vnd_fa_defaults()[$key];
		}
	}
	return $options;
}

function vnd_fa_on($value) {
	return in_array(strtolower((string) $value), array('1', 'true', 'yes', 'sim', 'on'), true);
}

/** As classes do bloco (para o Bricks as pôr no elemento raiz). */
function vnd_fa_root_classes($o) {
	$classes = array('vnd-fa', 'vnd-fa--' . $o['theme'], 'vnd-fa--align-' . $o['align']);
	if (vnd_fa_on($o['card'])) {
		$classes[] = 'vnd-fa--card';
	}
	if ($o['layout'] === 'two') {
		$classes[] = 'vnd-fa--two';
	}
	return $classes;
}

/** As cores e medidas escolhidas, como variáveis CSS. */
function vnd_fa_root_style($o) {
	$vars = array();
	$accent = sanitize_hex_color($o['accent']);
	$button = sanitize_hex_color($o['button_text']);
	if ($accent) {
		$vars[] = '--vnd-fa-accent:' . $accent;
	}
	if ($button) {
		$vars[] = '--vnd-fa-button-text:' . $button;
	}
	if (is_numeric($o['radius'])) {
		$vars[] = '--vnd-fa-radius:' . max(0, min(40, (int) $o['radius'])) . 'px';
	}
	if (is_numeric($o['max_width']) && (int) $o['max_width'] > 0) {
		$vars[] = '--vnd-fa-max:' . max(280, min(1600, (int) $o['max_width'])) . 'px';
	}
	return implode(';', $vars);
}

/** O nome de quem oferece a análise (para o texto do consentimento). */
function vnd_fa_business_name($o) {
	$name = trim((string) $o['business']);
	return $name !== '' ? $name : wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES);
}

/**
 * O conteúdo do bloco (título, texto, formulário e mensagem de sucesso).
 * $preview: na pré-visualização das definições não envia.
 */
function vnd_fa_render_inner($o, $preview = false) {
	$endpoint = vnd_fa_endpoint($o['page_url']);
	if (!$endpoint) {
		if (!current_user_can('manage_options') && !(function_exists('bricks_is_builder') && bricks_is_builder())) {
			return '';
		}
		return '<p class="vnd-fa__notice">Falta ligar o formulário à plataforma: em <strong>Definições → Análise grátis</strong>, cola o “Endereço da página” (VNDesign Leads → Definições → Formulário do site). Só tu vês este aviso.</p>';
	}

	$id = function_exists('wp_unique_id') ? wp_unique_id('vnd-fa-') : 'vnd-fa-' . wp_rand(1000, 999999);
	$tag = $o['title_tag'];
	$redirect = esc_url($o['redirect']);
	$consent = esc_html(str_replace('{negocio}', vnd_fa_business_name($o), $o['consent']));
	$privacy = vnd_fa_on($o['privacy_link']) && function_exists('get_privacy_policy_url') ? get_privacy_policy_url() : '';
	if ($privacy) {
		$consent .= ' <a href="' . esc_url($privacy) . '" target="_blank" rel="noopener">Política de privacidade</a>';
	}

	$field = function ($name, $type, $label, $placeholder, $required, $attrs) use ($id) {
		$input_id = $id . '-' . $name;
		$html  = '<div class="vnd-fa__field">';
		$html .= '<label class="vnd-fa__label" for="' . esc_attr($input_id) . '">' . esc_html($label) . ($required ? ' <span aria-hidden="true">*</span>' : '') . '</label>';
		$html .= '<input class="vnd-fa__input" id="' . esc_attr($input_id) . '" name="' . esc_attr($name) . '" type="' . esc_attr($type) . '"'
			. ($placeholder !== '' ? ' placeholder="' . esc_attr($placeholder) . '"' : '')
			. ($required ? ' required aria-required="true"' : '')
			. ' aria-describedby="' . esc_attr($input_id) . '-error" ' . $attrs . '>';
		$html .= '<p class="vnd-fa__error" id="' . esc_attr($input_id) . '-error" data-error-for="' . esc_attr($name) . '" hidden></p>';
		return $html . '</div>';
	};

	$html = '';
	if (vnd_fa_on($o['show_title']) && trim($o['title']) !== '') {
		$html .= '<' . $tag . ' class="vnd-fa__title">' . esc_html($o['title']) . '</' . $tag . '>';
	}
	if (vnd_fa_on($o['show_intro']) && trim($o['intro']) !== '') {
		$html .= '<p class="vnd-fa__intro">' . esc_html($o['intro']) . '</p>';
	}

	$html .= '<form class="vnd-fa__form" method="post" novalidate'
		. ($preview ? ' action="#" data-vnd-fa-preview' : ' action="' . esc_url($endpoint) . '" data-vnd-fa-form')
		. ' data-endpoint="' . esc_url($endpoint) . '"'
		. ' data-redirect="' . esc_attr($redirect) . '"'
		. ' data-sending="' . esc_attr($o['sending']) . '"'
		. ' data-msg-website="' . esc_attr('Escreva o endereço do site.') . '"'
		. ' data-msg-email="' . esc_attr('Escreva um email válido.') . '"'
		. ' data-msg-consent="' . esc_attr('Aceite que o contactemos com a análise.') . '"'
		. ' data-msg-error="' . esc_attr('Não foi possível enviar o pedido. Tente outra vez daqui a pouco.') . '"'
		. ' data-msg-network="' . esc_attr('Sem ligação. Verifique a internet e tente outra vez.') . '">';

	$html .= $field('website', 'text', $o['label_website'], $o['placeholder_website'], true, 'inputmode="url" autocomplete="url" maxlength="300"');
	$html .= $field('email', 'email', $o['label_email'], $o['placeholder_email'], true, 'autocomplete="email" maxlength="254"');

	$optional = '';
	if (vnd_fa_on($o['show_name'])) {
		$optional .= $field('name', 'text', $o['label_name'], $o['placeholder_name'], false, 'autocomplete="name" maxlength="120"');
	}
	if (vnd_fa_on($o['show_company'])) {
		$optional .= $field('company', 'text', $o['label_company'], $o['placeholder_company'], false, 'autocomplete="organization" maxlength="200"');
	}
	if ($optional !== '') {
		$html .= '<div class="vnd-fa__row">' . $optional . '</div>';
	}

	$html .= '<div class="vnd-fa__consent">'
		. '<input type="checkbox" id="' . esc_attr($id) . '-consent" name="consent" value="true" required aria-required="true" aria-describedby="' . esc_attr($id) . '-consent-error">'
		. '<label for="' . esc_attr($id) . '-consent">' . $consent . '</label>'
		. '</div>'
		. '<p class="vnd-fa__error" id="' . esc_attr($id) . '-consent-error" data-error-for="consent" hidden></p>';

	// Contra robôs: um campo que as pessoas não veem.
	$html .= '<div class="vnd-fa__hp" aria-hidden="true"><label>Não preencher<input type="text" name="_gotcha" tabindex="-1" autocomplete="off"></label></div>';
	if ($redirect !== '') {
		$html .= '<input type="hidden" name="_next" value="' . esc_attr($redirect) . '">';
	}
	$html .= '<p class="vnd-fa__status" role="alert" hidden></p>';
	$html .= '<button class="vnd-fa__button" type="' . ($preview ? 'button' : 'submit') . '">' . esc_html($o['button']) . '</button>';
	$html .= '</form>';

	$html .= '<div class="vnd-fa__success" role="status" tabindex="-1" hidden>'
		. (trim($o['success_title']) !== '' ? '<strong class="vnd-fa__success-title">' . esc_html($o['success_title']) . '</strong>' : '')
		. '<p data-success-text>' . esc_html($o['success']) . '</p>'
		. '</div>';

	return $html;
}

/** O bloco completo, com o elemento à volta. */
function vnd_fa_render($overrides = array(), $preview = false) {
	$o = vnd_fa_resolve($overrides);
	$inner = vnd_fa_render_inner($o, $preview);
	if ($inner === '') {
		return '';
	}
	vnd_fa_enqueue();
	$style = vnd_fa_root_style($o);
	return '<div class="' . esc_attr(implode(' ', vnd_fa_root_classes($o))) . '"' . ($style !== '' ? ' style="' . esc_attr($style) . '"' : '') . ' data-vnd-fa>' . $inner . '</div>';
}

/**
 * [vndesign_analise_gratis] — aceita qualquer opção como atributo, ex.:
 * [vndesign_analise_gratis title="Quer saber o que falha no seu site?" theme="light" show_company="0"]
 */
function vnd_fa_shortcode($atts) {
	$atts = is_array($atts) ? $atts : array();
	$allowed = array_intersect_key($atts, vnd_fa_defaults());
	return vnd_fa_render($allowed);
}
