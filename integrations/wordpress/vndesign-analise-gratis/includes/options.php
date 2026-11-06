<?php
/**
 * Opções do formulário: valores de origem, leitura e o endereço da plataforma.
 */

if (!defined('ABSPATH')) {
	exit;
}

const VND_FA_OPTION = 'vnd_fa_options';

/** Os valores de origem (o que se vê antes de mudar alguma coisa). */
function vnd_fa_defaults() {
	return array(
		// Ligação
		'page_url'            => '',
		// Textos
		'title'               => 'Analisar o meu site grátis',
		'title_tag'           => 'h2',
		'intro'               => 'Em poucos minutos recebe por email um relatório simples do seu site: a velocidade no telemóvel, a segurança, como aparece no Google e o que pode estar a afastar clientes. Sem compromisso.',
		'label_website'       => 'Endereço do site',
		'placeholder_website' => 'www.o-meu-negocio.pt',
		'label_email'         => 'Email para receber a análise',
		'placeholder_email'   => 'nome@exemplo.pt',
		'label_name'          => 'O seu nome',
		'placeholder_name'    => '',
		'label_company'       => 'Nome do negócio',
		'placeholder_company' => '',
		'consent'             => 'Aceito que {negocio} me envie a análise e me contacte sobre ela. Pode pedir para apagar os seus dados a qualquer momento.',
		'business'            => '',
		'button'              => 'Analisar o meu site',
		'sending'             => 'A enviar…',
		'success_title'       => 'Pedido recebido!',
		'success'             => 'Estamos a analisar o seu site: vai receber a análise por email dentro de alguns minutos.',
		'redirect'            => '',
		// Texto de persuasão (ao lado do formulário)
		'promo'                => '1',
		'promo_position'       => 'left',
		'promo_mobile'         => 'before',
		'promo_ratio'          => 'equal',
		'promo_eyebrow'        => 'Análise gratuita · Sem compromisso',
		'promo_title'          => 'O seu site está a afastar clientes sem dar por isso?',
		'promo_title_tag'      => 'h3',
		'promo_text'           => 'Um site lento, com o aviso “Não seguro” ou difícil de encontrar no Google faz perder pedidos todos os dias. Em poucos minutos mostramos-lhe o que está a correr mal e como resolver.',
		'promo_points'         => "Velocidade no telemóvel: quanto tempo os clientes esperam\nSegurança: se aparece o aviso “Não seguro”\nGoogle: como o seu negócio aparece nas pesquisas\nOs pormenores que levam os visitantes a desistir",
		'promo_note'           => 'Recebe o relatório em PDF no seu email, em linguagem simples. Sem custos e sem compromisso.',
		'promo_image_show'     => '1',
		'promo_image'          => '',
		'promo_image_alt'      => 'Exemplo do relatório da análise do site',
		'promo_image_position' => 'top',
		// Campos
		'show_title'          => '1',
		'show_intro'          => '1',
		'show_name'           => '1',
		'show_company'        => '1',
		'privacy_link'        => '1',
		'layout'              => 'stack',
		// Aspeto
		'theme'               => 'dark',
		'card'                => '1',
		'accent'              => '#ef5c32',
		'button_text'         => '#0d0d0d',
		'radius'              => '10',
		'width'               => 'full',
		'max_width'           => '640',
		'max_width_wide'      => '1120',
		'align'               => 'center',
		'columns_gap'         => '',
		// Letra: '' = a do site; um nome da lista; 'custom' = escrever o nome.
		'font_body'           => '',
		'font_body_custom'    => '',
		'font_heading'        => 'inherit',
		'font_heading_custom' => '',
		'font_source'         => 'bunny',
	);
}

/** Valores permitidos nas opções de escolha. */
function vnd_fa_choices() {
	return array(
		'title_tag' => array('h1' => 'H1', 'h2' => 'H2', 'h3' => 'H3', 'h4' => 'H4', 'p' => 'Parágrafo'),
		'layout'    => array('stack' => 'Um campo por linha', 'two' => 'Nome e negócio lado a lado'),
		'theme'     => array('dark' => 'Escuro', 'light' => 'Claro', 'auto' => 'Automático (claro/escuro do visitante)', 'inherit' => 'Usar as cores do meu site'),
		'align'     => array('center' => 'Ao centro', 'left' => 'À esquerda'),
		'width'     => array('full' => 'Toda a largura do sítio onde está', 'max' => 'Até à largura máxima'),
		'font_body'    => array('' => 'A do site') + vnd_fa_font_choices() + array('custom' => 'Outra (escrever o nome)'),
		'font_heading' => array('inherit' => 'A dos títulos do site', 'body' => 'A mesma do texto do formulário') + vnd_fa_font_choices() + array('custom' => 'Outra (escrever o nome)'),
		'font_source'  => array('bunny' => 'Carregar do Bunny Fonts (europeu, sem enviar dados à Google)', 'google' => 'Carregar do Google Fonts', 'none' => 'Não carregar (a letra já está no site)'),
		'promo_position'       => array('left' => 'À esquerda do formulário', 'right' => 'À direita do formulário'),
		'promo_mobile'         => array('before' => 'Antes do formulário', 'after' => 'Depois do formulário'),
		'promo_ratio'          => array('equal' => 'Colunas iguais', 'form' => 'Formulário mais largo', 'promo' => 'Texto mais largo'),
		'promo_title_tag'      => array('h2' => 'H2', 'h3' => 'H3', 'h4' => 'H4', 'p' => 'Parágrafo'),
		'promo_image_position' => array('top' => 'Em cima do texto', 'bottom' => 'Em baixo do texto'),
	);
}

/** Letras conhecidas (Google Fonts e Bunny Fonts): nome => [tipo, pesos]. */
function vnd_fa_fonts() {
	return array(
		'Plus Jakarta Sans' => array('sans-serif', '400;500;600;700;800'),
		'Inter'             => array('sans-serif', '400;500;600;700;800'),
		'Poppins'           => array('sans-serif', '400;500;600;700;800'),
		'Montserrat'        => array('sans-serif', '400;500;600;700;800'),
		'Manrope'           => array('sans-serif', '400;500;600;700;800'),
		'DM Sans'           => array('sans-serif', '400;500;600;700;800'),
		'Outfit'            => array('sans-serif', '400;500;600;700;800'),
		'Sora'              => array('sans-serif', '400;500;600;700;800'),
		'Figtree'           => array('sans-serif', '400;500;600;700;800'),
		'Space Grotesk'     => array('sans-serif', '400;500;600;700'),
		'Work Sans'         => array('sans-serif', '400;500;600;700;800'),
		'Rubik'             => array('sans-serif', '400;500;600;700;800'),
		'Nunito'            => array('sans-serif', '400;500;600;700;800'),
		'Raleway'           => array('sans-serif', '400;500;600;700;800'),
		'Roboto'            => array('sans-serif', '400;500;700'),
		'Open Sans'         => array('sans-serif', '400;500;600;700;800'),
		'Lato'              => array('sans-serif', '400;700'),
		'Playfair Display'  => array('serif', '400;500;600;700;800'),
		'Lora'              => array('serif', '400;500;600;700'),
		'Merriweather'      => array('serif', '400;700'),
	);
}

function vnd_fa_font_choices() {
	$names = array_keys(vnd_fa_fonts());
	return array_combine($names, $names);
}

/** O endereço que vem no plugin descarregado da plataforma (já configurado). */
function vnd_fa_bundled_page_url() {
	$file = VND_FA_DIR . 'config.php';
	if (!is_readable($file)) {
		return '';
	}
	$config = include $file;
	return is_array($config) && !empty($config['page_url']) ? (string) $config['page_url'] : '';
}

/** As opções guardadas, por cima dos valores de origem. */
function vnd_fa_options() {
	$saved = get_option(VND_FA_OPTION, array());
	$options = array_merge(vnd_fa_defaults(), is_array($saved) ? $saved : array());
	if ($options['page_url'] === '') {
		$options['page_url'] = vnd_fa_bundled_page_url();
	}
	return $options;
}

/**
 * "https://leads.vndesign.pt/analise/CÓDIGO" → ['base' => 'https://leads.vndesign.pt', 'token' => 'CÓDIGO'].
 * Também aceita só o código (usa a plataforma VNDesign).
 */
function vnd_fa_parse_page_url($value) {
	$value = trim((string) $value);
	if ($value === '') {
		return null;
	}
	if (preg_match('~^[A-Za-z0-9_-]{16,64}$~', $value)) {
		return array('base' => 'https://leads.vndesign.pt', 'token' => $value);
	}
	if (preg_match('~^(https?://[^/\s?#]+)(?:/[^\s?#]*)?/analise/([A-Za-z0-9_-]{16,64})(?:[/?#]|$)~i', $value, $m)) {
		return array('base' => rtrim($m[1], '/'), 'token' => $m[2]);
	}
	return null;
}

/** O endereço para onde o formulário envia (ou null se ainda não estiver configurado). */
function vnd_fa_endpoint($page_url) {
	$parsed = vnd_fa_parse_page_url($page_url);
	return $parsed ? $parsed['base'] . '/api/v1/public/free-audit/' . $parsed['token'] : null;
}

function vnd_fa_activate() {
	$saved = get_option(VND_FA_OPTION, null);
	if (!is_array($saved)) {
		$bundled = vnd_fa_bundled_page_url();
		add_option(VND_FA_OPTION, $bundled !== '' ? array('page_url' => $bundled) : array());
	}
}
