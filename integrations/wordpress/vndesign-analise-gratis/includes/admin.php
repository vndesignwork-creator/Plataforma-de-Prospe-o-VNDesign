<?php
/**
 * Definições → Análise grátis: ligação à plataforma, textos, campos, aspeto e pré-visualização.
 */

if (!defined('ABSPATH')) {
	exit;
}

add_action('admin_menu', function () {
	add_options_page('Análise grátis do site', 'Análise grátis', 'manage_options', 'vnd-analise-gratis', 'vnd_fa_settings_page');
});

add_action('admin_init', function () {
	register_setting('vnd_fa', VND_FA_OPTION, array('type' => 'array', 'sanitize_callback' => 'vnd_fa_sanitize'));
});

add_action('admin_enqueue_scripts', function ($hook) {
	if ($hook !== 'settings_page_vnd-analise-gratis') {
		return;
	}
	wp_enqueue_style('wp-color-picker');
	wp_enqueue_script('wp-color-picker');
	wp_add_inline_script('wp-color-picker', 'jQuery(function($){$(".vnd-fa-color").wpColorPicker();});');
	vnd_fa_enqueue();
	wp_add_inline_style('vnd-fa', '.vnd-fa-preview{padding:24px;border-radius:8px;background:#0d0d0d}.vnd-fa-preview--light{background:#f5f2ed}@media (prefers-color-scheme:light){.vnd-fa-preview--auto{background:#f5f2ed}}.vnd-fa-admin .form-table th{width:260px}.vnd-fa-admin textarea.large-text{min-height:72px}.vnd-fa-admin code{user-select:all}');
});

/** Limpa o que vem do formulário das definições. */
function vnd_fa_sanitize($input) {
	$input = is_array($input) ? $input : array();
	$defaults = vnd_fa_defaults();
	$choices = vnd_fa_choices();
	$checkboxes = array('show_title', 'show_intro', 'show_name', 'show_company', 'privacy_link', 'card');
	$textareas = array('intro', 'consent', 'success');
	$out = array();
	foreach ($defaults as $key => $default) {
		if (in_array($key, $checkboxes, true)) {
			$out[$key] = !empty($input[$key]) ? '1' : '0';
			continue;
		}
		$value = isset($input[$key]) ? wp_unslash($input[$key]) : $default;
		if (isset($choices[$key])) {
			$out[$key] = isset($choices[$key][$value]) ? $value : $default;
		} elseif ($key === 'page_url' && preg_match('~^[A-Za-z0-9_-]{16,64}$~', trim((string) $value))) {
			$out[$key] = trim((string) $value); // só o código também serve
		} elseif ($key === 'page_url' || $key === 'redirect') {
			$out[$key] = trim(esc_url_raw(trim((string) $value)));
		} elseif ($key === 'accent' || $key === 'button_text') {
			$out[$key] = sanitize_hex_color($value) ?: $default;
		} elseif ($key === 'radius' || $key === 'max_width') {
			$out[$key] = is_numeric($value) ? (string) absint($value) : $default;
		} elseif (in_array($key, $textareas, true)) {
			$out[$key] = sanitize_textarea_field($value);
		} else {
			$out[$key] = sanitize_text_field($value);
		}
	}
	if ($out['page_url'] !== '' && !vnd_fa_parse_page_url($out['page_url'])) {
		add_settings_error(VND_FA_OPTION, 'vnd_fa_url', 'O “Endereço da página” não parece certo. Copia-o em VNDesign Leads → Definições → Formulário do site → Analisar o meu site grátis.');
	}
	delete_transient('vnd_fa_check');
	return $out;
}

/** Confirma, na plataforma, que o código está certo e a página ligada (guardado 10 minutos). */
function vnd_fa_check_connection($page_url, $force = false) {
	$endpoint = vnd_fa_endpoint($page_url);
	if (!$endpoint) {
		return array('ok' => false, 'message' => 'Ainda não colaste o endereço da página.');
	}
	$cached = get_transient('vnd_fa_check');
	if (!$force && is_array($cached) && isset($cached['endpoint']) && $cached['endpoint'] === $endpoint) {
		return $cached;
	}
	$res = wp_remote_get($endpoint, array('timeout' => 8, 'headers' => array('Accept' => 'application/json')));
	if (is_wp_error($res)) {
		$result = array('ok' => false, 'message' => 'Não foi possível falar com a plataforma (' . $res->get_error_message() . ').');
	} else {
		$code = wp_remote_retrieve_response_code($res);
		$body = json_decode(wp_remote_retrieve_body($res), true);
		if ($code === 200 && is_array($body) && !empty($body['ok'])) {
			$company = !empty($body['company']) ? ' (' . $body['company'] . ')' : '';
			$result = array('ok' => true, 'message' => 'Ligado à plataforma' . $company . '. Os pedidos chegam como leads quentes.');
		} elseif ($code === 404) {
			$result = array('ok' => false, 'message' => 'A plataforma não reconhece este endereço: a análise grátis está desligada ou o endereço mudou. Copia-o outra vez na plataforma.');
		} else {
			$result = array('ok' => false, 'message' => 'A plataforma respondeu com um erro (' . (int) $code . '). Tenta daqui a pouco.');
		}
	}
	$result['endpoint'] = $endpoint;
	set_transient('vnd_fa_check', $result, 10 * MINUTE_IN_SECONDS);
	return $result;
}

function vnd_fa_settings_page() {
	if (!current_user_can('manage_options')) {
		return;
	}
	$o = vnd_fa_options();
	$name = VND_FA_OPTION;
	$force = isset($_GET['vnd_fa_test'], $_GET['_wpnonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'])), 'vnd_fa_test');
	$check = $o['page_url'] !== '' ? vnd_fa_check_connection($o['page_url'], $force) : null;
	$test_url = wp_nonce_url(admin_url('options-general.php?page=vnd-analise-gratis&vnd_fa_test=1'), 'vnd_fa_test');
	$choices = vnd_fa_choices();

	$text = function ($key, $label, $help = '') use ($o, $name) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td>';
		echo '<input type="text" class="regular-text" id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '" value="' . esc_attr($o[$key]) . '">';
		if ($help) {
			echo '<p class="description">' . wp_kses($help, array('code' => array(), 'strong' => array())) . '</p>';
		}
		echo '</td></tr>';
	};
	$area = function ($key, $label, $help = '') use ($o, $name) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td>';
		echo '<textarea class="large-text" rows="3" id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '">' . esc_textarea($o[$key]) . '</textarea>';
		if ($help) {
			echo '<p class="description">' . wp_kses($help, array('code' => array(), 'strong' => array())) . '</p>';
		}
		echo '</td></tr>';
	};
	$check_box = function ($key, $label) use ($o, $name) {
		echo '<label style="display:block;margin:0 0 6px"><input type="checkbox" name="' . esc_attr($name . '[' . $key . ']') . '" value="1"' . checked(vnd_fa_on($o[$key]), true, false) . '> ' . esc_html($label) . '</label>';
	};
	$select = function ($key, $label) use ($o, $name, $choices) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td><select id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '">';
		foreach ($choices[$key] as $value => $text) {
			echo '<option value="' . esc_attr($value) . '"' . selected($o[$key], $value, false) . '>' . esc_html($text) . '</option>';
		}
		echo '</select></td></tr>';
	};
	$color = function ($key, $label) use ($o, $name) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td>';
		echo '<input type="text" class="vnd-fa-color" id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '" value="' . esc_attr($o[$key]) . '" data-default-color="' . esc_attr(vnd_fa_defaults()[$key]) . '">';
		echo '</td></tr>';
	};
	$number = function ($key, $label, $min, $max) use ($o, $name) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td>';
		echo '<input type="number" class="small-text" min="' . (int) $min . '" max="' . (int) $max . '" id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '" value="' . esc_attr($o[$key]) . '"> px';
		echo '</td></tr>';
	};
	?>
	<div class="wrap vnd-fa-admin">
		<h1>Análise grátis do site</h1>
		<p>O formulário “Analisar o meu site grátis” ligado à plataforma VNDesign Leads. Quem o preenche entra como lead quente (com “Ligar” para hoje), o site é analisado e recebe o diagnóstico em PDF por email.</p>

		<h2>Como pôr no site</h2>
		<ul style="list-style:disc;padding-left:20px">
			<li><strong>Bricks Builder:</strong> no editor, procura o elemento <strong>“Análise grátis do site”</strong> (categoria VNDesign). Cada formulário pode ter textos e cores diferentes.</li>
			<li><strong>Outros editores (Gutenberg, Elementor…):</strong> um bloco “Shortcode” com <code>[vndesign_analise_gratis]</code>.</li>
			<li>Mudar só nesse sítio: <code>[vndesign_analise_gratis title="Quer saber o que falha no seu site?" theme="light" show_company="0"]</code></li>
		</ul>

		<form method="post" action="options.php">
			<?php settings_fields('vnd_fa'); ?>

			<h2>Ligação à plataforma</h2>
			<table class="form-table" role="presentation">
				<?php $text('page_url', 'Endereço da página', 'Na plataforma: <strong>Definições → Formulário do site → Analisar o meu site grátis</strong> → Copiar o “Endereço da página”.'); ?>
				<tr><th scope="row">Estado</th><td>
					<?php if (!$check) : ?>
						<span>Ainda não ligado.</span>
					<?php else : ?>
						<span style="color:<?php echo $check['ok'] ? '#008a20' : '#b32d2e'; ?>;font-weight:600"><?php echo esc_html(($check['ok'] ? '✓ ' : '✗ ') . $check['message']); ?></span>
						<a href="<?php echo esc_url($test_url); ?>" style="margin-left:8px">Testar outra vez</a>
					<?php endif; ?>
				</td></tr>
			</table>

			<h2>Textos</h2>
			<table class="form-table" role="presentation">
				<?php
				$text('title', 'Título');
				$select('title_tag', 'Etiqueta do título');
				$area('intro', 'Texto por baixo do título');
				$text('label_website', 'Campo do site: nome');
				$text('placeholder_website', 'Campo do site: exemplo');
				$text('label_email', 'Campo do email: nome');
				$text('placeholder_email', 'Campo do email: exemplo');
				$text('label_name', 'Campo do nome: nome');
				$text('label_company', 'Campo do negócio: nome');
				$area('consent', 'Texto do consentimento', '<code>{negocio}</code> é trocado pelo nome abaixo.');
				$text('business', 'Nome de quem oferece a análise', 'Vazio = o nome do site (' . esc_html(get_bloginfo('name')) . ').');
				$text('button', 'Texto do botão');
				$text('sending', 'Botão enquanto envia');
				$text('success_title', 'Depois de enviar: título');
				$area('success', 'Depois de enviar: texto');
				$text('redirect', 'Depois de enviar, abrir esta página (opcional)', 'Ex.: uma página “Obrigado” com o pixel do Facebook ou o Google Ads. Vazio = mostra o texto acima.');
				?>
			</table>

			<h2>Campos</h2>
			<table class="form-table" role="presentation">
				<tr><th scope="row">Mostrar</th><td>
					<?php
					$check_box('show_title', 'Título');
					$check_box('show_intro', 'Texto por baixo do título');
					$check_box('show_name', 'Campo “O seu nome”');
					$check_box('show_company', 'Campo “Nome do negócio”');
					$check_box('privacy_link', 'Link para a política de privacidade (Definições → Privacidade)');
					?>
					<p class="description">O site e o email são sempre pedidos, e o consentimento também (RGPD).</p>
				</td></tr>
				<?php $select('layout', 'Disposição'); ?>
			</table>

			<h2>Aspeto</h2>
			<table class="form-table" role="presentation">
				<?php
				$select('theme', 'Cores');
				$color('accent', 'Cor de destaque (botão e foco)');
				$color('button_text', 'Cor do texto do botão');
				$number('radius', 'Cantos arredondados', 0, 40);
				$number('max_width', 'Largura máxima', 280, 1600);
				$select('align', 'Posição');
				?>
				<tr><th scope="row">Caixa</th><td><?php $check_box('card', 'Caixa à volta do formulário'); ?></td></tr>
			</table>
			<p class="description">No Bricks dá para mudar mais (letras, fundos, contornos, espaços) no próprio elemento.</p>

			<?php submit_button('Guardar'); ?>
		</form>

		<h2>Pré-visualização</h2>
		<p class="description">Com o que está guardado. Aqui o botão não envia.</p>
		<div class="vnd-fa-preview<?php echo in_array($o['theme'], array('light', 'inherit'), true) ? ' vnd-fa-preview--light' : ($o['theme'] === 'auto' ? ' vnd-fa-preview--auto' : ''); ?>">
			<?php echo vnd_fa_render(array(), true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- já escapado ?>
		</div>
	</div>
	<?php
}
