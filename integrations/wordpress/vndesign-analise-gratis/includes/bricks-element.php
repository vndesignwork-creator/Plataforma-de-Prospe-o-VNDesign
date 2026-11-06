<?php
/**
 * Elemento do Bricks Builder: "Análise grátis do site" (categoria VNDesign).
 * Os campos vazios usam o que está em Definições → Análise grátis.
 */

if (!defined('ABSPATH')) {
	exit;
}

class VND_FA_Bricks_Element extends \Bricks\Element {
	public $category = 'vndesign';
	public $name     = 'vnd-free-audit';
	public $icon     = 'ti-search';
	public $tag      = 'div';

	public function get_label() {
		return 'Análise grátis do site';
	}

	public function get_keywords() {
		return array('vndesign', 'análise', 'analise', 'formulário', 'form', 'lead', 'diagnóstico', 'site');
	}

	public function enqueue_scripts() {
		vnd_fa_enqueue();
		// A letra escolhida carrega-se já aqui (antes do elemento), também dentro do editor do Bricks.
		vnd_fa_enqueue_fonts(vnd_fa_resolve($this->overrides()));
	}

	public function set_control_groups() {
		$this->control_groups['vnd_texts']  = array('title' => 'Textos', 'tab' => 'content');
		$this->control_groups['vnd_fields'] = array('title' => 'Campos e comportamento', 'tab' => 'content');
		$this->control_groups['vnd_promo']  = array('title' => 'Texto de persuasão', 'tab' => 'content');
		$this->control_groups['vnd_look']   = array('title' => 'Aspeto', 'tab' => 'content');
		$this->control_groups['vnd_title']  = array('title' => 'Estilo: título e texto', 'tab' => 'content');
		$this->control_groups['vnd_inputs'] = array('title' => 'Estilo: campos', 'tab' => 'content');
		$this->control_groups['vnd_button'] = array('title' => 'Estilo: botão', 'tab' => 'content');
		$this->control_groups['vnd_promo_style'] = array('title' => 'Estilo: texto de persuasão', 'tab' => 'content');
	}

	public function set_controls() {
		$d = vnd_fa_options();
		$show = array('1' => 'Mostrar', '0' => 'Esconder');
		$choices = vnd_fa_choices();

		$this->controls['vnd_info'] = array(
			'tab'     => 'content',
			'type'    => 'info',
			'content' => 'Os campos vazios usam o que está em Definições → Análise grátis (no painel do WordPress).',
		);

		// Textos
		$texts = array(
			'title'               => array('Título', 'text'),
			'intro'               => array('Texto por baixo do título', 'textarea'),
			'label_website'       => array('Campo do site: nome', 'text'),
			'placeholder_website' => array('Campo do site: exemplo', 'text'),
			'label_email'         => array('Campo do email: nome', 'text'),
			'placeholder_email'   => array('Campo do email: exemplo', 'text'),
			'label_name'          => array('Campo do nome: nome', 'text'),
			'label_company'       => array('Campo do negócio: nome', 'text'),
			'consent'             => array('Texto do consentimento ({negocio} = o teu nome)', 'textarea'),
			'button'              => array('Texto do botão', 'text'),
			'example_label'       => array('Texto do link do exemplo', 'text'),
			'sending'             => array('Botão enquanto envia', 'text'),
			'success_title'       => array('Depois de enviar: título', 'text'),
			'success'             => array('Depois de enviar: texto', 'textarea'),
		);
		foreach ($texts as $key => $def) {
			$this->controls[$key] = array(
				'tab'            => 'content',
				'group'          => 'vnd_texts',
				'label'          => $def[0],
				'type'           => $def[1],
				'placeholder'    => wp_strip_all_tags((string) $d[$key]),
				'hasDynamicData' => $def[1] === 'text' ? 'text' : false,
			);
		}
		$this->controls['title_tag'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_texts',
			'label'       => 'Etiqueta do título',
			'type'        => 'select',
			'options'     => $choices['title_tag'],
			'inline'      => true,
			'placeholder' => $choices['title_tag'][$d['title_tag']],
		);

		// Campos e comportamento
		foreach (array(
			'show_title'   => 'Título',
			'show_intro'   => 'Texto por baixo do título',
			'show_name'    => 'Campo “O seu nome”',
			'show_company' => 'Campo “Nome do negócio”',
			'privacy_link' => 'Link da política de privacidade',
			'show_example' => 'Link “Ver um exemplo do relatório”',
			'promo_hide_form_title' => 'Com o texto ao lado, esconder o título do formulário',
		) as $key => $label) {
			$this->controls[$key] = array(
				'tab'         => 'content',
				'group'       => 'vnd_fields',
				'label'       => $label,
				'type'        => 'select',
				'options'     => $show,
				'inline'      => true,
				'placeholder' => $show[vnd_fa_on($d[$key]) ? '1' : '0'],
			);
		}
		$this->controls['layout'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_fields',
			'label'       => 'Disposição',
			'type'        => 'select',
			'options'     => $choices['layout'],
			'placeholder' => $choices['layout'][$d['layout']],
		);
		$this->controls['redirect'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_fields',
			'label'       => 'Depois de enviar, abrir esta página (opcional)',
			'type'        => 'text',
			'placeholder' => 'https://…/obrigado',
		);
		$this->controls['page_url'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_fields',
			'label'       => 'Outro endereço da página (opcional)',
			'type'        => 'text',
			'placeholder' => 'O das definições',
			'description' => 'Só se este formulário for de outra conta da plataforma.',
		);

		// Texto de persuasão
		$this->controls['promo'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Texto de persuasão ao lado do formulário',
			'type'        => 'select',
			'options'     => $show,
			'inline'      => true,
			'placeholder' => $show[vnd_fa_on($d['promo']) ? '1' : '0'],
		);
		foreach (array(
			'promo_position'       => 'Posição do texto',
			'promo_mobile'         => 'No telemóvel, o texto fica',
			'promo_ratio'          => 'Largura das colunas',
		) as $key => $label) {
			$this->controls[$key] = array(
				'tab'         => 'content',
				'group'       => 'vnd_promo',
				'label'       => $label,
				'type'        => 'select',
				'options'     => $choices[$key],
				'placeholder' => $choices[$key][$d[$key]],
				'required'    => array('promo', '!=', '0'),
			);
		}
		$promo_texts = array(
			'promo_eyebrow' => array('Etiqueta por cima do título', 'text'),
			'promo_title'   => array('Título', 'text'),
			'promo_text'    => array('Texto', 'textarea'),
			'promo_points'  => array('Vantagens (uma por linha)', 'textarea'),
			'promo_note'    => array('Nota no fim', 'textarea'),
		);
		foreach ($promo_texts as $key => $def) {
			$this->controls[$key] = array(
				'tab'            => 'content',
				'group'          => 'vnd_promo',
				'label'          => $def[0],
				'type'           => $def[1],
				'placeholder'    => wp_strip_all_tags((string) $d[$key]),
				'hasDynamicData' => $def[1] === 'text' ? 'text' : false,
				'required'       => array('promo', '!=', '0'),
			);
		}
		$this->controls['promo_title_tag'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Etiqueta do título',
			'type'        => 'select',
			'options'     => $choices['promo_title_tag'],
			'inline'      => true,
			'placeholder' => $choices['promo_title_tag'][$d['promo_title_tag']],
			'required'    => array('promo', '!=', '0'),
		);
		$this->controls['promo_image_show'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Imagem',
			'type'        => 'select',
			'options'     => $show,
			'inline'      => true,
			'placeholder' => $show[vnd_fa_on($d['promo_image_show']) ? '1' : '0'],
			'required'    => array('promo', '!=', '0'),
		);
		$this->controls['promo_image'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Escolher outra imagem',
			'type'        => 'image',
			'description' => 'Vazio = a das definições (ou a ilustração do relatório).',
			'required'    => array('promo', '!=', '0'),
		);
		$this->controls['promo_image_alt'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Descrição da imagem (para quem não vê)',
			'type'        => 'text',
			'placeholder' => $d['promo_image_alt'],
			'required'    => array('promo', '!=', '0'),
		);
		$this->controls['promo_image_position'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Posição da imagem',
			'type'        => 'select',
			'options'     => $choices['promo_image_position'],
			'inline'      => true,
			'placeholder' => $choices['promo_image_position'][$d['promo_image_position']],
			'required'    => array('promo', '!=', '0'),
		);
		$this->controls['max_width_wide'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_promo',
			'label'       => 'Largura máxima com o texto (px)',
			'type'        => 'number',
			'min'         => 600,
			'max'         => 2000,
			'placeholder' => $d['max_width_wide'],
			'required'    => array('promo', '!=', '0'),
		);

		// Estilo: texto de persuasão
		foreach (array(
			'promo_title_typography' => array('Título', '.vnd-fa__promo-title'),
			'promo_text_typography'  => array('Texto', '.vnd-fa__promo-text'),
			'promo_points_typography' => array('Vantagens', '.vnd-fa__points'),
			'promo_eyebrow_typography' => array('Etiqueta', '.vnd-fa__eyebrow'),
		) as $key => $def) {
			$this->controls[$key] = array(
				'tab'   => 'content',
				'group' => 'vnd_promo_style',
				'label' => $def[0],
				'type'  => 'typography',
				'css'   => array(array('property' => 'font', 'selector' => $def[1])),
			);
		}
		$this->controls['promo_background'] = array(
			'tab'   => 'content',
			'group' => 'vnd_promo_style',
			'label' => 'Fundo do texto',
			'type'  => 'color',
			'css'   => array(array('property' => 'background-color', 'selector' => '.vnd-fa__promo')),
		);
		$this->controls['promo_padding'] = array(
			'tab'   => 'content',
			'group' => 'vnd_promo_style',
			'label' => 'Espaço à volta do texto',
			'type'  => 'dimensions',
			'css'   => array(array('property' => 'padding', 'selector' => '.vnd-fa__promo')),
		);
		$this->controls['promo_border'] = array(
			'tab'   => 'content',
			'group' => 'vnd_promo_style',
			'label' => 'Contorno do texto',
			'type'  => 'border',
			'css'   => array(array('property' => 'border', 'selector' => '.vnd-fa__promo')),
		);
		$this->controls['promo_image_border'] = array(
			'tab'   => 'content',
			'group' => 'vnd_promo_style',
			'label' => 'Contorno e cantos da imagem',
			'type'  => 'border',
			'css'   => array(array('property' => 'border', 'selector' => '.vnd-fa__media')),
		);

		// Aspeto
		$this->controls['theme'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Cores',
			'type'        => 'select',
			'options'     => $choices['theme'],
			'placeholder' => $choices['theme'][$d['theme']],
		);
		$this->controls['card'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Caixa à volta do formulário',
			'type'        => 'select',
			'options'     => $show,
			'inline'      => true,
			'placeholder' => $show[vnd_fa_on($d['card']) ? '1' : '0'],
		);
		$this->controls['align'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Posição',
			'type'        => 'select',
			'options'     => $choices['align'],
			'inline'      => true,
			'placeholder' => $choices['align'][$d['align']],
		);
		$this->controls['accent'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Cor de destaque (botão, foco, caixa)',
			'type'  => 'color',
		);
		$this->controls['button_text'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Cor do texto do botão',
			'type'  => 'color',
		);
		$this->controls['radius'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Cantos arredondados (px)',
			'type'        => 'number',
			'min'         => 0,
			'max'         => 40,
			'placeholder' => $d['radius'],
		);
		$this->controls['font_body'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Letra do texto',
			'type'        => 'select',
			'options'     => $choices['font_body'],
			'searchable'  => true,
			'placeholder' => $choices['font_body'][$d['font_body']] ?? 'A do site',
		);
		$this->controls['font_body_custom'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Nome da letra do texto',
			'type'        => 'text',
			'placeholder' => 'ex.: Urbanist',
			'required'    => array('font_body', '=', 'custom'),
		);
		$this->controls['font_heading'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Letra dos títulos',
			'type'        => 'select',
			'options'     => $choices['font_heading'],
			'searchable'  => true,
			'placeholder' => $choices['font_heading'][$d['font_heading']] ?? 'A dos títulos do site',
		);
		$this->controls['font_heading_custom'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Nome da letra dos títulos',
			'type'        => 'text',
			'placeholder' => 'ex.: Urbanist',
			'required'    => array('font_heading', '=', 'custom'),
		);
		$this->controls['font_source'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Carregar a letra',
			'type'        => 'select',
			'options'     => $choices['font_source'],
			'placeholder' => $choices['font_source'][$d['font_source']],
			'description' => 'Escolhe “Não carregar” se a letra já estiver no site (ex.: carregada no Bricks).',
		);
		$this->controls['width'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Largura',
			'type'        => 'select',
			'options'     => $choices['width'],
			'placeholder' => $choices['width'][$d['width']],
			'description' => 'Toda a largura = a do contentor do Bricks onde está (como o resto da secção).',
		);
		$this->controls['columns_gap'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Espaço entre o formulário e o texto (px)',
			'type'        => 'number',
			'min'         => 0,
			'max'         => 200,
			'placeholder' => 'Automático',
		);
		$this->controls['max_width'] = array(
			'tab'         => 'content',
			'group'       => 'vnd_look',
			'label'       => 'Largura máxima só com o formulário (px)',
			'type'        => 'number',
			'min'         => 280,
			'max'         => 1600,
			'placeholder' => $d['max_width'],
		);
		$this->controls['card_background'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Fundo da caixa',
			'type'  => 'color',
			'css'   => array(
				array('property' => 'background-color', 'selector' => '.vnd-fa__form'),
				array('property' => 'background-color', 'selector' => '.vnd-fa__success'),
			),
		);
		$this->controls['card_border'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Contorno da caixa',
			'type'  => 'border',
			'css'   => array(
				array('property' => 'border', 'selector' => '.vnd-fa__form'),
				array('property' => 'border', 'selector' => '.vnd-fa__success'),
			),
		);
		$this->controls['card_padding'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Espaço dentro da caixa',
			'type'  => 'dimensions',
			'css'   => array(
				array('property' => 'padding', 'selector' => '.vnd-fa__form'),
				array('property' => 'padding', 'selector' => '.vnd-fa__success'),
			),
		);
		$this->controls['text_color'] = array(
			'tab'   => 'content',
			'group' => 'vnd_look',
			'label' => 'Cor do texto',
			'type'  => 'color',
			'css'   => array(array('property' => 'color')),
		);

		// Estilo: título e texto
		$this->controls['title_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_title',
			'label' => 'Título',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__title')),
		);
		$this->controls['intro_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_title',
			'label' => 'Texto por baixo do título',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__intro')),
		);
		$this->controls['label_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_title',
			'label' => 'Nomes dos campos',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__label')),
		);
		$this->controls['consent_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_title',
			'label' => 'Consentimento',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__consent')),
		);

		// Estilo: campos
		$this->controls['input_background'] = array(
			'tab'   => 'content',
			'group' => 'vnd_inputs',
			'label' => 'Fundo',
			'type'  => 'color',
			'css'   => array(array('property' => 'background-color', 'selector' => '.vnd-fa__input')),
		);
		$this->controls['input_border'] = array(
			'tab'   => 'content',
			'group' => 'vnd_inputs',
			'label' => 'Contorno',
			'type'  => 'border',
			'css'   => array(array('property' => 'border', 'selector' => '.vnd-fa__input')),
		);
		$this->controls['input_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_inputs',
			'label' => 'Letra',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__input')),
		);
		$this->controls['input_padding'] = array(
			'tab'   => 'content',
			'group' => 'vnd_inputs',
			'label' => 'Espaço dentro',
			'type'  => 'dimensions',
			'css'   => array(array('property' => 'padding', 'selector' => '.vnd-fa__input')),
		);

		// Estilo: botão
		$this->controls['button_background'] = array(
			'tab'   => 'content',
			'group' => 'vnd_button',
			'label' => 'Fundo',
			'type'  => 'color',
			'css'   => array(array('property' => 'background-color', 'selector' => '.vnd-fa__button')),
		);
		$this->controls['button_typography'] = array(
			'tab'   => 'content',
			'group' => 'vnd_button',
			'label' => 'Letra',
			'type'  => 'typography',
			'css'   => array(array('property' => 'font', 'selector' => '.vnd-fa__button')),
		);
		$this->controls['button_border'] = array(
			'tab'   => 'content',
			'group' => 'vnd_button',
			'label' => 'Contorno',
			'type'  => 'border',
			'css'   => array(array('property' => 'border', 'selector' => '.vnd-fa__button')),
		);
		$this->controls['button_padding'] = array(
			'tab'   => 'content',
			'group' => 'vnd_button',
			'label' => 'Espaço dentro',
			'type'  => 'dimensions',
			'css'   => array(array('property' => 'padding', 'selector' => '.vnd-fa__button')),
		);
		$this->controls['button_width'] = array(
			'tab'     => 'content',
			'group'   => 'vnd_button',
			'label'   => 'Largura',
			'type'    => 'select',
			'options' => array('100%' => 'Toda a largura', 'auto' => 'Só o texto'),
			'inline'  => true,
			'css'     => array(array('property' => 'width', 'selector' => '.vnd-fa__button')),
		);
	}

	/** Uma cor do Bricks (hex, rgb ou variável) em texto. */
	private static function color_value($value) {
		if (is_array($value)) {
			foreach (array('hex', 'rgb', 'raw') as $key) {
				if (!empty($value[$key])) {
					return (string) $value[$key];
				}
			}
			return '';
		}
		return is_string($value) ? $value : '';
	}

	/** As definições deste elemento por cima das gerais (os vazios ficam com as gerais). */
	private function overrides() {
		$s = is_array($this->settings) ? $this->settings : array();
		// A imagem do Bricks vem como { id, url, size }.
		if (isset($s['promo_image']) && is_array($s['promo_image'])) {
			$img = $s['promo_image'];
			$url = !empty($img['id']) && function_exists('wp_get_attachment_image_url') ? wp_get_attachment_image_url((int) $img['id'], !empty($img['size']) ? $img['size'] : 'large') : '';
			$s['promo_image'] = $url ?: (!empty($img['url']) ? (string) $img['url'] : '');
		}
		$overrides = array();
		foreach (array_keys(vnd_fa_defaults()) as $key) {
			if (!isset($s[$key]) || in_array($key, array('accent', 'button_text'), true)) {
				continue;
			}
			$value = $s[$key];
			if (is_string($value) && function_exists('bricks_render_dynamic_data')) {
				$value = bricks_render_dynamic_data($value, $this->post_id);
			}
			$overrides[$key] = is_scalar($value) ? (string) $value : '';
		}
		return $overrides;
	}

	public function render() {
		$s = is_array($this->settings) ? $this->settings : array();
		$o = vnd_fa_resolve($this->overrides());
		// As cores do Bricks podem ser variáveis (var(--…)): vão diretas para o CSS.
		$extra = array();
		foreach (array('accent' => '--vnd-fa-accent', 'button_text' => '--vnd-fa-button-text') as $key => $var) {
			$color = isset($s[$key]) ? self::color_value($s[$key]) : '';
			if ($color !== '' && preg_match('~^(#[0-9a-f]{3,8}|rgba?\([^;{}]*\)|hsla?\([^;{}]*\)|var\(--[\w-]+\))$~i', $color)) {
				$extra[] = $var . ':' . $color;
			}
		}

		$inner = vnd_fa_render_inner($o);
		if ($inner === '') {
			return;
		}
		vnd_fa_enqueue_fonts($o); // se o Bricks não chamou enqueue_scripts (ex.: num modelo), o WordPress põe-na no fim da página
		$style = trim(vnd_fa_root_style($o) . ($extra ? ';' . implode(';', $extra) : ''), ';');
		$this->set_attribute('_root', 'class', vnd_fa_root_classes($o));
		if ($style !== '') {
			$this->set_attribute('_root', 'style', $style);
		}
		$this->set_attribute('_root', 'data-vnd-fa', '');
		echo "<div {$this->render_attributes('_root')}>" . $inner . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- já escapado em vnd_fa_render_inner()
	}
}
