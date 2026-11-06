/* VNDesign — Análise grátis do site: envia o pedido sem sair da página. */
(function () {
	'use strict';

	var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function field(form, name) {
		return form.querySelector('[name="' + name + '"]');
	}

	function setError(form, name, message) {
		var input = field(form, name);
		var box = form.querySelector('[data-error-for="' + name + '"]');
		if (input) {
			if (message) input.setAttribute('aria-invalid', 'true');
			else input.removeAttribute('aria-invalid');
		}
		if (box) {
			box.textContent = message || '';
			box.hidden = !message;
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
		for (var i = 0; i < boxes.length; i++) setError(form, boxes[i].getAttribute('data-error-for'), '');
		setStatus(form, '');
	}

	function done(form, message) {
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
	}

	document.addEventListener('submit', function (event) {
		var form = event.target;
		if (!form || !form.matches || !form.matches('form[data-vnd-fa-form], form[data-vnd-fa-preview]')) return;
		event.preventDefault();
		if (form.hasAttribute('data-vnd-fa-preview') || form.getAttribute('aria-busy') === 'true') return;
		clear(form);

		var data = {};
		var inputs = form.querySelectorAll('input[name]');
		for (var i = 0; i < inputs.length; i++) {
			if (inputs[i].type !== 'checkbox') data[inputs[i].name] = inputs[i].value.trim();
		}
		var consent = field(form, 'consent');
		data.consent = !!(consent && consent.checked);

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

		var button = form.querySelector('.vnd-fa__button');
		var label = button ? button.textContent : '';
		form.setAttribute('aria-busy', 'true');
		if (button) {
			button.disabled = true;
			button.textContent = form.getAttribute('data-sending') || label;
		}
		function restore() {
			form.removeAttribute('aria-busy');
			if (button) {
				button.disabled = false;
				button.textContent = label;
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
					done(form, body.message);
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
			})
			.catch(function () {
				restore();
				setStatus(form, form.getAttribute('data-msg-network'));
			});
	});

	// Ao corrigir um campo, o aviso desse campo desaparece.
	document.addEventListener('input', function (event) {
		var input = event.target;
		var form = input && input.form;
		if (!form || !form.hasAttribute('data-vnd-fa-form') || !input.name) return;
		if (input.getAttribute('aria-invalid') === 'true') setError(form, input.name, '');
	});
	document.addEventListener('change', function (event) {
		var input = event.target;
		var form = input && input.form;
		if (form && form.hasAttribute('data-vnd-fa-form') && input.name === 'consent' && input.checked) setError(form, 'consent', '');
	});
})();
