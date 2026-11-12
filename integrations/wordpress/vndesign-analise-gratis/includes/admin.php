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
	// Escolher a imagem do texto de persuasão na biblioteca.
	wp_enqueue_media();
	wp_add_inline_script('wp-color-picker', 'jQuery(function($){var frame;$(document).on("click",".vnd-fa-pick",function(e){e.preventDefault();var box=$(this).closest(".vnd-fa-image");if(!frame){frame=wp.media({title:"Imagem do texto de persuasão",button:{text:"Usar esta imagem"},library:{type:"image"},multiple:false});}frame.off("select").on("select",function(){var a=frame.state().get("selection").first().toJSON();var url=(a.sizes&&a.sizes.large?a.sizes.large.url:a.url);box.find("input").val(url);box.find("img").attr("src",url);if(a.alt){$("#vnd-fa-promo_image_alt").val(a.alt);}});frame.open();});$(document).on("click",".vnd-fa-reset",function(e){e.preventDefault();var box=$(this).closest(".vnd-fa-image");box.find("input").val("");box.find("img").attr("src",box.data("default"));});});');
	vnd_fa_enqueue();
	wp_add_inline_style('vnd-fa', '.vnd-fa-preview{padding:24px;border-radius:8px;background:#0d0d0d}.vnd-fa-preview--light{background:#f5f2ed}@media (prefers-color-scheme:light){.vnd-fa-preview--auto{background:#f5f2ed}}.vnd-fa-admin .form-table th{width:260px}.vnd-fa-admin textarea.large-text{min-height:72px}.vnd-fa-admin code{user-select:all}');
});

/** Limpa o que vem do formulário das definições. */
function vnd_fa_sanitize($input) {
	$input = is_array($input) ? $input : array();
	$defaults = vnd_fa_defaults();
	$choices = vnd_fa_choices();
	$checkboxes = array('show_title', 'show_intro', 'show_name', 'show_company', 'privacy_link', 'card', 'animate', 'promo', 'promo_image_show', 'show_example', 'promo_hide_form_title');
	$textareas = array('intro', 'consent', 'success', 'promo_text', 'promo_points', 'promo_note');
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
		} elseif ($key === 'page_url' || $key === 'redirect' || $key === 'promo_image') {
			$out[$key] = trim(esc_url_raw(trim((string) $value)));
		} elseif ($key === 'accent' || $key === 'button_text') {
			$out[$key] = sanitize_hex_color($value) ?: $default;
		} elseif ($key === 'radius' || $key === 'max_width' || $key === 'max_width_wide') {
			$out[$key] = is_numeric($value) ? (string) absint($value) : $default;
		} elseif ($key === 'columns_gap') {
			$out[$key] = is_numeric($value) ? (string) absint($value) : ''; // vazio = automático
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
	$res = wp_remote_get($endpoint, array('timeout' => 8, 'headers' => array('Accept' => 'application/json', 'X-VND-Plugin-Version' => VND_FA_VERSION)));
	if (is_wp_error($res)) {
		$result = array('ok' => false, 'message' => 'Não foi possível falar com a plataforma (' . $res->get_error_message() . ').');
	} else {
		$code = wp_remote_retrieve_response_code($res);
		$body = json_decode(wp_remote_retrieve_body($res), true);
		if ($code === 200 && is_array($body) && !empty($body['ok'])) {
			$company = !empty($body['company']) ? ' (' . $body['company'] . ')' : '';
			$result = array('ok' => true, 'message' => 'Ligado à plataforma' . $company . '. Os pedidos chegam como leads quentes.');
			// Há uma versão nova do plugin na plataforma?
			$latest = !empty($body['plugin_version']) && is_string($body['plugin_version']) && preg_match('~^\d{1,3}(\.\d{1,3}){1,2}$~', $body['plugin_version']) ? $body['plugin_version'] : '';
			if ($latest !== '' && version_compare(VND_FA_VERSION, $latest, '<')) {
				$result['message'] .= ' Há uma versão nova do plugin (' . $latest . '; tens a ' . VND_FA_VERSION . '): descarrega-a na plataforma (Definições → Formulário do site → Descarregar o plugin) e carrega-a em Plugins → Adicionar novo → Carregar plugin → Substituir o atual.';
			}
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
	$select = function ($key, $label, $help = '') use ($o, $name, $choices) {
		echo '<tr><th scope="row"><label for="vnd-fa-' . esc_attr($key) . '">' . esc_html($label) . '</label></th><td><select id="vnd-fa-' . esc_attr($key) . '" name="' . esc_attr($name . '[' . $key . ']') . '">';
		foreach ($choices[$key] as $value => $text) {
			echo '<option value="' . esc_attr($value) . '"' . selected((string) $o[$key], (string) $value, false) . '>' . esc_html($text) . '</option>';
		}
		echo '</select>';
		if ($help) {
			echo '<p class="description">' . esc_html($help) . '</p>';
		}
		echo '</td></tr>';
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
				$text('example_label', 'Texto do link do exemplo');
				$text('redirect', 'Depois de enviar, abrir esta página (opcional)', 'Ex.: uma página “Obrigado” com o pixel do Facebook ou o Google Ads. Vazio = mostra o texto acima.');
				?>
			</table>

			<h2>Texto de persuasão</h2>
			<p class="description">Ao lado do formulário: uma imagem, um título, o texto e as vantagens. No telemóvel fica por baixo (ou por cima) do formulário.</p>
			<table class="form-table" role="presentation">
				<tr><th scope="row">Mostrar</th><td><?php $check_box('promo', 'Mostrar o texto de persuasão ao lado do formulário'); $check_box('promo_hide_form_title', 'Com o texto ao lado, esconder o título e o texto do formulário (um título a menos)'); ?></td></tr>
				<?php
				$select('promo_position', 'Posição');
				$select('promo_mobile', 'No telemóvel, o texto fica');
				$select('promo_ratio', 'Largura das colunas');
				$text('promo_eyebrow', 'Etiqueta por cima do título', 'Vazio = sem etiqueta.');
				$text('promo_title', 'Título');
				$select('promo_title_tag', 'Etiqueta do título');
				$area('promo_text', 'Texto');
				$area('promo_points', 'Vantagens', 'Uma por linha (aparecem com um visto).');
				$area('promo_note', 'Nota no fim', 'Ex.: o que recebe e quando. Vazio = sem nota.');
				?>
				<tr><th scope="row">Imagem</th><td>
					<?php $check_box('promo_image_show', 'Mostrar a imagem'); ?>
					<div class="vnd-fa-image" data-default="<?php echo esc_url(VND_FA_URL . 'assets/ilustracao-relatorio.svg?ver=' . VND_FA_VERSION); ?>" style="margin-top:8px">
						<img src="<?php echo esc_url(vnd_fa_promo_image_url($o)); ?>" alt="" style="display:block;width:240px;max-width:100%;height:auto;border-radius:8px;border:1px solid #dcdcde;margin-bottom:8px">
						<input type="hidden" name="<?php echo esc_attr($name . '[promo_image]'); ?>" value="<?php echo esc_attr($o['promo_image']); ?>">
						<button type="button" class="button vnd-fa-pick">Escolher imagem</button>
						<button type="button" class="button-link vnd-fa-reset" style="margin-left:8px">Usar a ilustração do plugin</button>
					</div>
				</td></tr>
				<?php
				$text('promo_image_alt', 'Descrição da imagem', 'Para quem não vê a imagem (leitores de ecrã) e para o Google.');
				$select('promo_image_position', 'Posição da imagem');
				$number('max_width_wide', 'Largura máxima com o texto', 600, 2000);
				?>
				<tr><td colspan="2" style="padding-left:0"><p class="description">As larguras máximas só contam com “Largura: Até à largura máxima” (em Aspeto). Com “Toda a largura”, o formulário ocupa a secção onde está, como o teu formulário de contacto.</p></td></tr>
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
					$check_box('show_example', 'Link “Ver um exemplo do relatório (PDF)” por baixo do botão');
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
				$select('font_body', 'Letra do texto');
				$text('font_body_custom', 'Nome da letra do texto', 'Só com “Outra”: o nome exato, ex.: <code>Urbanist</code>.');
				$select('font_heading', 'Letra dos títulos');
				$text('font_heading_custom', 'Nome da letra dos títulos', 'Só com “Outra”.');
				$select('font_source', 'Carregar a letra', 'Se a letra já estiver no site (ex.: carregada no Bricks ou no tema), escolhe “Não carregar”.');
				$select('width', 'Largura');
				$number('max_width', 'Largura máxima só com o formulário', 280, 1600);
				$select('align', 'Posição');
				$number('columns_gap', 'Espaço entre o formulário e o texto', 0, 200);
				?>
				<tr><th scope="row">Caixa</th><td><?php $check_box('card', 'Contorno à volta do formulário (sem fundo)'); ?></td></tr>
				<tr><th scope="row">Animações</th><td><?php $check_box('animate', 'Os elementos sobem e aparecem ao entrar no ecrã (como no site)'); ?></td></tr>
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
