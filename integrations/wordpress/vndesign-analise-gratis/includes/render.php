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

/** Um nome de letra seguro (letras, números, espaços e hífens), ou ''. */
function vnd_fa_clean_font($name) {
	$name = trim(preg_replace('~[^A-Za-z0-9 \-]~', '', (string) $name));
	return substr(preg_replace('~\s+~', ' ', $name), 0, 60);
}

/** As letras escolhidas: ['body' => nome|'' , 'heading' => nome|''|'body']. */
function vnd_fa_fonts_for($o) {
	$pick = function ($value, $custom) {
		if ($value === 'custom') {
			return vnd_fa_clean_font($custom);
		}
		return in_array($value, array('', 'inherit', 'body'), true) ? $value : vnd_fa_clean_font($value);
	};
	$body = $pick($o['font_body'], $o['font_body_custom']);
	$heading = $pick($o['font_heading'], $o['font_heading_custom']);
	if ($heading === 'body') {
		$heading = $body !== '' ? $body : 'inherit';
	}
	return array('body' => $body, 'heading' => $heading === 'inherit' ? '' : $heading);
}

/** "Plus Jakarta Sans" → '"Plus Jakarta Sans", sans-serif' (com a reserva certa). */
function vnd_fa_font_stack($name) {
	$known = vnd_fa_fonts();
	$fallback = isset($known[$name]) ? $known[$name][0] : 'sans-serif';
	return '"' . $name . '", ' . ($fallback === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif');
}

/** Carrega as letras escolhidas do Bunny Fonts ou do Google Fonts (uma só folha). */
function vnd_fa_enqueue_fonts($o) {
	if ($o['font_source'] === 'none') {
		return;
	}
	$fonts = array_unique(array_filter(array_values(vnd_fa_fonts_for($o))));
	if (!$fonts) {
		return;
	}
	$known = vnd_fa_fonts();
	$families = array();
	foreach ($fonts as $name) {
		$weights = isset($known[$name]) ? $known[$name][1] : '400;600;700';
		$families[] = $o['font_source'] === 'google'
			? 'family=' . str_replace(' ', '+', $name) . ':wght@' . $weights
			: strtolower(str_replace(' ', '-', $name)) . ':' . str_replace(';', ',', $weights);
	}
	$url = $o['font_source'] === 'google'
		? 'https://fonts.googleapis.com/css2?' . implode('&', $families) . '&display=swap'
		: 'https://fonts.bunny.net/css?family=' . implode('|', $families) . '&display=swap';
	wp_enqueue_style('vnd-fa-fonts-' . substr(md5($url), 0, 8), $url, array(), null);
}

/** As classes do bloco (para o Bricks as pôr no elemento raiz). */
function vnd_fa_root_classes($o) {
	$classes = array('vnd-fa', 'vnd-fa--' . $o['theme'], 'vnd-fa--align-' . $o['align']);
	if (vnd_fa_on($o['card'])) {
		$classes[] = 'vnd-fa--card';
	}
	// Entrada com movimento (como o site: "fadeInUp" ao aparecer no ecrã).
	if (vnd_fa_on($o['animate'])) {
		$classes[] = 'vnd-fa--animate';
	}
	if ($o['layout'] === 'two') {
		$classes[] = 'vnd-fa--two';
	}
	$fonts = vnd_fa_fonts_for($o);
	if ($fonts['body'] !== '') {
		$classes[] = 'vnd-fa--font';
	}
	if ($fonts['heading'] !== '') {
		$classes[] = 'vnd-fa--font-heading';
	}
	if (vnd_fa_on($o['promo'])) {
		$classes[] = 'vnd-fa--promo';
		$classes[] = 'vnd-fa--promo-' . $o['promo_position'];
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
	// "Toda a largura": ocupa o sítio onde está (a secção/contentor do Bricks manda).
	$max = vnd_fa_on($o['promo']) ? $o['max_width_wide'] : $o['max_width'];
	if ($o['width'] === 'full') {
		$vars[] = '--vnd-fa-max:none';
	} elseif (is_numeric($max) && (int) $max > 0) {
		$vars[] = '--vnd-fa-max:' . max(280, min(2000, (int) $max)) . 'px';
	}
	$fonts = vnd_fa_fonts_for($o);
	if ($fonts['body'] !== '') {
		$vars[] = '--vnd-fa-font:' . vnd_fa_font_stack($fonts['body']);
	}
	if ($fonts['heading'] !== '') {
		$vars[] = '--vnd-fa-font-heading:' . vnd_fa_font_stack($fonts['heading']);
	}
	if (is_numeric($o['columns_gap']) && $o['columns_gap'] !== '') {
		$vars[] = '--vnd-fa-gap:' . max(0, min(200, (int) $o['columns_gap'])) . 'px';
	}
	if (vnd_fa_on($o['promo'])) {
		// Larguras das colunas (formulário | texto), trocadas se o texto ficar à esquerda.
		$cols = array('equal' => array('1fr', '1fr'), 'form' => array('1.25fr', '1fr'), 'promo' => array('1fr', '1.25fr'));
		$pair = $cols[$o['promo_ratio']];
		if ($o['promo_position'] === 'left') {
			$pair = array_reverse($pair);
		}
		$vars[] = '--vnd-fa-cols:minmax(0,' . $pair[0] . ') minmax(0,' . $pair[1] . ')';
	}
	return implode(';', $vars);
}

/** O que a plataforma diz desta página (ex.: a chave pública do Turnstile), guardado 1 hora. */
function vnd_fa_remote_config($endpoint) {
	$empty = array('turnstile_site_key' => null, 'company' => null, 'plugin_version' => null);
	if (!$endpoint || !function_exists('wp_remote_get')) {
		return $empty;
	}
	$key = 'vnd_fa_cfg_' . md5($endpoint);
	$cached = get_transient($key);
	if (is_array($cached)) {
		return $cached + $empty;
	}
	// A versão vai no pedido: a plataforma avisa (em Definições) quando há uma nova.
	$res = wp_remote_get($endpoint, array('timeout' => 4, 'headers' => array('Accept' => 'application/json', 'X-VND-Plugin-Version' => VND_FA_VERSION)));
	$body = is_wp_error($res) ? null : json_decode(wp_remote_retrieve_body($res), true);
	$config = array(
		'turnstile_site_key' => is_array($body) && !empty($body['turnstile_site_key']) && preg_match('~^[\w-]{1,100}$~', $body['turnstile_site_key']) ? $body['turnstile_site_key'] : null,
		'company'            => is_array($body) && !empty($body['company']) ? (string) $body['company'] : null,
		// A versão atual do plugin (para o WordPress mostrar "Atualizar agora").
		'plugin_version'     => is_array($body) && !empty($body['plugin_version']) && is_string($body['plugin_version']) && preg_match('/^\d{1,3}(\.\d{1,3}){1,2}$/', $body['plugin_version']) ? $body['plugin_version'] : null,
	);
	// Sem resposta: tenta outra vez daqui a 10 minutos.
	set_transient($key, $config, is_array($body) ? HOUR_IN_SECONDS : 10 * MINUTE_IN_SECONDS);
	return $config;
}

/** A imagem do texto de persuasão: a escolhida ou a que vem com o plugin. */
function vnd_fa_promo_image_url($o) {
	$url = trim((string) $o['promo_image']);
	// Com a versão no endereço: ao atualizar o plugin, o browser e a cache do site vão buscar a nova.
	return $url !== '' ? $url : VND_FA_URL . 'assets/ilustracao-relatorio.svg?ver=' . VND_FA_VERSION;
}

/** O texto de persuasão (imagem, título, texto, vantagens e nota). */
function vnd_fa_render_promo($o) {
	$tag = $o['promo_title_tag'];
	$image = '';
	if (vnd_fa_on($o['promo_image_show'])) {
		$own = trim((string) $o['promo_image']) !== '';
		// Na horizontal: no computador estica ou encolhe até a coluna ficar da altura do formulário.
		// A ilustração do plugin tem uma versão larga (telemóvel, relatório, IAs, Google): o JS escolhe-a quando a moldura é bem larga.
		$wide = $own ? '' : ' data-wide="' . esc_url(VND_FA_URL . 'assets/ilustracao-relatorio-larga.svg?ver=' . VND_FA_VERSION) . '"';
		$image = '<div class="vnd-fa__media"><img class="vnd-fa__image' . ($own ? '' : ' vnd-fa__image--illustration') . '" src="' . esc_url(vnd_fa_promo_image_url($o)) . '"' . $wide . ' alt="' . esc_attr($o['promo_image_alt']) . '" loading="lazy" decoding="async"' . ($own ? '' : ' width="1000" height="500"') . '></div>';
	}
	$text = '';
	if (trim($o['promo_eyebrow']) !== '') {
		$text .= '<p class="vnd-fa__eyebrow">' . esc_html($o['promo_eyebrow']) . '</p>';
	}
	if (trim($o['promo_title']) !== '') {
		$text .= '<' . $tag . ' class="vnd-fa__promo-title">' . esc_html($o['promo_title']) . '</' . $tag . '>';
	}
	if (trim($o['promo_text']) !== '') {
		$text .= '<p class="vnd-fa__promo-text">' . nl2br(esc_html(trim($o['promo_text'])), false) . '</p>';
	}
	$points = array_values(array_filter(array_map('trim', preg_split('~\R~u', (string) $o['promo_points']))));
	if ($points) {
		$check = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="10" fill="currentColor" opacity=".16"/><path d="M6 10.4l2.6 2.6L14.2 7.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
		$text .= '<ul class="vnd-fa__points">';
		foreach ($points as $point) {
			$text .= '<li>' . $check . '<span>' . esc_html($point) . '</span></li>';
		}
		$text .= '</ul>';
	}
	if (trim($o['promo_note']) !== '') {
		$text .= '<p class="vnd-fa__note">' . esc_html($o['promo_note']) . '</p>';
	}
	$body = $o['promo_image_position'] === 'bottom' ? $text . $image : $image . $text;
	return '<div class="vnd-fa__promo vnd-fa__promo--image-' . esc_attr($o['promo_image_position']) . '">' . $body . '</div>';
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
	// Com o texto de persuasão ao lado, o título e o texto do formulário podem sair (um título a menos).
	$hide_head = vnd_fa_on($o['promo']) && vnd_fa_on($o['promo_hide_form_title']);
	if (!$hide_head && vnd_fa_on($o['show_title']) && trim($o['title']) !== '') {
		$html .= '<' . $tag . ' class="vnd-fa__title">' . esc_html($o['title']) . '</' . $tag . '>';
	}
	if (!$hide_head && vnd_fa_on($o['show_intro']) && trim($o['intro']) !== '') {
		$html .= '<p class="vnd-fa__intro">' . esc_html($o['intro']) . '</p>';
	}

	$html .= '<form class="vnd-fa__form" method="post" novalidate'
		. ($preview ? ' action="#" data-vnd-fa-preview' : ' action="' . esc_url($endpoint) . '" data-vnd-fa-form')
		. ' data-endpoint="' . esc_url($endpoint) . '"'
		. ' data-redirect="' . esc_attr($redirect) . '"'
		. ' data-check="' . esc_url($endpoint . '/verificar-site') . '"'
		. ' data-status="' . esc_url($endpoint . '/estado/') . '"'
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
	// Cloudflare Turnstile (só se o dono o ligou na plataforma).
	$turnstile = $preview ? null : vnd_fa_remote_config($endpoint)['turnstile_site_key'];
	if ($turnstile) {
		$html .= '<div class="vnd-fa__turnstile" data-sitekey="' . esc_attr($turnstile) . '"></div>';
	}
	$html .= '<p class="vnd-fa__status" role="alert" hidden></p>';
	$html .= '<button class="vnd-fa__button" type="' . ($preview ? 'button' : 'submit') . '" data-label="' . esc_attr($o['button']) . '">' . esc_html($o['button']) . '</button>';
	if (vnd_fa_on($o['show_example']) && trim($o['example_label']) !== '') {
		$html .= '<a class="vnd-fa__example" href="' . esc_url($endpoint . '/exemplo') . '" target="_blank" rel="noopener">'
			. '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
			. '<span>' . esc_html($o['example_label']) . '</span></a>';
	}
	$html .= '</form>';

	$html .= '<div class="vnd-fa__success" role="status" tabindex="-1" hidden>'
		. (trim($o['success_title']) !== '' ? '<strong class="vnd-fa__success-title">' . esc_html($o['success_title']) . '</strong>' : '')
		. '<p data-success-text>' . esc_html($o['success']) . '</p>'
		. '<div class="vnd-fa__result" data-result hidden></div>'
		. '</div>';

	if (!vnd_fa_on($o['promo'])) {
		return $html;
	}
	// Com o texto de persuasão: duas colunas (no telemóvel, uma por baixo da outra, pela ordem escolhida).
	$main = '<div class="vnd-fa__main">' . $html . '</div>';
	$promo = vnd_fa_render_promo($o);
	$order = $o['promo_mobile'] === 'before' ? $promo . $main : $main . $promo;
	return '<div class="vnd-fa__grid">' . $order . '</div>';
}

/** O bloco completo, com o elemento à volta. */
function vnd_fa_render($overrides = array(), $preview = false) {
	$o = vnd_fa_resolve($overrides);
	$inner = vnd_fa_render_inner($o, $preview);
	if ($inner === '') {
		return '';
	}
	vnd_fa_enqueue();
	vnd_fa_enqueue_fonts($o);
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
