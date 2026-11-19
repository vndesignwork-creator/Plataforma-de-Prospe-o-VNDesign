/**
 * Avisa a plataforma quando um lead (quem chegou por um link de um email,
 * com ?vnd=CÓDIGO) está no site. O código fica num cookie de 60 dias, no
 * browser dessa pessoa; de mais ninguém se guarda ou envia nada.
 */
(function () {
	var config = window.VND_FA_VISITS;
	if (!config || !config.endpoint) {
		return;
	}
	var NAME = 'vnd_lead';
	var VALID = /^[A-Za-z0-9_-]{16,64}$/;

	function readCookie() {
		var parts = (document.cookie || '').split(';');
		for (var i = 0; i < parts.length; i++) {
			var pair = parts[i].replace(/^\s+/, '');
			if (pair.indexOf(NAME + '=') === 0) {
				return pair.slice(NAME.length + 1);
			}
		}
		return '';
	}

	function writeCookie(value) {
		var secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = NAME + '=' + value + '; Max-Age=5184000; Path=/; SameSite=Lax' + secure;
	}

	var fromUrl = '';
	try {
		fromUrl = new URLSearchParams(location.search).get('vnd') || '';
	} catch (e) {
		fromUrl = '';
	}
	if (fromUrl && VALID.test(fromUrl)) {
		writeCookie(fromUrl);
	}
	var lead = VALID.test(fromUrl) ? fromUrl : readCookie();
	if (!VALID.test(lead)) {
		return;
	}

	var body = JSON.stringify({ lead: lead, page: location.href, referrer: document.referrer || null });
	try {
		if (navigator.sendBeacon) {
			navigator.sendBeacon(config.endpoint, new Blob([body], { type: 'application/json' }));
			return;
		}
	} catch (e) {
		// segue pelo fetch
	}
	if (window.fetch) {
		fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, mode: 'no-cors' }).catch(function () {});
	}
})();
