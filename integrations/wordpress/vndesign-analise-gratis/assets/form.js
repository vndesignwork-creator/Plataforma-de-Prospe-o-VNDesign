/* VNDesign — Análise grátis do site: envia o pedido sem sair da página. */
(function () {
	'use strict';

	var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function field(form, name) {
		return form.querySelector('[name="' + name + '"]');
	}

	function setError(form, name, message, warning) {
		var input = field(form, name);
		var box = form.querySelector('[data-error-for="' + name + '"]');
		if (input) {
			if (message && !warning) input.setAttribute('aria-invalid', 'true');
			else input.removeAttribute('aria-invalid');
		}
		if (box) {
			box.textContent = message || '';
			box.hidden = !message;
			box.classList.toggle('is-warning', !!(message && warning));
		}
	}

	function setStatus(form, message) {
		var box = form.querySelector('.vnd-fa__status');
		if (!box) return;
		box.textContent = message || '';
		box.hidden = !message;
	}

	function clear(form) {
		var boxes = form.querySelectorAll('[data-error-for]');
		for (var i = 0; i < boxes.length; i++) {
			var name = boxes[i].getAttribute('data-error-for');
			if (name === 'website' && form.vndSiteWarning) continue;
			setError(form, name, '');
		}
		setStatus(form, '');
	}

	function button(form) {
		return form.querySelector('.vnd-fa__button');
	}

	/* ---------- De onde veio o pedido (página e campanha) ---------- */
	var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
	function source() {
		var out = {};
		try {
			var params = new URLSearchParams(window.location.search);
			var saved = {};
			try {
				saved = JSON.parse(window.sessionStorage.getItem('vnd_fa_utm') || '{}') || {};
			} catch (e) {
				saved = {};
			}
			var found = false;
			for (var i = 0; i < UTM.length; i++) {
				if (params.get(UTM[i])) found = true;
			}
			// A campanha da primeira página da visita (se o visitante navegou dentro do site).
			for (var j = 0; j < UTM.length; j++) {
				var v = found ? params.get(UTM[j]) : saved[UTM[j]];
				if (v) out[UTM[j]] = String(v).slice(0, 150);
			}
			if (found) {
				try {
					window.sessionStorage.setItem('vnd_fa_utm', JSON.stringify(out));
				} catch (e) {
					/* sem armazenamento: segue */
				}
			}
			out.page = window.location.href.slice(0, 500);
			if (document.referrer) out.referrer = document.referrer.slice(0, 500);
		} catch (e) {
			/* sem acesso: segue sem origem */
		}
		return out;
	}
	// Guarda a campanha logo à chegada (mesmo antes de chegar à página do formulário).
	source();

	/* ---------- "O site abre?" ---------- */
	function checkSite(form, value) {
		var url = (value || '').trim();
		var endpoint = form.getAttribute('data-check');
		if (!url || !endpoint || !window.fetch) return Promise.resolve(true);
		if (form.vndChecked === url) return Promise.resolve(!form.vndSiteWarning);
		form.vndChecked = url;
		return fetch(endpoint + '?url=' + encodeURIComponent(url))
			.then(function (res) {
				return res.json();
			})
			.then(function (data) {
				var bad = data && data.ok === false;
				form.vndSiteWarning = bad;
				setError(form, 'website', bad ? data.message : '', true);
				var b = button(form);
				if (b) b.textContent = bad ? 'Enviar na mesma' : b.getAttribute('data-label') || b.textContent;
				return !bad;
			})
			.catch(function () {
				return true;
			});
	}

	/* ---------- Cloudflare Turnstile ---------- */
	var turnstileLoading = false;
	function renderTurnstile() {
		var boxes = document.querySelectorAll('.vnd-fa__turnstile[data-sitekey]:not([data-rendered])');
		if (!boxes.length) return;
		if (!window.turnstile) {
			if (turnstileLoading) return;
			turnstileLoading = true;
			var s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			s.async = true;
			s.onload = renderTurnstile;
			document.head.appendChild(s);
			return;
		}
		for (var i = 0; i < boxes.length; i++) {
			(function (box) {
				box.setAttribute('data-rendered', '');
				var form = box.closest('form');
				box.vndId = window.turnstile.render(box, {
					sitekey: box.getAttribute('data-sitekey'),
					language: 'pt-PT',
					callback: function (t) {
						if (form) form.vndTurnstile = t;
					},
					'expired-callback': function () {
						if (form) form.vndTurnstile = null;
					},
				});
			})(boxes[i]);
		}
	}

	/* ---------- O primeiro resultado no ecrã ---------- */
	function esc(text) {
		var d = document.createElement('div');
		d.textContent = text == null ? '' : String(text);
		return d.innerHTML;
	}

	function showResult(box, s) {
		var rows = [
			['Velocidade no telemóvel', s.speed.score != null ? s.speed.score + '/100 · ' + s.speed.label : s.speed.label, s.speed.tone],
			['Telemóvel', s.mobile.label, s.mobile.tone],
			['Segurança', s.security.label, s.security.tone],
		];
		var html = '<p class="vnd-fa__result-title">O primeiro resultado:</p><dl class="vnd-fa__result-grid">';
		for (var i = 0; i < rows.length; i++) {
			html += '<div><dt>' + esc(rows[i][0]) + '</dt><dd class="vnd-fa__tone-' + esc(rows[i][2]) + '">' + esc(rows[i][1]) + '</dd></div>';
		}
		html += '</dl>';
		if (s.issues && s.issues.length) {
			html += '<div><p class="vnd-fa__result-title">O que mais pesa:</p><ul>';
			for (var j = 0; j < s.issues.length; j++) html += '<li>' + esc(s.issues[j]) + '</li>';
			html += '</ul></div>';
		}
		html += '<p>O relatório completo, com o que fazer em cada ponto, segue em PDF para o seu email.</p>';
		box.innerHTML = html;
		box.hidden = false;
	}

	function poll(form, box, request) {
		var base = form.getAttribute('data-status');
		if (!base || !request || !box) return;
		box.innerHTML = '<span class="vnd-fa__waiting"><span class="vnd-fa__spinner" aria-hidden="true"></span>A analisar o site… o primeiro resultado aparece aqui dentro de instantes.</span>';
		box.hidden = false;
		var tries = 0;
		function next() {
			tries += 1;
			if (tries > 30) {
				box.hidden = true;
				return;
			}
			setTimeout(function () {
				fetch(base + encodeURIComponent(request))
					.then(function (res) {
						return res.json();
					})
					.then(function (data) {
						if (data && data.state === 'done' && data.summary) showResult(box, data.summary);
						else if (data && data.state === 'pending') next();
						else box.hidden = true;
					})
					.catch(function () {
						box.hidden = true;
					});
			}, tries <= 5 ? 3000 : 5000);
		}
		next();
	}

	function done(form, message, request) {
		if (window.dataLayer && typeof window.dataLayer.push === 'function') {
			window.dataLayer.push({ event: 'vnd_analise_gratis' });
		}
		var root = form.closest('[data-vnd-fa]') || form.parentNode;
		root.dispatchEvent(new CustomEvent('vnd-fa:sent', { bubbles: true }));
		var redirect = form.getAttribute('data-redirect');
		if (redirect) {
			window.location.assign(redirect);
			return;
		}
		var box = root.querySelector('.vnd-fa__success');
		if (!box) return;
		var text = box.querySelector('[data-success-text]');
		if (text && !text.textContent.trim() && message) text.textContent = message;
		form.hidden = true;
		box.hidden = false;
		box.focus();
		poll(form, box.querySelector('[data-result]'), request);
	}

	function send(form) {
		var data = {};
		var inputs = form.querySelectorAll('input[name]');
		for (var i = 0; i < inputs.length; i++) {
			if (inputs[i].type !== 'checkbox') data[inputs[i].name] = inputs[i].value.trim();
		}
		var consent = field(form, 'consent');
		data.consent = !!(consent && consent.checked);
		data.source = source();
		if (form.vndTurnstile) data.turnstile = form.vndTurnstile;

		var invalid = [];
		if (!data.website) invalid.push(['website', form.getAttribute('data-msg-website')]);
		if (!EMAIL.test(data.email || '')) invalid.push(['email', form.getAttribute('data-msg-email')]);
		if (!data.consent) invalid.push(['consent', form.getAttribute('data-msg-consent')]);
		if (invalid.length) {
			for (var j = 0; j < invalid.length; j++) setError(form, invalid[j][0], invalid[j][1]);
			var first = field(form, invalid[0][0]);
			if (first) first.focus();
			return;
		}
		if (form.querySelector('.vnd-fa__turnstile[data-sitekey]') && !form.vndTurnstile) {
			setStatus(form, 'Confirme que não é um robô (a caixa por cima do botão).');
			return;
		}

		var b = button(form);
		var label = b ? b.getAttribute('data-label') || b.textContent : '';
		form.setAttribute('aria-busy', 'true');
		if (b) {
			b.disabled = true;
			b.textContent = form.getAttribute('data-sending') || label;
		}
		function restore() {
			form.removeAttribute('aria-busy');
			if (b) {
				b.disabled = false;
				b.textContent = form.vndSiteWarning ? 'Enviar na mesma' : label;
			}
		}

		fetch(form.getAttribute('data-endpoint'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(data),
		})
			.then(function (res) {
				return res.json().catch(function () {
					return null;
				});
			})
			.then(function (body) {
				restore();
				if (body && body.ok) {
					done(form, body.message, body.request);
					return;
				}
				var errors = (body && body.errors) || {};
				var firstName = null;
				for (var name in errors) {
					if (!Object.prototype.hasOwnProperty.call(errors, name) || !field(form, name)) continue;
					setError(form, name, [].concat(errors[name])[0]);
					firstName = firstName || name;
				}
				if (firstName) field(form, firstName).focus();
				else setStatus(form, (body && body.message) || form.getAttribute('data-msg-error'));
				// O Turnstile só vale uma vez: pede outro.
				var t = form.querySelector('.vnd-fa__turnstile');
				if (t && window.turnstile && t.vndId) window.turnstile.reset(t.vndId);
				form.vndTurnstile = null;
			})
			.catch(function () {
				restore();
				setStatus(form, form.getAttribute('data-msg-network'));
			});
	}

	document.addEventListener('submit', function (event) {
		var form = event.target;
		if (!form || !form.matches || !form.matches('form[data-vnd-fa-form], form[data-vnd-fa-preview]')) return;
		event.preventDefault();
		if (form.hasAttribute('data-vnd-fa-preview') || form.getAttribute('aria-busy') === 'true') return;
		clear(form);
		var website = field(form, 'website');
		var url = website ? website.value.trim() : '';
		// Primeira vez com um site que não abre: avisa; à segunda envia na mesma.
		if (url && form.vndChecked !== url) {
			checkSite(form, url).then(function (ok) {
				if (ok) send(form);
			});
			return;
		}
		send(form);
	});

	// Ao sair do campo do site: confirma se abre.
	document.addEventListener(
		'blur',
		function (event) {
			var input = event.target;
			if (!input || input.name !== 'website' || !input.form || !input.form.hasAttribute('data-vnd-fa-form')) return;
			checkSite(input.form, input.value);
		},
		true,
	);

	// Ao corrigir um campo, o aviso desse campo desaparece.
	document.addEventListener('input', function (event) {
		var input = event.target;
		var form = input && input.form;
		if (!form || !form.hasAttribute('data-vnd-fa-form') || !input.name) return;
		if (input.name === 'website' && form.vndSiteWarning) {
			form.vndSiteWarning = false;
			form.vndChecked = null;
			setError(form, 'website', '');
			var b = button(form);
			if (b) b.textContent = b.getAttribute('data-label') || b.textContent;
		}
		if (input.getAttribute('aria-invalid') === 'true') setError(form, input.name, '');
	});
	document.addEventListener('change', function (event) {
		var input = event.target;
		var form = input && input.form;
		if (form && form.hasAttribute('data-vnd-fa-form') && input.name === 'consent' && input.checked) setError(form, 'consent', '');
	});

	/* ---------- Seguir o claro/escuro do site ---------- */
	function luminance(color) {
		var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(color || '');
		if (!m) return null;
		var alpha = m[4] == null ? 1 : parseFloat(m[4]) / (m[4].indexOf('%') > -1 ? 100 : 1);
		if (alpha < 0.5) return null;
		return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
	}
	/* Fundo sem cor sólida (imagem ou degradê): o texto do site diz se é claro (texto escuro) ou escuro. */
	function fromTextColor(node) {
		var t = luminance(window.getComputedStyle(node).color);
		return t === null ? null : 1 - t;
	}
	function backgroundOf(el) {
		for (var node = el.parentElement; node; node = node.parentElement) {
			var style = window.getComputedStyle(node);
			var l = luminance(style.backgroundColor);
			if (l !== null) return l;
			if (style.backgroundImage && style.backgroundImage !== 'none') return fromTextColor(node);
		}
		var root = luminance(window.getComputedStyle(document.documentElement).backgroundColor);
		return root !== null ? root : document.body ? fromTextColor(document.body) : null;
	}
	function followSite() {
		var roots = document.querySelectorAll('.vnd-fa--site');
		for (var i = 0; i < roots.length; i++) {
			var l = backgroundOf(roots[i]);
			if (l !== null) roots[i].classList.toggle('vnd-fa--is-light', l > 0.55);
		}
	}

	/* ---------- A ilustração larga, quando a moldura é bem larga ---------- */
	function pickIllustration(img) {
		var wide = img.getAttribute('data-wide');
		var box = img.parentElement;
		if (!wide || !box || !box.clientHeight) return;
		if (!img.getAttribute('data-narrow')) img.setAttribute('data-narrow', img.getAttribute('src'));
		var useWide = box.clientWidth / box.clientHeight >= 2.4;
		var src = useWide ? wide : img.getAttribute('data-narrow');
		if (img.getAttribute('src') !== src) img.setAttribute('src', src);
	}

	function init() {
		renderTurnstile();
		followSite();
		var imgs = document.querySelectorAll('.vnd-fa__image[data-wide]');
		if (window.ResizeObserver) {
			var ro = new ResizeObserver(function (entries) {
				for (var i = 0; i < entries.length; i++) {
					var img = entries[i].target.querySelector('.vnd-fa__image[data-wide]');
					if (img) pickIllustration(img);
				}
			});
			for (var i = 0; i < imgs.length; i++) ro.observe(imgs[i].parentElement);
		} else {
			for (var j = 0; j < imgs.length; j++) pickIllustration(imgs[j]);
		}
		if (document.querySelector('.vnd-fa--site')) watchSiteTheme();
		animateIn();
		countViews();
	}

	/* ---------- Quantas pessoas veem o formulário (uma vez por dia cada) ----------
	   Na plataforma: Definições → Formulário do site → vistas, pedidos e a percentagem. */
	function countViews() {
		var forms = document.querySelectorAll('form[data-vnd-fa-form]');
		if (!forms.length || !navigator.sendBeacon || !window.IntersectionObserver) return;
		var today = new Date().toISOString().slice(0, 10);
		function send(form) {
			var action = form.getAttribute('action') || '';
			if (!/^https?:\/\//.test(action)) return;
			var key = 'vnd_fa_view_' + action.replace(/[^\w]/g, '').slice(-40);
			try {
				if (window.localStorage.getItem(key) === today) return;
				window.localStorage.setItem(key, today);
			} catch (e) {
				/* sem armazenamento: conta na mesma */
			}
			try {
				navigator.sendBeacon(action + '/vista', new Blob([JSON.stringify({ page: window.location.href.slice(0, 500) })], { type: 'text/plain' }));
			} catch (e) {
				/* não conta */
			}
		}
		var io = new IntersectionObserver(function (entries) {
			for (var i = 0; i < entries.length; i++) {
				if (entries[i].isIntersecting) {
					io.unobserve(entries[i].target);
					send(entries[i].target);
				}
			}
		}, { threshold: 0.3 });
		for (var f = 0; f < forms.length; f++) io.observe(forms[f]);
	}

	/* ---------- Animações ao entrar no ecrã (como o site) ---------- */
	var REVEAL = '.vnd-fa__media, .vnd-fa__eyebrow, .vnd-fa__promo-title, .vnd-fa__promo-text, .vnd-fa__points li, .vnd-fa__note, ' +
		'.vnd-fa__title, .vnd-fa__intro, .vnd-fa__form > .vnd-fa__field, .vnd-fa__form > .vnd-fa__row, .vnd-fa__form > .vnd-fa__consent, ' +
		'.vnd-fa__form > .vnd-fa__button, .vnd-fa__form > .vnd-fa__example';
	function animateIn() {
		var roots = document.querySelectorAll('.vnd-fa--animate:not(.vnd-fa--anim-ready)');
		if (!roots.length || !window.IntersectionObserver) return;
		if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// Como no site: cada vez que um elemento entra no ecrã (a descer ou a subir) volta a animar;
		// quando sai por completo, fica outra vez escondido à espera da próxima entrada.
		function outOfView(el) {
			var b = el.getBoundingClientRect();
			return b.bottom <= 0 || b.top >= (window.innerHeight || document.documentElement.clientHeight);
		}
		function hide(el) {
			el.classList.remove('is-in');
			el.style.removeProperty('--vnd-fa-in-delay');
		}
		var io = new IntersectionObserver(function (entries) {
			// Os que aparecem juntos entram um a seguir ao outro (pela ordem da página).
			var shown = [];
			for (var i = 0; i < entries.length; i++) {
				var e = entries[i], el = e.target;
				if (e.isIntersecting && e.intersectionRatio >= 0.1) {
					if (!el.classList.contains('is-in')) shown.push(el);
				} else if (!e.isIntersecting && el.classList.contains('is-in') && !el.vndFaAnimating) {
					hide(el);
				}
			}
			for (var j = 0; j < shown.length; j++) {
				shown[j].style.setProperty('--vnd-fa-in-delay', Math.min(j * 0.08, 0.6) + 's');
				shown[j].vndFaAnimating = true;
				shown[j].classList.add('is-in');
			}
		}, { threshold: [0, 0.1], rootMargin: '0px 0px -5% 0px' });
		// Durante a animação o elemento começa mais abaixo (pode estar "fora" por instantes):
		// só no fim se decide se saiu mesmo do ecrã.
		function onAnimEnd(ev) {
			var el = ev.currentTarget;
			if (ev.target !== el) return;
			el.vndFaAnimating = false;
			if (outOfView(el)) hide(el);
		}
		for (var r = 0; r < roots.length; r++) {
			var items = roots[r].querySelectorAll(REVEAL);
			for (var k = 0; k < items.length; k++) {
				items[k].setAttribute('data-vnd-fa-in', '');
				items[k].addEventListener('animationend', onAnimEnd);
				items[k].addEventListener('animationcancel', onAnimEnd);
				io.observe(items[k]);
			}
			roots[r].classList.add('vnd-fa--anim-ready');
		}
	}

	/* O botão ☀ do site muda classes/atributos do <html>, do <body> ou de uma secção (Bricks):
	   volta a ver a cor — logo, e outra vez no fim de uma transição de cor (até ~1,5 s). */
	var followTimers = [];
	function followSoon() {
		for (var t = 0; t < followTimers.length; t++) clearTimeout(followTimers[t]);
		window.requestAnimationFrame(followSite);
		followTimers = [150, 450, 900, 1600].map(function (ms) {
			return setTimeout(followSite, ms);
		});
	}
	function watchSiteTheme() {
		if (window.MutationObserver) {
			var mo = new MutationObserver(function (records) {
				for (var r = 0; r < records.length; r++) {
					var target = records[r].target;
					// As mudanças dentro do próprio formulário (erros, botão) não contam.
					if (target.closest && target.closest('.vnd-fa')) continue;
					followSoon();
					return;
				}
			});
			mo.observe(document.documentElement, {
				attributes: true,
				subtree: true,
				attributeFilter: ['class', 'style', 'data-theme', 'data-mode', 'data-color-scheme', 'data-bs-theme'],
			});
		}
		// O fim de uma transição de cor no site e o claro/escuro do computador.
		document.addEventListener('transitionend', function (event) {
			if (/color|background/.test(event.propertyName || '') && !(event.target.closest && event.target.closest('.vnd-fa'))) followSite();
		}, true);
		if (window.matchMedia) {
			var mq = window.matchMedia('(prefers-color-scheme: dark)');
			if (mq.addEventListener) mq.addEventListener('change', followSoon);
		}
		// Temas que aplicam a cor guardada só depois de a página carregar.
		window.addEventListener('load', followSoon);
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
