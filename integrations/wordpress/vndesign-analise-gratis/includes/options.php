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
		'promo_position'       => array('left' => 'À esquerda do formulário', 'right' => 'À direita do formulário'),
		'promo_mobile'         => array('before' => 'Antes do formulário', 'after' => 'Depois do formulário'),
		'promo_ratio'          => array('equal' => 'Colunas iguais', 'form' => 'Formulário mais largo', 'promo' => 'Texto mais largo'),
		'promo_title_tag'      => array('h2' => 'H2', 'h3' => 'H3', 'h4' => 'H4', 'p' => 'Parágrafo'),
		'promo_image_position' => array('top' => 'Em cima do texto', 'bottom' => 'Em baixo do texto'),
	);
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
